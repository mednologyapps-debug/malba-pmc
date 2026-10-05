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
