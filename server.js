const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const COOKIE = 'malba_cms_session';
const SESSION_TTL = 8 * 60 * 60;
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.pdf':'application/pdf'};
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false}}) : null;
const sessions = new Map();
let fallbackDocument = null;

function json(res,status,body,headers={}) { res.writeHead(status,{'Content-Type':MIME['.json'],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}); res.end(JSON.stringify(body)); }
function text(res,status,body,type=MIME['.txt']) { res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(body); }
function safeFile(requestPath) { const decoded=decodeURIComponent(requestPath.split('?')[0]); const relative=decoded.replace(/^\/+/,'')||'index.html'; const file=path.resolve(ROOT,relative); if(file!==ROOT&&!file.startsWith(ROOT+path.sep)) return null; try { const stat=fs.statSync(file); if(stat.isDirectory()){const index=path.join(file,'index.html');return fs.existsSync(index)?index:null;} if(stat.isFile())return file; } catch(_){} if(!path.extname(file)){const index=path.join(file,'index.html');if(fs.existsSync(index))return index;} return null; }
function serve(res,file) { const ext=path.extname(file).toLowerCase(); res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':process.env.NODE_ENV==='production'?'public, max-age=300':'no-store','X-Content-Type-Options':'nosniff'}); fs.createReadStream(file).on('error',()=>{if(!res.headersSent)text(res,500,'No se pudo leer el recurso.');else res.destroy();}).pipe(res); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2)); }
function sign(value) { return crypto.createHmac('sha256',process.env.CMS_COOKIE_SECRET||'malba-local-change-me').update(value).digest('hex'); }
function newSession(username) { const id=crypto.randomBytes(32).toString('base64url'); const csrf=crypto.randomBytes(24).toString('base64url'); sessions.set(id,{username,csrf,expires:Date.now()+SESSION_TTL*1000}); return `${id}.${sign(id)}`; }
function session(req) { const raw=parseCookies(req)[COOKIE]||''; const [id,mac]=raw.split('.'); if(!id||!mac)return null; const expected=sign(id); if(mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null; const value=sessions.get(id); if(!value||value.expires<Date.now()){sessions.delete(id);return null;} return {id,...value}; }
async function body(req) { const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>30*1024*1024)throw new Error('Solicitud demasiado grande.');chunks.push(chunk);}return chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{}; }
function initialDocument() { if(fallbackDocument)return fallbackDocument; const read=name=>JSON.parse(fs.readFileSync(path.join(ROOT,'content',name+'.json'),'utf8')); const academy=read('academia'); fallbackDocument={...academy,publications:read('publicaciones'),digitalCards:read('solutions').solutions,consulting:read('consultoria'),about:read('nosotros')}; return fallbackDocument; }
async function getDocument() { if(!supabase)return{id:'site',draft:initialDocument(),published:initialDocument(),revision:1,updated_at:new Date().toISOString(),published_at:null}; const {data,error}=await supabase.from('cms_documents').select('*').eq('id','site').maybeSingle();if(error)throw error;if(data)return data;const doc={id:'site',draft:initialDocument(),published:initialDocument(),revision:1};const inserted=await supabase.from('cms_documents').insert(doc).select('*').single();if(inserted.error)throw inserted.error;return inserted.data; }
async function saveDocument(doc,publish=false) { const now=new Date().toISOString(); const payload={draft:doc.draft,revision:Number(doc.revision||1)+1,updated_at:now};if(publish){payload.published=doc.draft;payload.published_at=now;}if(!supabase){fallbackDocument=doc.draft;return{...doc,...payload};}const result=await supabase.from('cms_documents').update(payload).eq('id','site').eq('revision',doc.revision).select('*').single();if(result.error)throw result.error;return result.data; }
function requireSession(req,res) { const value=session(req);if(!value){json(res,401,{error:'Debes iniciar sesión.'});return null;}return value; }
function authCookie(value,maxAge=SESSION_TTL) { return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`; }

async function api(req,res,url) {
  if(req.method==='GET'&&url.pathname==='/api/session'){const s=session(req);return json(res,200,{authenticated:!!s,username:s?.username||null,csrf:s?.csrf||null});}
  if(req.method==='POST'&&url.pathname==='/api/login'){const b=await body(req);const username=String(b.username||''),password=String(b.password||'');if(!process.env.CMS_ADMIN_USER||!process.env.CMS_ADMIN_PASSWORD||username!==process.env.CMS_ADMIN_USER||password!==process.env.CMS_ADMIN_PASSWORD)return json(res,401,{error:'Usuario o contraseña incorrectos.'});const cookie=newSession(username),id=cookie.split('.')[0];return json(res,200,{username,csrf:sessions.get(id).csrf},{'Set-Cookie':authCookie(cookie)});}
  if(req.method==='POST'&&url.pathname==='/api/logout'){const s=session(req);if(s)sessions.delete(s.id);return json(res,200,{ok:true},{'Set-Cookie':authCookie('',0)});}
  if(!url.pathname.startsWith('/api/'))return false;
  const s=requireSession(req,res);if(!s)return true;
  if(req.method==='GET'&&url.pathname==='/api/content'){const d=await getDocument();return json(res,200,{data:d.draft,revision:d.revision,updated:Date.parse(d.updated_at||'')/1000||Date.now()/1000,publishedAt:Date.parse(d.published_at||'')/1000||null,publishedIds:(d.published?.programs||[]).map(x=>x.id),dirty:JSON.stringify(d.draft)!==JSON.stringify(d.published)});}
  if(req.method==='GET'&&url.pathname==='/api/history')return json(res,200,[]);
  if(req.method==='GET'&&url.pathname==='/api/export')return json(res,501,{error:'La exportación se habilitará al conectar el almacenamiento de archivos.'});
  const b=await body(req);if(b.csrf&&b.csrf!==s.csrf)return json(res,403,{error:'La sesión cambió. Recarga el panel.'});
  if(req.method==='POST'&&['/api/draft','/api/publish'].includes(url.pathname)){const d=await getDocument();if(Number(b.revision)!==Number(d.revision))return json(res,409,{error:'Hay una edición más reciente. Recarga el panel.'});const saved=await saveDocument({...d,draft:b.data},url.pathname==='/api/publish');return json(res,200,{ok:true,revision:saved.revision,updated:Date.parse(saved.updated_at||'')/1000||Date.now()/1000});}
  if(req.method==='POST'&&url.pathname==='/api/visibility'){const d=await getDocument();if(Number(b.revision)!==Number(d.revision))return json(res,409,{error:'Hay una edición más reciente. Recarga el panel.'});const next=structuredClone(b.data),records=b.area==='academy'?next.programs:(next.publications?.items||[]),item=records.find(x=>x.id===b.id);if(!item)return json(res,404,{error:'Contenido no encontrado.'});item.visibility=b.visibility;const saved=await saveDocument({...d,draft:next},false);return json(res,200,{revision:saved.revision,updated:Date.parse(saved.updated_at||'')/1000||Date.now()/1000,dirty:true,applied:false});}
  return json(res,404,{error:'Ruta no encontrada.'});
}

const server=http.createServer(async(req,res)=>{const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);try{if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'malba-pmc',version:'node-supabase'});if(url.pathname.startsWith('/api/')){const handled=await api(req,res,url);if(handled!==false)return;}if(req.method!=='GET'&&req.method!=='HEAD')return text(res,405,'Método no permitido.');const file=safeFile(url.pathname);if(!file)return text(res,404,'Recurso no encontrado.');if(req.method==='HEAD'){res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream'});return res.end();}return serve(res,file);}catch(error){console.error(error);return json(res,500,{error:'No se pudo completar la operación.'});}});
server.listen(PORT,'0.0.0.0',()=>console.log(`MALBA PMC listening on ${PORT}`));
module.exports=server;
