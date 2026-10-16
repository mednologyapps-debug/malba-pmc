"""LMS integration: real HTTP, disposable DB, private resources and certificate eligibility."""
import copy,http.client,io,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import cms_server as cms
import lms
import test_cms as cms_tests

class LMSIntegrationTests(unittest.TestCase):
    setUp=cms_tests.CMSIntegrationTests.setUp
    tearDown=cms_tests.CMSIntegrationTests.tearDown
    call=cms_tests.CMSIntegrationTests.call
    login=cms_tests.CMSIntegrationTests.login
    def fixture(self):
        self.login();self.admin=(self.cookie,self.csrf);password=lms.seed_demo(cms)
        with cms.connect() as db:
            self.student=dict(db.execute('SELECT * FROM lms_students').fetchone());self.course=json.loads(db.execute('SELECT published FROM lms_courses').fetchone()[0])
        self.cookie='';self.csrf=''
        status,_,headers=self.call('/api/lms/login',{'email':'ALUMNO.DEMO@MALBA.TEST','password':password});self.assertEqual(status,200)
        self.cookie=headers['Set-Cookie'].split(';')[0];self.csrf=self.call('/api/lms/session')[1]['csrf']
        self.assertEqual(self.call('/api/lms/me')[0],403)
        status,result,_=self.call('/api/lms/password',{'currentPassword':password,'password':'My-personal-password-2026!'});self.assertEqual(status,200,result)
        self.learner=(self.cookie,self.csrf)
    def as_admin(self):self.cookie,self.csrf=self.admin
    def as_student(self):self.cookie,self.csrf=self.learner
    def raw(self,path,body=None,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        request_headers={'Cookie':self.cookie,'X-CSRF-Token':self.csrf,**(headers or {})}
        c.request('GET' if body is None else 'POST',path,body,request_headers);r=c.getresponse();data=r.read();result=(r.status,data,dict(r.getheaders()));c.close();return result
    def complete(self):
        result=None
        for lesson in lms.lessons(self.course):
            status,result,_=self.call('/api/lms/progress',{'courseId':self.course['id'],'lessonId':lesson['id'],'completed':True});self.assertEqual(status,200,result)
        return result
    def test_access_progress_pdf_verification_and_immutable_certificate(self):
        self.assertEqual(self.call('/api/lms/me')[0],401);self.fixture()
        first=lms.lessons(self.course)[0]
        self.assertEqual(self.call('/api/lms/progress',{'courseId':self.course['id'],'lessonId':first['id'],'completed':True},csrf=False)[0],403)
        first_result=self.call('/api/lms/progress',{'courseId':self.course['id'],'lessonId':first['id'],'completed':True})[1]
        self.assertEqual(first_result['progress']['percent'],50);self.assertIsNone(first_result['certificate'])
        completed=self.complete();self.assertEqual(completed['progress']['percent'],100);code=completed['certificate']['id']
        self.assertEqual(self.complete()['certificate']['id'],code)
        status,pdf,_=self.raw('/api/lms/certificate/'+code+'.pdf');self.assertEqual(status,200);self.assertTrue(pdf.startswith(b'%PDF-'))
        from pypdf import PdfReader
        content=PdfReader(io.BytesIO(pdf)).pages[0].extract_text();self.assertIn('Alumno de demostración',content);self.assertIn('Curso de demostración',content)
        self.as_admin();records=self.call('/api/lms/admin')[1];course=records['courses'][0];course['draft']['title']='Curso con título actualizado'
        self.assertEqual(self.call('/api/lms/admin/course/save',{'course':course['draft'],'revision':course['revision'],'publish':True})[0],200)
        self.as_student();_,after,_=self.raw('/api/lms/certificate/'+code+'.pdf');self.assertIn('Curso de demostración',PdfReader(io.BytesIO(after)).pages[0].extract_text())
        self.cookie='';status,verified,_=self.call('/api/lms/verify?code='+code);self.assertEqual(status,200);self.assertNotIn('email',verified)
        self.assertEqual(self.raw('/api/lms/certificate/'+code+'.pdf')[0],401)
        self.as_admin();self.call('/api/lms/admin/certificate/revoke',{'id':code});self.assertEqual(self.call('/api/lms/verify?code='+code)[0],404)
    def test_private_materials_drafts_range_and_enrollment_revocation(self):
        self.fixture();self.as_admin();course=self.call('/api/lms/admin')[1]['courses'][0]
        raw=b'%PDF-1.4\nPrivate lesson material\n%%EOF';headers={'X-Course-Id':self.course['id'],'X-File-Name':'Material.pdf','Content-Type':'application/octet-stream'}
        status,result,_=self.raw('/api/lms/admin/upload',raw,headers);self.assertEqual(status,200,result);file=json.loads(result)
        course['draft']['modules'][0]['lessons'][0]['resources'].append({'fileId':file['fileId'],'name':'Material privado','url':''})
        self.assertEqual(self.call('/api/lms/admin/course/save',{'course':course['draft'],'revision':course['revision']})[0],200)
        self.as_student();fileurl='/api/lms/files/'+file['fileId'];self.assertEqual(self.raw(fileurl)[0],403)
        self.assertFalse(self.call('/api/lms/me')[1]['courses'][0]['course']['modules'][0]['lessons'][0]['resources'])
        self.as_admin();self.assertIn('Material privado',self.call('/api/lms/admin/preview?course='+self.course['id'])[1]['course']['modules'][0]['lessons'][0]['resources'][0]['name'])
        self.assertEqual(self.call('/api/lms/admin/course/save',{'course':course['draft'],'revision':course['revision'],'publish':True})[0],409)
        self.assertEqual(self.call('/api/lms/admin/course/save',{'course':course['draft'],'revision':course['revision']+1,'publish':True})[0],200)
        self.as_student();status,download,h=self.raw(fileurl);self.assertEqual(status,200);self.assertEqual(download,raw);self.assertIn('no-store',h['Cache-Control'])
        status,partial,h=self.raw(fileurl,headers={'Range':'bytes=0-4'});self.assertEqual(status,206);self.assertEqual(partial,b'%PDF-');self.assertEqual(h['Content-Range'],f'bytes 0-4/{len(raw)}')
        self.assertEqual(self.raw(fileurl,headers={'Range':'bytes=999999-'})[0],416)
        self.assertEqual(self.call('/api/lms/admin')[0],401)
        self.as_admin();self.call('/api/lms/admin/enroll',{'studentId':self.student['id'],'courseId':self.course['id'],'active':False})
        self.as_student();self.assertEqual(self.raw(fileurl)[0],403);self.assertEqual(self.call('/api/lms/me')[1]['courses'],[])
        self.assertEqual(self.call('/api/lms/progress',{'courseId':self.course['id'],'lessonId':lms.lessons(self.course)[0]['id'],'completed':True})[0],403)
        self.cookie='';self.assertEqual(self.raw(fileurl)[0],401)
    def test_student_isolation_expiry_and_temporal_password_reset(self):
        self.fixture();self.as_admin();other=self.call('/api/lms/admin/student',{'name':'Otro alumno','email':'otro@example.com','password':'Other-password-2026!','active':True})[1]['id']
        self.assertEqual(self.call('/api/lms/admin/student',{'name':'Duplicado','email':'OTRO@example.com','password':'Other-password-2026!'})[0],400)
        self.call('/api/lms/admin/enroll',{'studentId':self.student['id'],'courseId':self.course['id'],'expires':'2000-01-01','active':True})
        self.as_student();self.assertFalse(self.call('/api/lms/me')[1]['courses'])
        self.as_admin();self.call('/api/lms/admin/enroll',{'studentId':self.student['id'],'courseId':self.course['id'],'active':True});self.as_student();code=self.complete()['certificate']['id']
        self.cookie='';status,_,headers=self.call('/api/lms/login',{'email':'otro@example.com','password':'Other-password-2026!'});self.cookie=headers['Set-Cookie'].split(';')[0];self.csrf=self.call('/api/lms/session')[1]['csrf'];self.call('/api/lms/password',{'currentPassword':'Other-password-2026!','password':'Another-new-password-2026!'})
        self.assertEqual(self.raw('/api/lms/certificate/'+code+'.pdf')[0],403)
        self.assertEqual(self.call('/api/lms/progress',{'courseId':self.course['id'],'lessonId':lms.lessons(self.course)[0]['id'],'completed':True})[0],403)
        self.as_admin();self.call('/api/lms/admin/student',{'id':self.student['id'],'name':self.student['name'],'email':self.student['email'],'active':True,'password':'Reset-password-2026!'})
        self.as_student();self.assertFalse(self.call('/api/lms/session')[1]['authenticated'])
    def test_full_demo_materials_quiz_and_certificate_are_ready_without_resetting_account(self):
        from lms_demo import seed,COURSE_ID
        self.fixture()
        with cms.connect() as db:before=db.execute('SELECT hash FROM lms_students WHERE id=?',(self.student['id'],)).fetchone()[0]
        self.assertIsNone(seed(cms));self.assertIsNone(seed(cms))
        with cms.connect() as db:self.assertEqual(before,db.execute('SELECT hash FROM lms_students WHERE id=?',(self.student['id'],)).fetchone()[0])
        courses=self.call('/api/lms/me')[1]['courses'];demo=next(c for c in courses if c['course']['id']==COURSE_ID)
        self.assertEqual(demo['progress']['percent'],100);self.assertEqual(demo['progress']['total'],6);self.assertIsNotNone(demo['certificate'])
        quiz=next(l for l in lms.lessons(demo['course']) if l['type']=='quiz')
        self.assertEqual(quiz['quiz']['lastAttempt']['score'],100)
        for q in quiz['quiz']['questions']:self.assertNotIn('correct',q);self.assertNotIn('explanation',q)
        materials=[r for l in lms.lessons(demo['course']) for r in l['resources']]
        self.assertEqual(len(materials),5)
        for r in materials:
            status,content,_=self.raw('/api/lms/files/'+r['fileId']);self.assertEqual(status,200)
            if r['name'].endswith('.pdf'):self.assertTrue(content.startswith(b'%PDF-'))
            elif r['name'].endswith('.zip'):self.assertTrue(content.startswith(b'PK'))
        status,content,_=self.raw('/api/lms/certificate/'+demo['certificate']['id']+'.pdf');self.assertEqual(status,200)
        from pypdf import PdfReader
        self.assertIn('sin validez académica',' '.join(PdfReader(io.BytesIO(content)).pages[0].extract_text().split()))
        self.assertEqual(self.call('/api/lms/progress',{'courseId':COURSE_ID,'lessonId':quiz['id'],'completed':True})[0],400)
        # A fresh enrolment cannot bypass the graded test using a claimed percentage.
        self.as_admin();body={'name':'Alumno del test','email':'quiz@example.com','password':'Quiz-temporary-2026!','active':True}
        student_id=self.call('/api/lms/admin/student',body)[1]['id'];self.call('/api/lms/admin/enroll',{'studentId':student_id,'courseId':COURSE_ID,'active':True})
        self.cookie='';self.csrf='';_,_,headers=self.call('/api/lms/login',{'email':body['email'],'password':body['password']});self.cookie=headers['Set-Cookie'].split(';')[0];self.csrf=self.call('/api/lms/session')[1]['csrf']
        self.call('/api/lms/password',{'currentPassword':body['password'],'password':'Quiz-personal-2026!'})
        payload={'courseId':COURSE_ID,'lessonId':quiz['id'],'answers':[2,2,0,1],'score':100,'passed':True}
        result=self.call('/api/lms/quiz',payload)[1];self.assertEqual(result['score'],0);self.assertFalse(result['passed']);self.assertEqual(result['progress']['percent'],0)
        self.assertEqual(self.call('/api/lms/quiz',{**payload,'answers':[0]})[0],400)
        result=self.call('/api/lms/quiz',{**payload,'answers':[0,1,2,0]})[1];self.assertTrue(result['passed']);self.assertIsNone(result['certificate'])
        for lesson in lms.lessons(demo['course']):
            if lesson['type']!='quiz':self.call('/api/lms/progress',{'courseId':COURSE_ID,'lessonId':lesson['id'],'completed':True})
        complete=next(x for x in self.call('/api/lms/me')[1]['courses'] if x['course']['id']==COURSE_ID)
        self.assertEqual(complete['progress']['percent'],100);self.assertIsNotNone(complete['certificate'])

    def test_material_previews_are_private_and_demo_upgrade_preserves_changes(self):
        from lms_demo import seed,COURSE_ID,OLD_BODIES
        self.fixture();seed(cms)
        courses=self.call('/api/lms/me')[1]['courses'];demo=next(x for x in courses if x['course']['id']==COURSE_ID)
        self.assertIn('alcance',demo['course']['introduction'])
        materials=[r for l in lms.lessons(demo['course']) for r in l['resources']]
        for kind in ['pdf','image']:
            material=next(r for r in materials if r['previewKind']==kind)
            path='/api/lms/files/'+material['fileId']
            status,body,headers=self.raw(path+'?preview=1');self.assertEqual(status,200)
            self.assertTrue(headers['Content-Disposition'].startswith('inline;'))
            self.assertEqual(headers['X-Frame-Options'],'SAMEORIGIN')
            self.assertIn('no-store',headers['Cache-Control'])
            self.assertTrue(self.raw(path)[2]['Content-Disposition'].startswith('attachment;'))
            if kind=='pdf':
                rendered,png,png_headers=self.raw(path+'?render=1&page=1')
                self.assertEqual(rendered,200);self.assertTrue(png.startswith(b'\x89PNG'));self.assertEqual(png_headers['X-PDF-Pages'],'1')
                self.assertEqual(self.raw(path+'?render=1&page=2')[0],400)
                self.assertTrue(self.raw(path+'?render=1&page=1&thumb=1')[1].startswith(b'\x89PNG'))
            cookie=self.cookie;self.cookie='';self.assertEqual(self.raw(path+'?preview=1')[0],401);self.assertEqual(self.raw(path+'?render=1&page=1')[0],401);self.cookie=cookie
        # Mimic the earlier installed demo. Update only its shipped text, not admin changes.
        with cms.connect() as db:
            row=db.execute('SELECT draft,published,revision FROM lms_courses WHERE id=?',(COURSE_ID,)).fetchone()
            draft=json.loads(row['draft']);published=json.loads(row['published'])
            for c in [draft,published]:
                c.pop('introduction',None)
                for lesson in lms.lessons(c):
                    if lesson['id']=='demo-lesson-bienvenida':
                        lesson['body']=OLD_BODIES[lesson['id']];lesson['resources']=[r for r in lesson['resources'] if not r['name'].endswith('.webp')]
            draft['description']='Descripción privada del administrador';draft['modules'][1]['lessons'][0]['body']='Introducción personalizada del administrador'
            db.execute('UPDATE lms_courses SET draft=?,published=? WHERE id=?',(cms.dump(draft),cms.dump(published),COURSE_ID))
        seed(cms)
        with cms.connect() as db:
            upgraded=db.execute('SELECT * FROM lms_courses WHERE id=?',(COURSE_ID,)).fetchone();d=json.loads(upgraded['draft'])
            self.assertEqual(d['description'],'Descripción privada del administrador');self.assertEqual(d['modules'][1]['lessons'][0]['body'],'Introducción personalizada del administrador')
            self.assertTrue(d['introduction']);self.assertNotEqual(d['modules'][0]['lessons'][0]['body'],OLD_BODIES['demo-lesson-bienvenida'])
            revision=upgraded['revision']
        seed(cms)
        with cms.connect() as db:self.assertEqual(db.execute('SELECT revision FROM lms_courses WHERE id=?',(COURSE_ID,)).fetchone()[0],revision)
        after=next(x for x in self.call('/api/lms/me')[1]['courses'] if x['course']['id']==COURSE_ID)
        self.assertEqual(after['progress']['percent'],100);self.assertEqual(after['certificate']['id'],demo['certificate']['id'])
        self.as_admin();self.call('/api/lms/admin/enroll',{'studentId':self.student['id'],'courseId':COURSE_ID,'active':False})
        self.as_student();self.assertEqual(self.raw('/api/lms/files/'+materials[0]['fileId']+'?preview=1')[0],403)

    def test_pdf_preview_pagination_and_private_image_upload(self):
        self.fixture();self.as_admin();record=self.call('/api/lms/admin')[1]['courses'][0]
        from reportlab.pdfgen import canvas
        stream=io.BytesIO();pdf=canvas.Canvas(stream);pdf.drawString(50,700,'Primera pagina');pdf.showPage();pdf.drawString(50,700,'Segunda pagina');pdf.save()
        headers={'X-Course-Id':self.course['id'],'X-File-Name':'dos-paginas.pdf','Content-Type':'application/octet-stream'}
        status,result,_=self.raw('/api/lms/admin/upload',stream.getvalue(),headers);self.assertEqual(status,200);file_id=json.loads(result)['fileId']
        image=(cms.ROOT/'assets/programs/pmo-960.webp').read_bytes()
        status,result,_=self.raw('/api/lms/admin/upload',image,{**headers,'X-File-Name':'imagen.webp'});self.assertEqual(status,200);image_id=json.loads(result)['fileId']
        self.assertEqual(self.raw('/api/lms/admin/upload',b'not-an-image',{**headers,'X-File-Name':'imagen.jpg'})[0],400)
        record['draft']['modules'][0]['lessons'][0]['resources']=[{'name':'Documento sin extensión en el nombre','fileId':file_id,'url':''},{'name':'Fotografía de apoyo','fileId':image_id,'url':''}]
        self.call('/api/lms/admin/course/save',{'course':record['draft'],'revision':record['revision'],'publish':True})
        self.as_student();resources=self.call('/api/lms/me')[1]['courses'][0]['course']['modules'][0]['lessons'][0]['resources']
        self.assertEqual(resources[0]['previewKind'],'pdf');self.assertEqual(resources[1]['previewKind'],'image')
        status,content,headers=self.raw('/api/lms/files/'+file_id+'?render=1&page=2');self.assertEqual(status,200);self.assertTrue(content.startswith(b'\x89PNG'));self.assertEqual(headers['X-PDF-Pages'],'2');self.assertEqual(headers['X-PDF-Page'],'2')
        self.assertEqual(self.raw('/api/lms/files/'+file_id+'?render=1&page=3')[0],400)
        self.assertTrue(self.raw('/api/lms/files/'+image_id+'?preview=1')[2]['Content-Disposition'].startswith('inline;'))

    def test_private_mp4_streaming_and_certificates_survive_course_expiry(self):
        self.fixture();self.as_admin();record=self.call('/api/lms/admin')[1]['courses'][0]
        data=b'\x00\x00\x00\x18ftypmp42'+b'\x00'*64
        headers={'X-Course-Id':self.course['id'],'X-File-Name':'clase.mp4','Content-Type':'application/octet-stream'}
        status,raw,_=self.raw('/api/lms/admin/upload',data,headers);self.assertEqual(status,200,raw);fid=json.loads(raw)['fileId']
        record['draft']['modules'][0]['lessons'][0].update(type='video',videoFileId=fid)
        self.assertEqual(self.call('/api/lms/admin/course/save',{'course':record['draft'],'revision':record['revision'],'publish':True})[0],200)
        self.as_student();status,chunk,h=self.raw('/api/lms/files/'+fid,headers={'Range':'bytes=-8'})
        self.assertEqual(status,206);self.assertEqual(chunk,data[-8:]);self.assertEqual(h['Content-Type'],'video/mp4')
        code=self.complete()['certificate']['id']
        self.as_admin();self.call('/api/lms/admin/enroll',{'studentId':self.student['id'],'courseId':self.course['id'],'expires':'2000-01-01','active':True})
        self.as_student();me=self.call('/api/lms/me')[1];self.assertFalse(me['courses']);self.assertEqual(me['certificates'][0]['id'],code)
        self.assertEqual(self.raw('/api/lms/certificate/'+code+'.pdf')[0],200)
        self.assertEqual(self.raw('/api/lms/files/'+fid)[0],403)

    def test_validation_preview_publish_and_restart_preserve_learning_records(self):
        self.fixture();self.as_admin();record=self.call('/api/lms/admin')[1]['courses'][0];draft=copy.deepcopy(record['draft']);draft['modules'][0]['lessons'][0].update(type='video',videoUrl='javascript:alert(1)')
        self.assertEqual(self.call('/api/lms/admin/course/save',{'course':draft,'revision':record['revision'],'publish':True})[0],400)
        draft['modules'][0]['lessons'][0]['videoUrl']='';self.assertEqual(self.call('/api/lms/admin/course/save',{'course':draft,'revision':record['revision'],'publish':True})[0],400)
        # Incomplete media can be saved privately while the published text remains accessible.
        self.assertEqual(self.call('/api/lms/admin/course/save',{'course':draft,'revision':record['revision']})[0],200)
        self.as_student();self.assertEqual(self.call('/api/lms/me')[1]['courses'][0]['course']['modules'][0]['lessons'][0]['type'],'text')
        lid=lms.lessons(self.course)[0]['id'];self.call('/api/lms/progress',{'courseId':self.course['id'],'lessonId':lid,'completed':True});cms.initialize()
        self.assertEqual(self.call('/api/lms/me')[1]['courses'][0]['progress']['percent'],50)
        self.assertEqual(self.call('/api/lms/progress',{'courseId':self.course['id'],'lessonId':'made-up-lesson-id','completed':True})[0],400)
        self.as_admin();status,pdf,_=self.raw('/api/lms/admin/certificate-preview?course='+self.course['id']);self.assertEqual(status,200);self.assertTrue(pdf.startswith(b'%PDF'))
        self.assertEqual(self.call('/.cms-private/lms-files/anything.pdf')[0],404)

if __name__=='__main__':unittest.main()
