#!/usr/bin/env python3
"""MALBA CMS: authenticated drafts, previews and atomic static HTML publication.
Python 3.10+, stdlib only. Local: py scripts/cms_server.py
Production requires a Python-capable server and an HTTPS reverse proxy.
"""
import argparse, base64, collections, getpass, hashlib, hmac, io, json, mimetypes
import os, re, secrets, sqlite3, threading, time, zipfile
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
import build_academia as renderer
import build_publications as editorial
import build_solutions as digital

ROOT = renderer.ROOT
STATE = ROOT / '.cms-private'
LOCK = threading.RLock()
ATTEMPTS = collections.defaultdict(collections.deque)
MAX_BODY = 29 * 1024 * 1024
SESSION_IDLE = 1800
SESSION_MAX = 28800
RESERVED = {'academia','publicaciones','soluciones-digitales','dashboard','assets','content','scripts','tests','cms-preview','api','docs'}

@contextmanager
def connect():
    db=sqlite3.connect(STATE/'cms.sqlite3', timeout=15)
    db.row_factory=sqlite3.Row
    try:
        with db:yield db
    finally:db.close()

def dump(value):
    return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)

def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(salt),600000).hex()

def initialize(username=None, password=None):
    STATE.mkdir(parents=True,exist_ok=True)
    if os.name != 'nt':STATE.chmod(0o700)
    with connect() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, csrf TEXT NOT NULL, username TEXT NOT NULL, created REAL NOT NULL, touched REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS draft (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, revision INTEGER NOT NULL, updated REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS publications (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, outputs TEXT NOT NULL, username TEXT NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS previews (id TEXT PRIMARY KEY, outputs TEXT NOT NULL, username TEXT NOT NULL, created REAL NOT NULL);
        ''')
        if not db.execute('SELECT 1 FROM draft').fetchone():
            data=json.loads((ROOT/'content/academia.json').read_text(encoding='utf-8'))
            data['publications']=editorial.defaults()
            data['digitalCards']=digital.default_cards()
            db.execute('INSERT INTO draft VALUES(1,?,1,?)',(dump(data),time.time()))
            db.execute('INSERT INTO publications(data,outputs,username,created) VALUES(?,?,?,?)',(dump(data),dump(renderer.render_outputs(data)),'Inicial',time.time()))
        # Add the editorial area without resetting saved programs, revisions or accounts.
        d=db.execute('SELECT data FROM draft').fetchone()
        draft=json.loads(d['data'])
        if 'publications' not in draft:
            draft['publications']=editorial.defaults()
            db.execute('UPDATE draft SET data=? WHERE id=1',(dump(draft),))
        draft['publications']=editorial.content(draft)
        db.execute('UPDATE draft SET data=? WHERE id=1',(dump(draft),))
        if 'digitalCards' not in draft:
            draft['digitalCards']=digital.default_cards()
            db.execute('UPDATE draft SET data=? WHERE id=1',(dump(draft),))
        draft['digitalCards']=digital.upgrade_cards(draft['digitalCards'])
        db.execute('UPDATE draft SET data=? WHERE id=1',(dump(draft),))
        latest=db.execute('SELECT id,data FROM publications ORDER BY id DESC LIMIT 1').fetchone()
        if latest:
            published=json.loads(latest['data'])
            published.setdefault('publications',editorial.defaults())
            published.setdefault('digitalCards',digital.default_cards())
            published['digitalCards']=digital.upgrade_cards(published['digitalCards'])
            # Reconcile previously saved removals after upgrading from draft-only trash.
            removals={p['id']:p.get('visibility') for p in draft['programs'] if p.get('visibility') in ('hidden','deleted')}
            changed=False
            for p in published['programs']:
                if p['id'] in removals and p.get('visibility','public')!=removals[p['id']]:
                    p['visibility']=removals[p['id']];changed=True
            outputs=renderer.render_outputs(published)
            if changed:
                db.execute('INSERT INTO publications(data,outputs,username,created) VALUES(?,?,?,?)',(dump(published),dump(outputs),'Sincronización de visibilidad',time.time()))
            else:db.execute('UPDATE publications SET data=?,outputs=? WHERE id=?',(dump(published),dump(outputs),latest['id']))
        if username is not None and password is not None:
            if not re.fullmatch(r'[a-zA-Z0-9_.@-]{3,100}',username):raise ValueError('Usuario inválido: usa al menos 3 letras/números.')
            if not 12<=len(password)<=256:raise ValueError('La contraseña debe tener entre 12 y 256 caracteres.')
            salt=secrets.token_hex(16)
            db.execute('INSERT OR REPLACE INTO users VALUES(?,?,?)',(username,salt,password_hash(password,salt)))
            db.execute('DELETE FROM sessions')

def validate_content(data):
    if not isinstance(data,dict) or not isinstance(data.get('programs'),list) or not 1<=len(data['programs'])<=150:raise ValueError('Catálogo inválido o papelera llena (máximo 150 registros).')
    if sum(p.get('visibility')!='deleted' for p in data['programs'] if isinstance(p,dict))>30:raise ValueError('Puedes administrar hasta 30 programas fuera de la papelera.')
    original=json.loads((ROOT/'content/academia.json').read_text(encoding='utf-8'))
    ids=set();slugs=set()
    with connect() as db:published=json.loads(db.execute('SELECT data FROM publications ORDER BY id DESC LIMIT 1').fetchone()[0])
    published_publications={p['id'] for p in editorial.content(published)['items']}
    if published_publications-{p.get('id') for p in editorial.content(data)['items'] if isinstance(p,dict)}:raise ValueError('Para eliminar una publicación usa la papelera; sus datos se conservan.')
    old={p['id']:p['slug'] for p in published['programs']}
    if set(old)-{p.get('id') for p in data['programs']}:raise ValueError('Para eliminar un programa publicado envíalo a la papelera; sus datos se conservan para recuperarlo.')
    def walk(value, key=''):
        if isinstance(value,dict):
            for k,v in value.items():walk(v,k)
        elif isinstance(value,list):
            if len(value)>150:raise ValueError('Una colección supera el máximo de 150 elementos.')
            for v in value:walk(v,key)
        elif isinstance(value,str):
            if len(value)>15000:raise ValueError('Un texto es demasiado largo.')
            if key=='ctaUrl':
                digital.validate_target(value)
                return
            if value and (key.lower().endswith('url') or key in ('image','imageSmall','imageWide','sectionImage')):
                renderer.safe_url(value)
                if not value.startswith('https://'):
                    if not value.startswith('assets/') or not (ROOT/value).is_file():raise ValueError('La imagen local no existe: '+value)
                    if key.lower().endswith('url') and key not in ('brochureUrl','pdfUrl'):raise ValueError('Usa un enlace HTTPS.')
    walk(data)
    editorial.validate(editorial.content(data))
    digital.validate_cards(data.get('digitalCards',digital.default_cards()))
    def shape(template,value,path):
        if template is None or value is None and path.split('.')[-1] in ('certificate','lab'):return
        if isinstance(template,dict):
            if not isinstance(value,dict):raise ValueError('Formato inválido: '+path)
            for k,v in template.items():
                if k not in value:raise ValueError('Falta el campo '+path+'.'+k)
                shape(v,value[k],path+'.'+k)
        elif isinstance(template,list):
            if not isinstance(value,list):raise ValueError('Lista inválida: '+path)
            if template:
                for v in value:shape(template[0],v,path)
        elif isinstance(template,bool):
            if not isinstance(value,bool):raise ValueError('Valor inválido: '+path)
        elif isinstance(template,(int,float)):
            if value is None and path in ('programa.pricing.regular','programa.pricing.launch'):return
            if isinstance(value,bool) or not isinstance(value,(int,float)):raise ValueError('Número inválido: '+path)
        elif isinstance(template,str) and value is not None:
            if not isinstance(value,str):raise ValueError('Texto inválido: '+path)
    for k in ('academy','upcoming'):shape(original[k],data.get(k),k)
    for p in data['programs']:
        if not isinstance(p,dict):raise ValueError('Programa inválido.')
        shape(original['programs'][0],p,'programa')
        if not re.fullmatch(r'[a-z0-9-]{2,80}',p['id']) or p['id'] in ids:raise ValueError('Identificador de programa inválido o duplicado.')
        if p['slug'] in RESERVED or len(p['slug'])>150 or p['slug'] in slugs:raise ValueError('URL inválida o duplicada.')
        if p['id'] in old and old[p['id']]!=p['slug']:raise ValueError('La URL publicada no se cambia para conservar sus enlaces.')
        if any(not p[k].strip() for k in ('title','category','description')):raise ValueError('Completa título, categoría y descripción.')
        if not (0<p['hours']<=2000 and 0<p['sessions']<=500):raise ValueError('Horas y sesiones fuera de rango.')
        ids.add(p['id']);slugs.add(p['slug'])
    renderer.validate(data)
    # Rendering validates every required template branch before changing stored content.
    return renderer.render_outputs(data)

class Handler(BaseHTTPRequestHandler):
    server_version='MalbaCMS'
    def log_message(self,fmt,*args):
        # No query strings, cookies, uploaded data or credentials in logs.
        print(f'{self.client_address[0]} {self.command} {urlsplit(self.path).path} {args[1] if len(args)>1 else ""}')
    def response(self,body,status=200,mime='application/json; charset=utf-8',headers=None):
        if not isinstance(body,bytes):body=(dump(body) if isinstance(body,(dict,list)) else body).encode()
        self.send_response(status)
        self.send_header('Content-Type',mime)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('X-Frame-Options','SAMEORIGIN')
        if mime.startswith(('text/html','application/xml')):self.send_header('Cache-Control','no-store')
        if self.path.startswith(('/api/','/dashboard','/cms-preview')):
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Robots-Tag','noindex, nofollow')
        if self.path.startswith('/dashboard'):
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: blob:; connect-src 'self'; frame-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'self'")
        for k,v in (headers or {}).items():self.send_header(k,v)
        self.end_headers()
        if self.command!='HEAD':self.wfile.write(body)
    def session(self):
        cookies={p.strip().split('=',1)[0]:p.strip().split('=',1)[1] for p in self.headers.get('Cookie','').split(';') if '=' in p}
        sid=cookies.get('malba_cms','')
        if not re.fullmatch(r'[a-zA-Z0-9_-]{40,100}',sid):return None
        ident=hashlib.sha256(sid.encode()).hexdigest()
        now=time.time()
        with connect() as db:
            row=db.execute('SELECT * FROM sessions WHERE id=?',(ident,)).fetchone()
            if not row or now-row['created']>SESSION_MAX or now-row['touched']>SESSION_IDLE:
                db.execute('DELETE FROM sessions WHERE id=?',(ident,));return None
            db.execute('UPDATE sessions SET touched=? WHERE id=?',(now,ident))
            return dict(row)
    def auth(self,csrf=False):
        row=self.session()
        if not row:self.response({'error':'Inicia sesión para continuar.'},401);return None
        if csrf and not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),row['csrf']):
            self.response({'error':'La sesión cambió. Recarga el panel.'},403);return None
        return row
    def body(self):
        size=int(self.headers.get('Content-Length','0'))
        if not 0<size<=MAX_BODY:raise ValueError('Solicitud vacía o demasiado grande.')
        if self.headers.get_content_type()!='application/json':raise ValueError('Formato de solicitud no admitido.')
        return json.loads(self.rfile.read(size))
    def cookie(self,value,maxage=SESSION_MAX):
        return f'malba_cms={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={maxage}'+('; Secure' if self.server.secure_cookie else '')
    def do_HEAD(self):self.do_GET()
    def do_GET(self):
        path=unquote(urlsplit(self.path).path)
        if path=='/api/session':
            row=self.session();self.response({'authenticated':bool(row),'username':row['username'] if row else None,'csrf':row['csrf'] if row else None});return
        if path in ('/api/content','/api/history','/api/export'):
            row=self.auth()
            if not row:return
            with connect() as db:
                if path=='/api/content':
                    d=db.execute('SELECT * FROM draft').fetchone();pub=db.execute('SELECT * FROM publications ORDER BY id DESC LIMIT 1').fetchone()
                    self.response({'data':json.loads(d['data']),'revision':d['revision'],'updated':d['updated'],'publishedAt':pub['created'],'publishedIds':[p['id'] for p in json.loads(pub['data'])['programs']],'dirty':d['data']!=pub['data']});return
                if path=='/api/history':self.response([dict(x) for x in db.execute('SELECT id,username,created FROM publications ORDER BY id DESC LIMIT 30')]);return
                pub=db.execute('SELECT * FROM publications ORDER BY id DESC LIMIT 1').fetchone()
            buffer=io.BytesIO()
            with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as z:
                outputs=json.loads(pub['outputs'])
                for name,body in outputs.items():z.writestr(name,body)
                z.writestr('content/academia.json',dump(renderer.public_content(json.loads(pub['data']))))
                for name in ['publicaciones.css','styles.css','home-sections.css','home-sections.js','academia.css','academia.js','soluciones.css','soluciones.js','app.js','robots.txt']:
                    z.write(ROOT/name,name)
                for f in (ROOT/'assets').rglob('*'):
                    if f.is_file():z.write(f,str(f.relative_to(ROOT)))
            self.response(buffer.getvalue(),mime='application/zip',headers={'Content-Disposition':'attachment; filename="malba-web-publicada.zip"'});return
        outputs=None
        if path.startswith('/cms-preview/'):
            row=self.auth()
            if not row:return
            parts=path.split('/',3)
            if len(parts)<4:self.response('Vista previa no encontrada.',404,'text/plain');return
            token=parts[2];path='/'+parts[3]
            with connect() as db:p=db.execute('SELECT outputs FROM previews WHERE id=? AND username=? AND created>?',(token,row['username'],time.time()-1800)).fetchone()
            if not p:self.response('La vista previa venció. Genera una nueva.',404,'text/plain');return
            outputs=json.loads(p[0])
        elif not path.startswith('/dashboard') and (path.endswith(('/', '.html', '.xml'))):
            with connect() as db:outputs=json.loads(db.execute('SELECT outputs FROM publications ORDER BY id DESC LIMIT 1').fetchone()[0])
        if '..' in path.split('/') or '\\' in path or '\x00' in path:
            self.response('Página no encontrada.',404,'text/plain');return
        filename=path.lstrip('/')
        if not filename or path.endswith('/'):filename+='index.html'
        if outputs and filename in outputs:
            self.response(outputs[filename],mime='application/xml; charset=utf-8' if filename.endswith('.xml') else 'text/html; charset=utf-8');return
        if path=='/dashboard':self.response('',302,'text/plain',{'Location':'/dashboard/'});return
        allowed=filename in ['publicaciones.css','styles.css','home-sections.css','home-sections.js','academia.css','academia.js','soluciones.css','soluciones.js','app.js','robots.txt'] or filename in ['dashboard/index.html','dashboard/cms.css','dashboard/cms.js'] or filename.startswith('assets/')
        target=(ROOT/filename).resolve()
        if not allowed or not target.is_relative_to(ROOT) or not target.is_file() or filename.startswith('assets/') and not target.is_relative_to((ROOT/'assets').resolve()):self.response('Página no encontrada.',404,'text/plain');return
        mime=mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
        self.response(target.read_bytes(),mime=mime)
    def do_POST(self):
        # Require a same-origin request when an Origin header is present, also for login.
        origin=self.headers.get('Origin')
        if origin and (urlsplit(origin).netloc!=self.headers.get('Host') or urlsplit(origin).scheme not in ('http','https')):
            self.response({'error':'Origen no permitido.'},403);return
        if self.headers.get('Sec-Fetch-Site')=='cross-site':self.response({'error':'Origen no permitido.'},403);return
        path=urlsplit(self.path).path
        try:
            body=self.body()
            if not isinstance(body,dict):raise ValueError('Solicitud inválida.')
            if path=='/api/login':
                now=time.time();ip=self.client_address[0]
                with LOCK:
                    attempts=ATTEMPTS[ip]
                    while attempts and now-attempts[0]>600:attempts.popleft()
                    if len(attempts)>=8:self.response({'error':'Demasiados intentos. Espera diez minutos.'},429);return
                    attempts.append(now)
                username=str(body.get('username',''))[:100];password=str(body.get('password',''))[:1000]
                with connect() as db:
                    user=db.execute('SELECT * FROM users WHERE username=?',(username,)).fetchone()
                    calculated=password_hash(password,user['salt'] if user else '0'*32)
                    if not user or not hmac.compare_digest(calculated,user['hash']):self.response({'error':'Usuario o contraseña incorrectos.'},401);return
                    sid=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(32)
                    db.execute('DELETE FROM sessions WHERE touched<? OR created<?',(now-SESSION_IDLE,now-SESSION_MAX))
                    db.execute('INSERT INTO sessions VALUES(?,?,?,?,?)',(hashlib.sha256(sid.encode()).hexdigest(),csrf,username,now,now))
                self.response({'username':username,'csrf':csrf},headers={'Set-Cookie':self.cookie(sid)});return
            row=self.auth(csrf=True)
            if not row:return
            if path=='/api/logout':
                with connect() as db:db.execute('DELETE FROM sessions WHERE id=?',(row['id'],))
                self.response({'ok':True},headers={'Set-Cookie':self.cookie('',0)});return
            if path=='/api/upload-pdf':
                raw=base64.b64decode(body.get('content',''),validate=True)
                if not raw.startswith(b'%PDF-') or len(raw)>20*1024*1024:raise ValueError('Usa un archivo PDF de hasta 20 MB.')
                dest=ROOT/'assets/uploads';dest.mkdir(parents=True,exist_ok=True)
                name=secrets.token_hex(16)+'.pdf';(dest/name).write_bytes(raw)
                self.response({'path':'assets/uploads/'+name});return
            if path=='/api/visibility':
                # Apply only this record's visibility to the last public edition.
                # Other draft text, price and image edits remain private.
                with LOCK,connect() as db:
                    d=db.execute('SELECT * FROM draft').fetchone()
                    if body.get('revision')!=d['revision']:self.response({'error':'Hay una edición más reciente. Recarga el panel.'},409);return
                    data=body.get('data');validate_content(data)
                    kind=body.get('area');state=body.get('visibility');ident=body.get('id')
                    if kind not in ('academy','publications') or state not in ('public','hidden','deleted'):raise ValueError('Acción de visibilidad inválida.')
                    records=data['programs'] if kind=='academy' else data['publications']['items']
                    target=next((p for p in records if p['id']==ident),None)
                    if not target:raise ValueError('Contenido no encontrado.')
                    target['visibility']=state
                    published=json.loads(db.execute('SELECT data FROM publications ORDER BY id DESC LIMIT 1').fetchone()[0])
                    published.setdefault('publications',editorial.defaults())
                    public_records=published['programs'] if kind=='academy' else published['publications']['items']
                    public_target=next((p for p in public_records if p['id']==ident),None)
                    now=time.time()
                    if public_target:
                        public_target['visibility']=state
                        outputs=renderer.render_outputs(published)
                        db.execute('INSERT INTO publications(data,outputs,username,created) VALUES(?,?,?,?)',(dump(published),dump(outputs),row['username'],now))
                        db.execute('DELETE FROM publications WHERE id NOT IN (SELECT id FROM publications ORDER BY id DESC LIMIT 30)')
                    db.execute('UPDATE draft SET data=?,revision=revision+1,updated=? WHERE id=1',(dump(data),now))
                    self.response({'revision':d['revision']+1,'updated':now,'applied':bool(public_target),'dirty':dump(data)!=dump(published)});return
            if path=='/api/upload':
                raw=base64.b64decode(body.get('content',''),validate=True)
                if not raw or len(raw)>5*1024*1024:raise ValueError('La imagen debe pesar menos de 5 MB.')
                ext='png' if raw.startswith(b'\x89PNG\r\n\x1a\n') else 'jpg' if raw.startswith(b'\xff\xd8\xff') else 'webp' if raw[:4]==b'RIFF' and raw[8:12]==b'WEBP' else None
                if not ext:raise ValueError('Usa una imagen PNG, JPG o WebP. No se admite SVG.')
                dest=ROOT/'assets/uploads';dest.mkdir(parents=True,exist_ok=True)
                name=secrets.token_hex(16)+'.'+ext;(dest/name).write_bytes(raw)
                self.response({'path':'assets/uploads/'+name});return
            if path not in ('/api/draft','/api/preview','/api/publish','/api/restore'):self.response({'error':'Ruta no encontrada.'},404);return
            with LOCK,connect() as db:
                d=db.execute('SELECT * FROM draft').fetchone()
                if body.get('revision')!=d['revision']:self.response({'error':'Hay una edición más reciente. Recarga para evitar sobrescribirla.'},409);return
                if path=='/api/restore':
                    restored=db.execute('SELECT data FROM publications WHERE id=?',(body.get('id'),)).fetchone()
                    if not restored:raise ValueError('Publicación no encontrada.')
                    data=json.loads(restored[0])
                    data.setdefault('publications',editorial.defaults())
                    data['publications']=editorial.content(data)
                    data.setdefault('digitalCards',digital.default_cards())
                    data['digitalCards']=digital.upgrade_cards(data['digitalCards'])
                    current=json.loads(db.execute('SELECT data FROM publications ORDER BY id DESC LIMIT 1').fetchone()[0])
                    restored_ids={p['id'] for p in data['programs']}
                    for p in current['programs']:
                        if p['id'] not in restored_ids:
                            p['status']='agotado';p['visibility']='deleted' if p.get('visibility')=='deleted' else 'hidden';data['programs'].append(p)
                    recovered={p['id'] for p in data['publications']['items']}
                    for p in editorial.content(current)['items']:
                        if p['id'] not in recovered:
                            p['visibility']='deleted' if p.get('visibility')=='deleted' else 'hidden';data['publications']['items'].append(p)
                else:data=body.get('data')
                outputs=validate_content(data);now=time.time();revision=d['revision']
                if path=='/api/preview':
                    outputs=renderer.render_outputs(data,preview=True)
                    token=secrets.token_urlsafe(24)
                    db.execute('DELETE FROM previews WHERE created<?',(now-1800,))
                    db.execute('INSERT INTO previews VALUES(?,?,?,?)',(token,dump(outputs),row['username'],now))
                    self.response({'url':'/cms-preview/'+token+'/academia/'});return
                serialized=dump(data)
                db.execute('UPDATE draft SET data=?,revision=revision+1,updated=? WHERE id=1',(serialized,now))
                if path=='/api/publish':
                    db.execute('INSERT INTO publications(data,outputs,username,created) VALUES(?,?,?,?)',(serialized,dump(outputs),row['username'],now))
                    db.execute('DELETE FROM publications WHERE id NOT IN (SELECT id FROM publications ORDER BY id DESC LIMIT 30)')
                result={'ok':True,'revision':revision+1,'updated':now}
                if path=='/api/restore':result['data']=data
            self.response(result)
        except (ValueError,KeyError,TypeError,IndexError,OverflowError) as e:
            self.response({'error':'No se guardaron cambios. '+str(e)[:250]},400)
        except Exception:
            self.response({'error':'No se pudo completar la operación. Revisa el servidor e inténtalo nuevamente.'},500)

def main():
    parser=argparse.ArgumentParser(description='CMS de MALBA PMC')
    parser.add_argument('--port',type=int,default=8080)
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--state-dir',type=Path)
    parser.add_argument('--secure-cookie',action='store_true',help='Obligatorio detrás de HTTPS en producción')
    parser.add_argument('--reset-admin',action='store_true')
    args=parser.parse_args()
    global STATE
    if args.state_dir:STATE=args.state_dir.resolve()
    initialize()
    with connect() as db:has_user=bool(db.execute('SELECT 1 FROM users').fetchone())
    if not has_user or args.reset_admin:
        print('Configura el acceso privado al CMS. Los datos se guardan fuera de los archivos públicos.')
        username=input('Usuario [admin]: ').strip() or 'admin'
        password=getpass.getpass('Contraseña (mínimo 12 caracteres): ')
        if password!=getpass.getpass('Repite la contraseña: '):raise SystemExit('Las contraseñas no coinciden.')
        try:initialize(username,password)
        except ValueError as e:raise SystemExit(str(e))
    server=ThreadingHTTPServer((args.host,args.port),Handler);server.secure_cookie=args.secure_cookie
    print(f'Panel: http://localhost:{args.port}/dashboard/\nWeb de prueba: http://localhost:{args.port}/\nCtrl+C para detener.')
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()

if __name__=='__main__':main()
