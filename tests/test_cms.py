"""Integration checks use a disposable site/database; no production credentials."""
import base64, copy, http.client, importlib, io, json, shutil, sys, tempfile, threading, unittest, zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import cms_server as cms

class CMSIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)/'site'
        self.oldroot,self.oldstate,self.oldrenderer=cms.ROOT,cms.STATE,cms.renderer.ROOT
        shutil.copytree(cms.ROOT,self.root,ignore=shutil.ignore_patterns('.git','.cms-private','docs','__pycache__','uploads'))
        cms.ROOT=cms.renderer.ROOT=self.root;cms.STATE=Path(self.tmp.name)/'private';cms.ATTEMPTS.clear()
        cms.initialize('test-admin','Only-tests-password-2026!')
        self.server=cms.ThreadingHTTPServer(('127.0.0.1',0),cms.Handler);self.server.secure_cookie=False
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.cookie='';self.csrf=''
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
        cms.ROOT,cms.STATE,cms.renderer.ROOT=self.oldroot,self.oldstate,self.oldrenderer
        self.tmp.cleanup()
    def call(self,path,body=None,csrf=True,origin=None):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        headers={'Cookie':self.cookie}
        if body is not None:headers['Content-Type']='application/json'
        if csrf:headers['X-CSRF-Token']=self.csrf
        if origin:headers['Origin']=origin
        c.request('POST' if body is not None else 'GET',path,json.dumps(body) if body is not None else None,headers)
        r=c.getresponse();status=r.status;raw=r.read();responseheaders=dict(r.getheaders());c.close()
        result=json.loads(raw) if responseheaders.get('Content-Type','').startswith('application/json') else raw.decode(errors='replace')
        return status,result,responseheaders
    def login(self):
        s,r,h=self.call('/api/login',{'username':'test-admin','password':'Only-tests-password-2026!'})
        self.assertEqual(s,200);self.cookie=h['Set-Cookie'].split(';')[0];self.csrf=r['csrf']
        self.assertIn('HttpOnly',h['Set-Cookie']);self.assertIn('SameSite=Strict',h['Set-Cookie'])
    def test_protection_csrf_origin_and_private_paths(self):
        self.assertEqual(self.call('/api/content')[0],401)
        self.assertEqual(self.call('/api/login',{'username':'test-admin','password':'wrong'})[0],401)
        self.assertEqual(self.call('/api/login',{},origin='https://evil.example')[0],403)
        for path in ['/.cms-private/cms.sqlite3','/scripts/cms_server.py','/assets/../.cms-private/cms.sqlite3','/assets/%2e%2e/scripts/cms_server.py']:
            self.assertEqual(self.call(path)[0],404)
        self.login();d=self.call('/api/content')[1]
        self.assertEqual(self.call('/api/draft',{'data':d['data'],'revision':d['revision']},csrf=False)[0],403)
        self.assertEqual(self.call('/api/logout',{})[0],200)
        self.assertEqual(self.call('/api/content')[0],401)
    def test_draft_preview_atomic_publish_history_restore_and_restart(self):
        self.login();d=self.call('/api/content')[1];data=d['data'];data['academy']['title']='CMS publicación de prueba'
        data['programs'][0]['title']='Programa <script>alert(1)</script>'
        body={'data':data,'revision':d['revision']}
        status,saved,_=self.call('/api/draft',body);self.assertEqual(status,200)
        self.assertNotIn('CMS publicación de prueba',self.call('/academia/')[1])
        self.assertEqual(self.call('/api/draft',body)[0],409)
        body['revision']=saved['revision'];status,preview,_=self.call('/api/preview',body);self.assertEqual(status,200)
        text=self.call(preview['url'])[1];self.assertIn('CMS publicación de prueba',text);self.assertIn('&lt;script&gt;',text)
        public_cookie=self.cookie;self.cookie='';self.assertEqual(self.call(preview['url'])[0],401);self.cookie=public_cookie
        status,published,_=self.call('/api/publish',body);self.assertEqual(status,200)
        self.assertIn('CMS publicación de prueba',self.call('/academia/')[1]);self.assertEqual(len(self.call('/api/history')[1]),2)
        cms.initialize();self.assertIn('CMS publicación de prueba',self.call('/academia/')[1])
        restored=self.call('/api/restore',{'id':1,'revision':published['revision']})[1]
        self.assertNotEqual(restored['data']['academy']['title'],'CMS publicación de prueba')
        self.assertIn('CMS publicación de prueba',self.call('/academia/')[1])
        self.assertEqual(self.call('/api/export')[0],200)
    def test_upgrade_refreshes_routes_preserving_draft_and_publication(self):
        self.login();current=self.call('/api/content')[1]
        data=current['data'];data['academy']['title']='Borrador conservado después de actualizar'
        saved=self.call('/api/draft',{'data':data,'revision':current['revision']})[1]
        with cms.connect() as db:
            latest=db.execute('SELECT id,data,outputs,created FROM publications ORDER BY id DESC LIMIT 1').fetchone()
            outputs=json.loads(latest['outputs'])
            outputs={k:v for k,v in outputs.items() if not k.startswith('soluciones-digitales/')}
            db.execute('UPDATE publications SET outputs=? WHERE id=?',(cms.dump(outputs),latest['id']))
        self.assertEqual(self.call('/soluciones-digitales/')[0],404)
        cms.initialize()
        after=self.call('/api/content')[1]
        self.assertEqual(after['revision'],saved['revision'])
        self.assertEqual(after['data']['academy']['title'],data['academy']['title'])
        self.assertNotIn(data['academy']['title'],self.call('/academia/')[1])
        self.assertEqual(len(self.call('/api/history')[1]),1)
        for path in ['/soluciones-digitales/','/soluciones-digitales/simulador-de-gestion-de-proyectos/','/soluciones-digitales/malba-risk/','/soluciones.css','/soluciones.js']:
            self.assertEqual(self.call(path)[0],200,path)
        self.assertIn('soluciones-digitales/simulador-de-gestion-de-proyectos/',self.call('/sitemap.xml')[1])
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        connection.request('GET','/api/export',headers={'Cookie':self.cookie})
        exported=connection.getresponse();self.assertEqual(exported.status,200)
        with zipfile.ZipFile(io.BytesIO(exported.read())) as archive:
            for name in ['soluciones.css','soluciones.js','soluciones-digitales/index.html','soluciones-digitales/simulador-de-gestion-de-proyectos/index.html']:
                self.assertIn(name,archive.namelist())
            self.assertFalse(any('.cms-private' in name or name.startswith('dashboard/') for name in archive.namelist()))
        connection.close()
        with cms.connect() as db:
            now=db.execute('SELECT data,created FROM publications ORDER BY id DESC LIMIT 1').fetchone()
            self.assertEqual(now['data'],latest['data']);self.assertEqual(now['created'],latest['created'])

    def test_visibility_trash_private_preview_and_restore(self):
        self.login();current=self.call('/api/content')[1];data=current['data'];program=data['programs'][0]
        slug=program['slug'];title=program['title'];program['visibility']='hidden'
        body={'data':data,'revision':current['revision']}
        preview=self.call('/api/preview',body)[1]
        private_url=preview['url'].removesuffix('academia/')+slug+'/'
        self.assertIn(title,self.call(private_url)[1])
        published=self.call('/api/publish',body)[1]
        for path in ['/academia/','/','/soluciones-digitales/','/sitemap.xml']:
            self.assertNotIn('href="'+slug+'/',self.call(path)[1])
        self.assertNotIn(slug+'/',self.call('/sitemap.xml')[1])
        unavailable=self.call('/'+slug+'/')[1]
        self.assertIn('Programa no disponible',unavailable)
        self.assertNotIn(program['checkoutUrl'],unavailable)
        self.assertNotIn(title,self.call('/academia/')[1])
        program['visibility']='deleted';body['revision']=published['revision']
        published=self.call('/api/publish',body)[1]
        self.assertEqual(self.call('/'+slug+'/')[0],404)
        cms.initialize();self.assertEqual(self.call('/'+slug+'/')[0],404)
        self.assertEqual(self.call('/api/content')[1]['data']['programs'][0]['visibility'],'deleted')
        restored=self.call('/api/restore',{'id':1,'revision':published['revision']})[1]
        self.assertEqual(self.call('/'+slug+'/')[0],404)
        self.call('/api/publish',{'data':restored['data'],'revision':restored['revision']})
        self.assertIn(title,self.call('/'+slug+'/')[1])

    def test_all_programs_can_be_hidden_and_export_omits_private_records(self):
        self.login();current=self.call('/api/content')[1];data=current['data']
        for p in data['programs']:p['visibility']='deleted'
        self.assertEqual(self.call('/api/publish',{'data':data,'revision':current['revision']})[0],200)
        self.assertIn('Academia',self.call('/academia/')[1])
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        connection.request('GET','/api/export',headers={'Cookie':self.cookie})
        exported=connection.getresponse()
        with zipfile.ZipFile(io.BytesIO(exported.read())) as archive:
            self.assertEqual(json.loads(archive.read('content/academia.json'))['programs'],[])
            for p in data['programs']:self.assertNotIn(p['slug']+'/index.html',archive.namelist())
        connection.close()
        data['programs'][0]['visibility']='bad-value'
        revision=self.call('/api/content')[1]['revision']
        self.assertEqual(self.call('/api/publish',{'data':data,'revision':revision})[0],400)

    def test_immediate_visibility_keeps_other_draft_edits_private(self):
        self.login();current=self.call('/api/content')[1];data=current['data'];p=data['programs'][0]
        original=self.call('/academia/')[1];data['academy']['title']='Título privado en preparación'
        body={'data':data,'revision':current['revision'],'area':'academy','id':p['id'],'visibility':'deleted'}
        status,result,_=self.call('/api/visibility',body);self.assertEqual(status,200);self.assertTrue(result['applied'])
        self.assertNotIn(p['title'],self.call('/academia/')[1]);self.assertEqual(self.call('/'+p['slug']+'/')[0],404)
        self.assertNotIn('Título privado en preparación',self.call('/academia/')[1]);self.assertTrue(result['dirty'])
        saved=self.call('/api/content')[1];self.assertEqual(saved['data']['programs'][0]['visibility'],'deleted')
        self.assertEqual(saved['data']['academy']['title'],'Título privado en preparación')
        cms.initialize();self.assertEqual(self.call('/'+p['slug']+'/')[0],404)
        body.update(data=saved['data'],revision=saved['revision'],visibility='hidden');self.assertEqual(self.call('/api/visibility',body)[0],200)
        self.assertIn('Programa no disponible',self.call('/'+p['slug']+'/')[1])
        self.assertIn('no-store',self.call('/academia/')[2]['Cache-Control'])

    def test_upgrade_reconciles_saved_trash_without_publishing_other_edits(self):
        self.login();current=self.call('/api/content')[1];data=current['data'];p=data['programs'][0]
        p['visibility']='deleted';data['academy']['title']='Borrador privado anterior'
        self.assertEqual(self.call('/api/draft',{'data':data,'revision':current['revision']})[0],200)
        self.assertEqual(self.call('/'+p['slug']+'/')[0],200)
        cms.initialize();self.assertEqual(self.call('/'+p['slug']+'/')[0],404)
        self.assertNotIn('Borrador privado anterior',self.call('/academia/')[1])
        self.assertEqual(self.call('/api/content')[1]['data']['academy']['title'],'Borrador privado anterior')

    def test_publications_edit_upload_visibility_preview_export_and_recovery(self):
        self.login();current=self.call('/api/content')[1];data=current['data'];section=data['publications'];p=section['items'][0]
        self.assertEqual(len(section['items']),7);self.assertIn(p['pdfUrl'],self.call('/publicaciones/')[1])
        self.assertEqual(self.call('/'+p['pdfUrl'])[0],200)
        self.assertEqual(self.call('/api/upload-pdf',{'content':base64.b64encode(b'not PDF').decode()})[0],400)
        raw=(self.root/p['pdfUrl']).read_bytes()
        uploaded=self.call('/api/upload-pdf',{'content':base64.b64encode(raw).decode()})
        self.assertEqual(uploaded[0],200);self.assertEqual((self.root/uploaded[1]['path']).read_bytes(),raw)
        old_title=section['catalogTitle'];section['catalogTitle']='Biblioteca editada desde CMS';p['pdfUrl']=uploaded[1]['path']
        body={'data':data,'revision':current['revision']}
        preview=self.call('/api/preview',body)[1]['url'].replace('academia/','publicaciones/')
        self.assertIn(section['catalogTitle'],self.call(preview)[1]);self.assertIn(old_title,self.call('/publicaciones/')[1])
        result=self.call('/api/publish',body)[1]
        self.assertIn(section['catalogTitle'],self.call('/publicaciones/')[1]);self.assertIn(p['pdfUrl'],self.call('/publicaciones/')[1])
        lifecycle={'data':data,'revision':result['revision'],'area':'publications','id':p['id'],'visibility':'deleted'}
        deleted=self.call('/api/visibility',lifecycle)[1];self.assertNotIn(p['title'],self.call('/publicaciones/')[1])
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port);connection.request('GET','/api/export',headers={'Cookie':self.cookie})
        with zipfile.ZipFile(io.BytesIO(connection.getresponse().read())) as archive:
            self.assertIn('publicaciones/index.html',archive.namelist());self.assertIn('publicaciones.css',archive.namelist())
            self.assertEqual(len(json.loads(archive.read('content/academia.json'))['publications']['items']),6)
            self.assertEqual(archive.read(uploaded[1]['path']),raw)
        connection.close();lifecycle['revision']=deleted['revision'];lifecycle['visibility']='public'
        self.assertEqual(self.call('/api/visibility',lifecycle)[0],200);self.assertIn(p['title'],self.call('/publicaciones/')[1])
        self.assertIn('publicaciones/',self.call('/sitemap.xml')[1])

    def test_digital_cards_preview_publish_persist_and_detail_isolation(self):
        self.login();current=self.call('/api/content')[1];data=current['data']
        self.assertEqual(len(data['digitalCards']),2)
        detail_path='/soluciones-digitales/simulador-de-gestion-de-proyectos/'
        original_detail=self.call(detail_path)[1]
        card=data['digitalCards'][0];card['title']='Tarjeta digital QA';card['description']='Descripción de tarjeta de prueba'
        card['features']=['Beneficio QA'];card['statusLabel']='Estado QA';card['ctaLabel']='Explorar QA'
        card['image']=card['imageSmall']='assets/solutions/riesgos-proyecto-600.webp'
        body={'data':data,'revision':current['revision']}
        preview=self.call('/api/preview',body)[1]['url'].replace('academia/','soluciones-digitales/')
        self.assertIn('Tarjeta digital QA',self.call(preview)[1]);self.assertNotIn('Tarjeta digital QA',self.call('/soluciones-digitales/')[1])
        saved=self.call('/api/draft',body)[1];body['revision']=saved['revision']
        published=self.call('/api/publish',body)[1]
        catalog=self.call('/soluciones-digitales/')[1]
        for text in ['Tarjeta digital QA','Descripción de tarjeta de prueba','Beneficio QA','Estado QA','Explorar QA']:self.assertIn(text,catalog)
        self.assertEqual(self.call(detail_path)[1],original_detail)
        cms.initialize();self.assertEqual(self.call('/api/content')[1]['data']['digitalCards'][0]['title'],'Tarjeta digital QA')
        body['revision']=published['revision'];card['plans']=[{'price':0}]
        self.assertEqual(self.call('/api/publish',body)[0],400)
        del card['plans'];card['id']='INVALID ID'
        self.assertEqual(self.call('/api/publish',body)[0],400)
        self.assertEqual(self.call(detail_path)[1],original_detail)

    def test_book_migration_preserves_saved_revistas(self):
        self.login();current=self.call('/api/content')[1]
        with cms.connect() as db:
            data=current['data'];data['publications'].pop('book');data['publications']['catalogTitle']='Revistas privadas'
            db.execute('UPDATE draft SET data=?',(json.dumps(data),))
        cms.initialize();after=self.call('/api/content')[1]
        self.assertEqual(after['revision'],current['revision'])
        self.assertEqual(after['data']['publications']['catalogTitle'],'Revistas privadas')
        self.assertIn('book',after['data']['publications'])

    def test_book_format_prices_and_export_script(self):
        self.login();current=self.call('/api/content')[1];data=current['data'];book=data['publications']['book']
        book.update(physicalPrice=80,digitalPrice=50,physicalShipping=12,physicalCheckoutUrl='https://example.com/physical',digitalCheckoutUrl='https://example.com/digital')
        body={'data':data,'revision':current['revision']}
        book['digitalPrice']=-1;self.assertEqual(self.call('/api/draft',body)[0],400)
        book['digitalPrice']=50;book['digitalCheckoutUrl']='javascript:alert(1)';self.assertEqual(self.call('/api/draft',body)[0],400)
        book['digitalCheckoutUrl']='https://example.com/digital';self.assertEqual(self.call('/api/publish',body)[0],200)
        page=self.call('/publicaciones/')[1]
        for text in ['Información de contacto','book_format','billing_email','publicaciones.js','https://example.com/digital']:self.assertIn(text,page)
        self.assertEqual(self.call('/publicaciones.js')[0],200)
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port);connection.request('GET','/api/export',headers={'Cookie':self.cookie})
        with zipfile.ZipFile(io.BytesIO(connection.getresponse().read())) as archive:self.assertIn('publicaciones.js',archive.namelist())
        connection.close()

    def test_book_purchase_configuration_and_private_preview(self):
        self.login();current=self.call('/api/content')[1];data=current['data'];book=data['publications']['book']
        catalog=self.call('/publicaciones/')[1]
        self.assertLess(catalog.index('id="book-heading"'),catalog.index('id="revistas"'))
        self.assertIn('Selecciona el formato',catalog)
        self.assertNotIn('Consultar disponibilidad',catalog)
        book['available']=True;body={'data':data,'revision':current['revision']}
        self.assertEqual(self.call('/api/publish',body)[0],400)
        book['price']=80;book['checkoutUrl']='https://example.com/checkout'
        book['physicalPrice']=80;book['physicalCheckoutUrl']='https://example.com/checkout'
        preview=self.call('/api/preview',body)[1]['url'].replace('academia/','publicaciones/')
        self.assertIn('https://example.com/checkout',self.call(preview)[1]);self.assertNotIn('https://example.com/checkout',self.call('/publicaciones/')[1])
        self.assertEqual(self.call('/api/publish',body)[0],200)
        self.assertIn('https://example.com/checkout',self.call('/publicaciones/')[1])
        cms.initialize();self.assertEqual(self.call('/api/content')[1]['data']['publications']['book']['price'],80)

    def test_new_solution_requires_url_and_only_creates_card(self):
        self.login();current=self.call('/api/content')[1];data=current['data']
        original=self.call('/soluciones-digitales/simulador-de-gestion-de-proyectos/')[1]
        card=dict(data['digitalCards'][0],id='solution-test',title='Nueva solución QA',ctaUrl='https://example.com/solucion')
        data['digitalCards'].append(card);body={'data':data,'revision':current['revision']}
        for url in ['', 'javascript:alert(1)', '//example.com', '/%2e%2e/admin', 'http://example.com']:
            card['ctaUrl']=url
            self.assertEqual(self.call('/api/draft',body)[0],400,url)
        card['ctaUrl']='https://example.com/solucion'
        preview=self.call('/api/preview',body)[1]['url'].replace('academia/','soluciones-digitales/')
        self.assertIn('Nueva solución QA',self.call(preview)[1])
        self.assertNotIn('Nueva solución QA',self.call('/soluciones-digitales/')[1])
        self.assertEqual(self.call('/api/publish',body)[0],200)
        self.assertIn('href="https://example.com/solucion"',self.call('/soluciones-digitales/')[1])
        self.assertEqual(self.call('/soluciones-digitales/simulador-de-gestion-de-proyectos/')[1],original)
        cms.initialize();self.assertEqual(len(self.call('/api/content')[1]['data']['digitalCards']),3)

    def test_existing_card_url_upgrade_preserves_edits(self):
        self.login();before=self.call('/api/content')[1]
        with cms.connect() as db:
            data=before['data'];data['digitalCards'][0]['title']='Título privado conservado'
            for p in data['digitalCards']:p.pop('ctaUrl')
            db.execute('UPDATE draft SET data=?',(json.dumps(data),))
        cms.initialize();after=self.call('/api/content')[1]
        self.assertEqual(after['revision'],before['revision'])
        self.assertEqual(after['data']['digitalCards'][0]['title'],'Título privado conservado')
        self.assertTrue(after['data']['digitalCards'][0]['ctaUrl'].startswith('/soluciones-digitales/'))

    def test_digital_cards_upgrade_preserves_private_edits_and_revisions(self):
        self.login();current=self.call('/api/content')[1]
        with cms.connect() as db:
            d=db.execute('SELECT data FROM draft').fetchone();data=json.loads(d['data']);data.pop('digitalCards')
            data['academy']['title']='Academia privada conservada';db.execute('UPDATE draft SET data=?',(cms.dump(data),))
            p=db.execute('SELECT id,data FROM publications ORDER BY id DESC LIMIT 1').fetchone();pub=json.loads(p['data']);pub.pop('digitalCards')
            db.execute('UPDATE publications SET data=? WHERE id=?',(cms.dump(pub),p['id']))
        cms.initialize();after=self.call('/api/content')[1]
        self.assertEqual(after['revision'],current['revision']);self.assertEqual(after['data']['academy']['title'],'Academia privada conservada')
        self.assertEqual(len(after['data']['digitalCards']),2);self.assertNotIn('Academia privada conservada',self.call('/academia/')[1])

    def test_invalid_publish_does_not_change_publication(self):
        self.login();d=self.call('/api/content')[1];data=d['data'];data['programs'][0]['pricing']['regular']=-1
        self.assertEqual(self.call('/api/publish',{'data':data,'revision':d['revision']})[0],400)
        self.assertEqual(self.call('/api/content')[1]['revision'],d['revision'])
        self.assertEqual(len(self.call('/api/history')[1]),1)
        data['programs'][0]['pricing']['regular']=350;data['programs'][0]['slug']='changed-existing-url'
        self.assertEqual(self.call('/api/publish',{'data':data,'revision':d['revision']})[0],400)
    def test_upload_and_new_program(self):
        self.login()
        self.assertEqual(self.call('/api/upload',{'content':base64.b64encode(b'<svg onload="alert(1)"></svg>').decode()})[0],400)
        image=(self.root/'assets/favicon.png').read_bytes()
        status,r,_=self.call('/api/upload',{'content':base64.b64encode(image).decode()});self.assertEqual(status,200)
        self.assertTrue((self.root/r['path']).is_file());self.assertEqual(self.call('/'+r['path'])[0],200)
        d=self.call('/api/content')[1];p=copy.deepcopy(d['data']['programs'][0]);p.update(id='test-program',slug='test-program',title='Nuevo programa',status='proximamente',image=r['path'])
        d['data']['programs'].append(p)
        self.assertEqual(self.call('/api/publish',{'data':d['data'],'revision':d['revision']})[0],200)
        self.assertIn('Nuevo programa',self.call('/test-program/')[1])

if __name__=='__main__':unittest.main()
