const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const ADMIN_COOKIE = 'malba_cms_session';
const STUDENT_COOKIE = 'malba_student_session';
const SESSION_TTL = 8 * 60 * 60;
const MAX_UPLOAD = 100 * 1024 * 1024;
const APP_VERSION = process.env.APP_VERSION || 'node-cms-live-publish-20261028.1';
const REDIRECTS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'redirects.json'), 'utf8')); } catch { return {}; } })();
const PRIVATE_FILES = /(^|\/)(?:\.env|\.runtime|\.cms-private|server\.js|package\.json|package-lock\.json|supabase|scripts|tests)(?:\/|$)/i;
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.pdf':'application/pdf','.mp4':'video/mp4'};
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{autoRefreshToken:false,persistSession:false},realtime:{transport:WebSocket}}) : null;
// Never sign a user into the shared service-role client: even with persistence
// disabled, Auth keeps an in-memory session and changes subsequent REST headers.
async function verifyStudentPassword(email,password) {
  const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{
    auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},
    realtime:{transport:WebSocket}
  });
  return client.auth.signInWithPassword({email,password});
}
const adminSessions = new Map();
const studentSessions = new Map();
let fallbackDocument = null;
const fallbackHistory = [];

async function sendWelcomeEmail(student, course, password) {
  const host=process.env.SMTP_HOST,user=process.env.SMTP_USER,pass=process.env.SMTP_PASSWORD||process.env.SMTP_PASS;
  if(!host||!user||!pass)return {sent:false,reason:'SMTP no configurado en el servidor.'};
  const port=Number(process.env.SMTP_PORT||465),secure=process.env.SMTP_SECURE?String(process.env.SMTP_SECURE)==='true':port===465;
  const transporter=nodemailer.createTransport({host,port,secure,auth:{user,pass},tls:secure?undefined:{rejectUnauthorized:true}});
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const origin=(process.env.PUBLIC_ORIGIN||process.env.SITE_URL||'https://malba-pmc.com').replace(/\/$/,'');
  const aula=(process.env.AULA_URL||`${origin}/aula-virtual/`).replace(/\/?$/,'/');
  const title=esc(Array.isArray(course)?course.map(c=>c?.title).filter(Boolean).join(', '):(course?.title||'tu programa MALBA PMC')),name=esc(student.name||''),email=esc(student.email||''),temporary=esc(password),accessInfo=password?`<strong>Contraseña temporal</strong><br><span style="color:#334e68">${temporary}</span>`:'<strong>Contraseña</strong><br><span style="color:#334e68">Utiliza tu contraseña actual del aula virtual.</span>';
  const html=`<!doctype html><html lang="es"><body style="margin:0;background:#f3f6fa;font-family:Arial,Helvetica,sans-serif;color:#003b73"><div style="display:none;max-height:0;overflow:hidden">Tu acceso al aula virtual MALBA PMC ya está listo.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #dbe3ee;border-radius:16px;overflow:hidden"><tr><td style="background:#003b73;padding:28px 24px;text-align:center"><img src="${esc(origin)}/assets/malba-pmc-logo.png" alt="MALBA PMC" width="190" style="display:inline-block;background:#fff;padding:9px;border-radius:7px;height:auto"></td></tr><tr><td style="padding:34px 32px 28px"><h1 style="font-size:28px;line-height:1.2;margin:0 0 18px;color:#003b73">Hola, ${name}</h1><p style="font-size:16px;line-height:1.65;margin:0 0 22px;color:#334e68">Tu acceso ya está listo. Fuiste inscrito(a) en <strong style="color:#003b73">${title}</strong>.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff"><tr><td style="padding:12px 0;font-size:15px;line-height:1.7"><strong>Correo de acceso</strong><br><span style="color:#334e68">${email}</span><br><br>${accessInfo}</td></tr></table><table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px"><tr><td align="center" bgcolor="#5d4594" style="border-radius:8px"><a href="${esc(aula)}" style="display:inline-block;padding:17px 28px;color:#fff;text-decoration:none;font-size:16px;font-weight:bold;border:1px solid #5d4594;border-radius:8px">Ingresar al aula virtual</a></td></tr></table><p style="font-size:13px;line-height:1.65;color:#60738b;margin:20px 0 0">Por seguridad, cambia tu contraseña en el primer ingreso. Si necesitas ayuda, responde este correo.</p></td></tr><tr><td style="padding:18px 32px;border-top:1px solid #e1e6ef;color:#60738b;font-size:12px;line-height:1.5">MALBA PMC · Gestión, aprendizaje y experiencia aplicada</td></tr></table></td></tr></table></body></html>`;
  const fromAddress=process.env.SMTP_FROM||user,fromName=process.env.SMTP_FROM_NAME||'MALBA PMC · Aula virtual';
  const from=fromAddress.includes('<')?fromAddress:`${fromName} <${fromAddress}>`;
  await transporter.sendMail({from,to:student.email,subject:`Tu acceso al aula virtual · ${title}`,html,text:`Tu acceso al aula virtual está listo. Ingresa en ${aula} con tu correo ${student.email} y ${password?'la contraseña temporal incluida en este correo':'tu contraseña habitual'}.`});
  return {sent:true};
}
function excelText(cell) { const value=cell?.value;if(value==null)return '';if(value instanceof Date)return value.toISOString().slice(0,10);if(typeof value==='object'){if(value.text)return String(value.text);if(value.hyperlink)return String(value.text||value.hyperlink);if(value.richText)return value.richText.map(x=>x.text||'').join('');if(Object.hasOwn(value,'result'))return String(value.result??'');}return String(value).trim(); }
async function parseExcelRows(raw) { const workbook=new ExcelJS.Workbook();try{await workbook.xlsx.load(raw);}catch{throw new Error('El archivo no es un Excel .xlsx válido. Descarga la plantilla y vuelve a intentarlo.');}const sheet=workbook.worksheets[0];if(!sheet)throw new Error('El Excel no contiene hojas.');const headerRow=sheet.getRow(1),headers=[];for(let col=1;col<=headerRow.cellCount;col++)headers.push(excelText(headerRow.getCell(col)).toLocaleLowerCase('es'));if(!headers.includes('correo')&&!headers.includes('email')&&!headers.includes('correo electrónico'))throw new Error('Falta la columna Correo. Usa la plantilla de MALBA PMC.');const rows=[];sheet.eachRow((row,index)=>{if(index===1)return;const values=headers.map((header,i)=>[header,excelText(row.getCell(i+1))]);if(values.some(([,value])=>value))rows.push(Object.fromEntries(values));});return rows; }
async function studentWorkbook(rows=[],template=false) { const workbook=new ExcelJS.Workbook();workbook.creator='MALBA PMC';workbook.created=new Date();const sheet=workbook.addWorksheet('Alumnos',{views:[{state:'frozen',ySplit:1}]});const headers=template?['Nombre','Correo','Contraseña','Estado']:['Nombre','Correo','Estado','Cursos'];sheet.addRow(headers);for(const row of rows)sheet.addRow(headers.map(h=>row[h]??''));sheet.columns=[{width:30},{width:34},{width:template?24:18},{width:template?18:48}];sheet.autoFilter={from:'A1',to:`${template?'D':'D'}1`};const header=sheet.getRow(1);header.height=28;header.eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'},size:11};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF073F7C'}};cell.alignment={vertical:'middle'};cell.border={bottom:{style:'thin',color:{argb:'FF544595'}}};});if(template){sheet.addRow(['','','','Activo']);sheet.getColumn(4).eachCell((cell,row)=>{if(row>1)cell.dataValidation={type:'list',allowBlank:true,formulae:['"Activo,Deshabilitado"']};});const notes=workbook.addWorksheet('Instrucciones');notes.columns=[{width:26},{width:88}];notes.addRows([['Cómo usar esta plantilla','Completa una fila por alumno en la hoja Alumnos. No cambies los títulos de las columnas.'],['Nombre','Nombre y apellidos del alumno.'],['Correo','Correo único con el que ingresará al aula.'],['Contraseña','Opcional. Si queda vacía y envías el correo, el sistema crea una contraseña temporal segura.'],['Estado','Usa Activo o Deshabilitado.'],['Límite','Hasta 500 alumnos y 5 MB por archivo.']]);notes.getRow(1).font={bold:true,color:{argb:'FF544595'}};}else{sheet.eachRow((row,index)=>{if(index>1){row.alignment={vertical:'top'};if(index%2===0)row.eachCell(cell=>cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6FA'}});}});}return Buffer.from(await workbook.xlsx.writeBuffer()); }

function json(res,status,value,headers={}) { res.writeHead(status,{'Content-Type':MIME['.json'],'Cache-Control':'no-store','X-MALBA-API':'node','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin',...headers}); res.end(JSON.stringify(value)); }
function text(res,status,value,type=MIME['.txt'],headers={}) { res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin',...headers}); res.end(value); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2)); }
function sign(value) { const secret=process.env.CMS_COOKIE_SECRET||(process.env.NODE_ENV==='production'?'': 'malba-local-change-me'); if(!secret)throw new Error('CMS_COOKIE_SECRET no está configurado.'); return crypto.createHmac('sha256',secret).update(value).digest('hex'); }
function cookie(name,value,maxAge=SESSION_TTL) { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`; }
function decodeToken(raw) { const [payload,mac]=String(raw||'').split('.');if(!payload||!mac)return null;let expected;try{expected=sign(payload);}catch{return null;}if(mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null;try{const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return value&&value.expires>Date.now()?value:null;}catch{return null;} }
function sessionFrom(req,name,map) { const value=decodeToken(parseCookies(req)[name]||''),kind=name===ADMIN_COOKIE?'admin':'student';return value&&value.kind===kind?{id:value.id,...value}:null; }
function newToken(value) { const payload=Buffer.from(JSON.stringify({id:crypto.randomBytes(24).toString('base64url'),...value,expires:Date.now()+SESSION_TTL*1000})).toString('base64url'); return `${payload}.${sign(payload)}`; }
function newSession(username) { return newToken({username,csrf:crypto.randomBytes(24).toString('base64url'),kind:'admin'}); }
function newStudentSession(student) { return newToken({studentId:student.id,csrf:crypto.randomBytes(24).toString('base64url'),kind:'student'}); }
async function requestBody(req) { const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_UPLOAD)throw new Error('Solicitud demasiado grande.');chunks.push(chunk);} if(!chunks.length)return {}; return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
async function rawBody(req) { const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_UPLOAD)throw new Error('Archivo demasiado grande.');chunks.push(chunk);}return Buffer.concat(chunks); }
function safeUploadName(value) { return path.basename(String(value||'material').replace(/[^a-zA-Z0-9._-]+/g,'-')).slice(0,120)||'material'; }
async function storeLmsFile(raw,courseId,name,mime) {
  const id=`${asId(courseId)}--${crypto.randomUUID()}--${safeUploadName(name)}`;
  if(supabase){const uploaded=await supabase.storage.from('malba-lms').upload(id,raw,{contentType:mime||'application/octet-stream',upsert:false});if(uploaded.error)throw uploaded.error;return{id,fileId:id,name:safeUploadName(name),size:raw.length};}
  const dir=path.join(ROOT,'.runtime','lms-files');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,id),raw);return{id,fileId:id,name:safeUploadName(name),size:raw.length};
}
async function downloadLmsFile(id) {
  if(supabase){const result=await supabase.storage.from('malba-lms').download(id);if(!result.error&&result.data)return Buffer.from(await result.data.arrayBuffer());}
  const dir=path.join(ROOT,'.runtime','lms-files');if(!fs.existsSync(dir))throw new Error('Archivo no encontrado.');const file=fs.readdirSync(dir,{withFileTypes:true}).find(x=>x.isFile()&&x.name===id);if(!file)throw new Error('Archivo no encontrado.');return fs.readFileSync(path.join(dir,file.name));
}
async function storeCmsFile(raw, isPdf, mime) {
  const name=`cms-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${isPdf?'pdf':'webp'}`;
  if (supabase) {
    const uploaded=await supabase.storage.from('malba-cms').upload(name,raw,{contentType:mime||(isPdf?'application/pdf':'image/webp'),upsert:false});
    if(uploaded.error)throw uploaded.error;
    return {path:`api/public-asset/${name}`};
  }
  const dir=path.join(ROOT,'assets','uploads');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name),raw);
  return {path:`assets/uploads/${name}`};
}
async function publicAsset(req,res,url) {
  if(req.method!=='GET'&&req.method!=='HEAD')return text(res,405,'Método no permitido.');
  const id=decodeURIComponent(url.pathname.slice('/api/public-asset/'.length));
  if(!/^[a-zA-Z0-9._-]{8,180}\.(?:pdf|webp|png|jpe?g)$/i.test(id))return text(res,404,'Recurso no encontrado.');
  let data,mime=MIME[path.extname(id).toLowerCase()]||'application/octet-stream';
  if(supabase){const result=await supabase.storage.from('malba-cms').download(id);if(!result.error&&result.data)data=Buffer.from(await result.data.arrayBuffer());}
  if(!data){const file=path.join(ROOT,'assets','uploads',id);if(fs.existsSync(file))data=fs.readFileSync(file);}
  if(!data)return text(res,404,'Recurso no encontrado.');
  res.writeHead(200,{'Content-Type':mime,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin'});
  if(req.method==='GET')res.end(data);else res.end();
}
// Public pages are generated from the actual published CMS snapshot, not from
// HTML files committed months earlier. Cache in memory; other Node workers refresh.
let publicPageCache=null;
let publicPageCacheTime=0;
let publicPageCacheChecking=null;
const PUBLIC_CACHE_MS=10000;
function compilePublicPages(snapshot) {
  const input=JSON.stringify(snapshot);
  const options={cwd:ROOT,encoding:'utf8',input,maxBuffer:32*1024*1024,timeout:30000,windowsHide:true};
  let run;
  for(const executable of [process.env.PYTHON_EXECUTABLE,'python3','python'].filter(Boolean)){
    run=spawnSync(executable,[path.join(ROOT,'scripts/render_publication.py')],options);
    if(!run.error||run.error.code!=='ENOENT')break;
  }
  if(run?.error)throw new Error('No se pudo generar la web pública: '+run.error.message);
  if(!run||run.status!==0)throw new Error('No se pudo generar la web pública: '+String(run?.stderr||'Python no disponible').slice(-750));
  const pages=JSON.parse(run.stdout||'{}');
  if(!pages['index.html']||!pages['academia/index.html']||!pages['sitemap.xml'])throw new Error('La publicación está incompleta.');
  return new Map(Object.entries(pages));
}
async function getPublicPages(force=false){
  if(!force&&publicPageCache&&Date.now()-publicPageCacheTime<PUBLIC_CACHE_MS)return publicPageCache;
  if(publicPageCacheChecking)return publicPageCacheChecking;
  publicPageCacheChecking=(async()=>{
    const d=await getDocument();
    const version=String(d.published_at||'')+':'+String(d.revision||0);
    if(!force&&publicPageCache?.version===version){publicPageCacheTime=Date.now();return publicPageCache;}
    const pages=compilePublicPages(d.published||initialDocument());
    publicPageCache={version,pages};
    publicPageCacheTime=Date.now();
    return publicPageCache;
  })();
  try{return await publicPageCacheChecking;}
  catch(error){
    if(publicPageCache){console.error('Using last valid public snapshot',error);publicPageCacheTime=Date.now();return publicPageCache;}
    throw error;
  }finally{publicPageCacheChecking=null;}
}
function publicPagePath(urlPath){
  let target;
  try{target=decodeURIComponent(urlPath.split('?')[0]);}catch(_){return null;}
  if(target.includes('\\')||target.includes('..'))return null;
  if(target==='/'||target==='/index.html')return 'index.html';
  if(target.endsWith('/'))target+='index.html';
  else if(!path.posix.extname(target))target+='/index.html';
  return target.replace(/^\/+/, '');
}
function servePublishedPage(res,name,body){
  const isXml=name.endsWith('.xml');
  res.writeHead(200,{'Content-Type':isXml?'application/xml; charset=utf-8':'text/html; charset=utf-8',
    'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN'});
  res.end(body);
}
function safeFile(requestPath) { const decoded=decodeURIComponent(requestPath.split('?')[0]); const relative=decoded.replace(/^\/+/,'')||'index.html';if(PRIVATE_FILES.test(relative))return null; const file=path.resolve(ROOT,relative); if(file!==ROOT&&!file.startsWith(ROOT+path.sep))return null; try{const stat=fs.statSync(file);if(stat.isDirectory()){const index=path.join(file,'index.html');return fs.existsSync(index)?index:null;}if(stat.isFile())return file;}catch(_){}if(!path.extname(file)){const index=path.join(file,'index.html');if(fs.existsSync(index))return index;}return null; }
function serve(res,file) { const ext=path.extname(file).toLowerCase();const privatePage=/\/(dashboard|aula-virtual)\//.test(file);res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':privatePage?'no-store':(process.env.NODE_ENV==='production'?'public, max-age=300':'no-store'),'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});fs.createReadStream(file).on('error',()=>{if(!res.headersSent)text(res,500,'No se pudo leer el recurso.');else res.destroy();}).pipe(res); }
function requireAdmin(req,res) { const s=sessionFrom(req,ADMIN_COOKIE,adminSessions);if(!s){json(res,401,{error:'Debes iniciar sesión.'});return null;}return s; }
function csrfOk(req,s) { if(req.method==='GET'||req.method==='HEAD')return true;const token=String(req.headers['x-csrf-token']||'');return token.length===s.csrf.length&&crypto.timingSafeEqual(Buffer.from(token),Buffer.from(s.csrf)); }
function initialDocument() { if(fallbackDocument)return fallbackDocument; const read=name=>JSON.parse(fs.readFileSync(path.join(ROOT,'content',name+'.json'),'utf8')); const academy=read('academia');fallbackDocument={...academy,publications:read('publicaciones'),digitalCards:read('solutions').solutions,consulting:read('consultoria'),about:read('nosotros'),siteSettings:{whatsappEnabled:true,whatsappNumber:'51999999999',whatsappMessage:'Hola, deseo recibir información sobre los servicios de MALBA PMC.'}};return fallbackDocument; }
async function getDocument() { if(!supabase)return{id:'site',draft:initialDocument(),published:initialDocument(),revision:1,updated_at:new Date().toISOString(),published_at:null};const {data,error}=await supabase.from('cms_documents').select('*').eq('id','site').maybeSingle();if(error)throw error;if(data)return data;const doc={id:'site',draft:initialDocument(),published:initialDocument(),revision:1};const inserted=await supabase.from('cms_documents').insert(doc).select('*').single();if(inserted.error)throw inserted.error;return inserted.data; }
async function saveDocument(doc,publish=false) { const now=new Date().toISOString(),payload={draft:doc.draft,revision:Number(doc.revision||1)+1,updated_at:now};if(publish){payload.published=doc.draft;payload.published_at=now;}if(!supabase){fallbackHistory.unshift({id:Date.now(),data:doc.draft,revision:doc.revision,username:'admin',created_at:now});fallbackDocument=doc.draft;return{...doc,...payload};}const history=await supabase.from('cms_history').insert({data:doc.draft,revision:doc.revision,username:'admin'});if(history.error)throw history.error;const result=await supabase.from('cms_documents').update(payload).eq('id','site').eq('revision',doc.revision).select('*').single();if(result.error)throw result.error;return result.data; }
function normalizeSiteSettings(value={}) { const digits=String(value.whatsappNumber||'').replace(/\D/g,'');if(digits&&(!/^\d{9,15}$/.test(digits)))throw new Error('El número de WhatsApp debe incluir código de país y tener entre 9 y 15 dígitos.');return{whatsappEnabled:value.whatsappEnabled!==false,whatsappNumber:digits||'51999999999',whatsappMessage:String(value.whatsappMessage||'Hola, deseo recibir información sobre los servicios de MALBA PMC.').trim().slice(0,500)}; }
async function saveSiteSettings(value) { const settings=normalizeSiteSettings(value),d=await getDocument(),now=new Date().toISOString(),draft={...d.draft,siteSettings:settings},published={...(d.published||d.draft),siteSettings:settings},payload={draft,published,revision:Number(d.revision||1)+1,updated_at:now,published_at:d.published_at||now};if(!supabase){fallbackDocument=draft;return{...d,...payload};}const history=await supabase.from('cms_history').insert({data:d.draft,revision:d.revision,username:'admin'});if(history.error)throw history.error;const result=await supabase.from('cms_documents').update(payload).eq('id','site').eq('revision',d.revision).select('*').single();if(result.error)throw result.error;return result.data; }
function slugify(value) { return String(value||'curso').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'curso'; }
function asId(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))?String(value):crypto.randomUUID(); }
function lessonsFrom(modules) { return (modules||[]).flatMap(m=>m.lessons||[]); }
async function lmsAdminState() {
  if(!supabase)return {courses:[],students:[],enrollments:[]};
  const queries=await Promise.all(['lms_courses','lms_modules','lms_lessons','lms_materials','lms_students','lms_enrollments','lms_progress','lms_certificates'].map(table=>supabase.from(table).select('*')));
  for(const q of queries)if(q.error)throw q.error;
  const [coursesR,modulesR,lessonsR,materialsR,studentsR,enrollmentsR,progressR,certificatesR]=queries;
  const modules=modulesR.data||[],lessons=lessonsR.data||[],materials=materialsR.data||[],progress=progressR.data||[],certificates=certificatesR.data||[];
  const courses=(coursesR.data||[]).map(row=>{const cms=row.certificate_config||{};const courseModules=modules.filter(m=>m.course_id===row.id).sort((a,b)=>a.sort_order-b.sort_order).map(m=>({id:m.id,title:m.title,description:m.description||'',lessons:lessons.filter(l=>l.module_id===m.id).sort((a,b)=>a.sort_order-b.sort_order).map(l=>({id:l.id,title:l.title,type:l.lesson_type,body:l.body||'',videoUrl:l.video_url||'',videoFileId:l.video_file_id||'',meetingUrl:l.meeting_url||'',minutes:Number(l.minutes||0),required:l.required!==false,quiz:l.quiz||null,resources:materials.filter(x=>x.lesson_id===l.id).sort((a,b)=>a.sort_order-b.sort_order).map(x=>({id:x.id,name:x.name,url:x.external_url||'',fileId:x.file_path||'',fileName:x.name,size:x.size_bytes||0}))}))}));const draft={id:row.id,title:row.title,description:row.description||'',introduction:row.introduction||'',instructor:row.instructor||'',hours:Number(row.hours||0),image:row.cover_url||'',sourceProgramId:row.source_program_id||'',certificate:{enabled:!!row.certificate_enabled,title:cms.title||'Certificado de finalización',statement:cms.statement||'',issuer:cms.issuer||'',role:cms.role||'',signatureImage:cms.signatureImage||''},modules:courseModules};return{id:row.id,revision:1,active:!['hidden','deleted'].includes(row.status),published:row.status==='published'?draft:null,draft};});
  const students=(studentsR.data||[]).map(row=>({id:row.id,name:row.full_name||'',email:row.email,active:!!row.active,deleted:!!row.deleted_at,force_password:!!row.force_password_change}));
  const enrollments=(enrollmentsR.data||[]).map(row=>{const course=courses.find(c=>c.id===row.course_id),required=course?lessonsFrom(course.draft.modules).filter(l=>l.required).length:0,completed=progress.filter(p=>p.student_id===row.student_id&&p.course_id===row.course_id).length,cert=certificates.find(c=>c.student_id===row.student_id&&c.course_id===row.course_id);return{id:row.id,student_id:row.student_id,course_id:row.course_id,active:['active','completed'].includes(row.status),expires:row.expires_at||'',progress:{completed,total:required,percent:required?Math.round(completed*100/required):0},certificate:cert?{id:cert.id,revoked:!!cert.revoked_at}:null};});return{courses,students,enrollments};
}
async function getCourse(id,publishedOnly=false) { const r=await supabase.from('lms_courses').select('*').eq('id',id).maybeSingle();if(r.error)throw r.error;if(!r.data||publishedOnly&&r.data.status!=='published')return null;const [mods,lessons,mats]=await Promise.all([supabase.from('lms_modules').select('*').eq('course_id',id).order('sort_order'),supabase.from('lms_lessons').select('*').order('sort_order'),supabase.from('lms_materials').select('*')]);for(const q of [mods,lessons,mats])if(q.error)throw q.error;const map=(mods.data||[]).map(m=>({id:m.id,title:m.title,description:m.description||'',lessons:(lessons.data||[]).filter(l=>l.module_id===m.id).map(l=>({id:l.id,title:l.title,type:l.lesson_type,body:l.body||'',videoUrl:l.video_url||'',videoFileId:l.video_file_id||'',meetingUrl:l.meeting_url||'',minutes:Number(l.minutes||0),required:l.required!==false,quiz:l.quiz||null,resources:(mats.data||[]).filter(x=>x.lesson_id===l.id).map(x=>({id:x.id,name:x.name,url:x.external_url||'',fileId:x.file_path||'',fileName:x.name,size:x.size_bytes||0}))}))}));const cc=r.data.certificate_config||{};return{id:r.data.id,title:r.data.title,description:r.data.description||'',introduction:r.data.introduction||'',instructor:r.data.instructor||'',hours:Number(r.data.hours||0),image:r.data.cover_url||'',sourceProgramId:r.data.source_program_id||'',certificate:{enabled:!!r.data.certificate_enabled,title:cc.title||'Certificado de finalización',statement:cc.statement||'',issuer:cc.issuer||'',role:cc.role||'',signatureImage:cc.signatureImage||''},modules:map}; }
async function saveCourse(course,publish=false) {
  if(!course||!course.title)throw new Error('Completa el título del curso.');
  const id=asId(course.id),cert=course.certificate||{},modules=course.modules||[];
  const current=await supabase.from('lms_courses').select('status').eq('id',id).maybeSingle();
  if(current.error)throw current.error;
  // Guardar ajustes de un curso ya publicado nunca debe quitarle el acceso al alumno.
  const status=publish||current.data?.status==='published'?'published':'draft';
  const up=await supabase.from('lms_courses').upsert({id,slug:slugify(course.title)+'-'+id.slice(0,8),title:String(course.title).slice(0,180),description:course.description||'',introduction:course.introduction||'',instructor:course.instructor||'',cover_url:course.image||'',hours:Number(course.hours||0),certificate_enabled:!!cert.enabled,certificate_config:cert,status,source_program_id:course.sourceProgramId||null},{onConflict:'id'}).select('id').single();
  if(up.error)throw up.error;

  const oldMods=await supabase.from('lms_modules').select('id').eq('course_id',id);
  if(oldMods.error)throw oldMods.error;
  const oldModuleIds=(oldMods.data||[]).map(x=>x.id);
  const oldLessons=oldModuleIds.length?await supabase.from('lms_lessons').select('id,module_id').in('module_id',oldModuleIds):{data:[]};
  if(oldLessons.error)throw oldLessons.error;
  const keptModuleIds=[],keptLessonIds=[];

  for(let mi=0;mi<modules.length;mi++){
    const m=modules[mi],mid=asId(m.id);keptModuleIds.push(mid);
    const mr=await supabase.from('lms_modules').upsert({id:mid,course_id:id,title:m.title||'Módulo',description:m.description||'',sort_order:mi},{onConflict:'id'});
    if(mr.error)throw mr.error;
    for(let li=0;li<(m.lessons||[]).length;li++){
      const l=m.lessons[li],lid=asId(l.id);keptLessonIds.push(lid);
      const lr=await supabase.from('lms_lessons').upsert({id:lid,module_id:mid,title:l.title||'Lección',lesson_type:l.type||'text',body:l.body||'',video_url:l.videoUrl||'',video_file_id:l.videoFileId||null,meeting_url:l.meetingUrl||'',minutes:Number(l.minutes||0),required:l.required!==false,quiz:l.quiz||null,sort_order:li},{onConflict:'id'});
      if(lr.error)throw lr.error;
      const cleared=await supabase.from('lms_materials').delete().eq('lesson_id',lid);
      if(cleared.error)throw cleared.error;
      for(let ri=0;ri<(l.resources||[]).length;ri++){
        const x=l.resources[ri],mr2=await supabase.from('lms_materials').insert({id:asId(x.id),lesson_id:lid,name:x.name||'Material',file_path:x.fileId||null,external_url:x.url||null,mime_type:x.mimeType||null,size_bytes:Number(x.size||0),sort_order:ri});
        if(mr2.error)throw mr2.error;
      }
    }
  }
  const removedLessons=(oldLessons.data||[]).map(x=>x.id).filter(x=>!keptLessonIds.includes(x));
  if(removedLessons.length){const removed=await supabase.from('lms_lessons').delete().in('id',removedLessons);if(removed.error)throw removed.error;}
  const removedModules=oldModuleIds.filter(x=>!keptModuleIds.includes(x));
  if(removedModules.length){const removed=await supabase.from('lms_modules').delete().in('id',removedModules);if(removed.error)throw removed.error;}
  return{ok:true,id,revision:1,published:status==='published'};
}
function studentFrom(req,res) { const s=sessionFrom(req,STUDENT_COOKIE,studentSessions);if(!s){json(res,401,{error:'Inicia sesión para acceder al aula.'});return null;}if(!csrfOk(req,s)){json(res,403,{error:'La sesión cambió. Vuelve a ingresar.'});return null;}return s; }
async function studentRow(id) { const r=await supabase.from('lms_students').select('*').eq('id',id).maybeSingle();if(r.error)throw r.error;return r.data; }
async function authUserByEmail(email) {
  const profile=await supabase.from('lms_students').select('id').eq('email',email).maybeSingle();
  if(profile.error)throw profile.error;
  if(profile.data?.id)return{id:profile.data.id,email};
  for(let page=1;page<=10;page++){
    const result=await supabase.auth.admin.listUsers({page,perPage:1000});
    if(result.error)throw result.error;
    const users=result.data?.users||[],found=users.find(user=>String(user.email||'').toLowerCase()===email);
    if(found)return found;
    if(users.length<1000)break;
  }
  return null;
}
async function ensureAuthUser(email,name,password,resetExisting=false) {
  let existing=await authUserByEmail(email);
  if(existing){
    const attributes={user_metadata:{full_name:name}};
    if(resetExisting&&password)attributes.password=password;
    const updated=await supabase.auth.admin.updateUserById(existing.id,attributes);
    if(updated.error)throw updated.error;
    return{user:updated.data.user||existing,created:false,passwordChanged:Boolean(resetExisting&&password)};
  }
  const created=await supabase.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name},app_metadata:{malba_lms_student:true}});
  if(!created.error)return{user:created.data.user,created:true,passwordChanged:true};
  if(!/already been registered|already exists|email_exists/i.test(String(created.error.code||'')+' '+String(created.error.message||'')))throw created.error;
  existing=await authUserByEmail(email);
  if(!existing)throw created.error;
  const attributes={user_metadata:{full_name:name}};
  if(resetExisting&&password)attributes.password=password;
  const updated=await supabase.auth.admin.updateUserById(existing.id,attributes);
  if(updated.error)throw updated.error;
  return{user:updated.data.user||existing,created:false,passwordChanged:Boolean(resetExisting&&password)};
}
async function saveEnrollment(studentId,courseId,active=true,expires='') {
  const existing=await supabase.from('lms_enrollments').select('id').eq('student_id',studentId).eq('course_id',courseId).maybeSingle();
  if(existing.error)throw existing.error;
  const payload={student_id:studentId,course_id:courseId,status:active?'active':'paused',expires_at:expires||null};
  const result=existing.data
    ?await supabase.from('lms_enrollments').update(payload).eq('id',existing.data.id)
    :await supabase.from('lms_enrollments').insert({id:asId(),...payload});
  if(result.error)throw result.error;
  return existing.data?.id||null;
}
async function studentCourses(studentId) { const er=await supabase.from('lms_enrollments').select('*').eq('student_id',studentId).in('status',['active','completed']);if(er.error)throw er.error;const out=[];for(const e of er.data||[]){if(e.expires_at&&e.expires_at<new Date().toISOString().slice(0,10))continue;const c=await getCourse(e.course_id,true);if(!c)continue;const pr=await supabase.from('lms_progress').select('lesson_id').eq('student_id',studentId).eq('course_id',e.course_id),required=lessonsFrom(c.modules).filter(l=>l.required),done=(pr.data||[]).map(x=>x.lesson_id),certificate=await supabase.from('lms_certificates').select('id,issued_at,snapshot').eq('student_id',studentId).eq('course_id',e.course_id).is('revoked_at',null).maybeSingle();for(const l of lessonsFrom(c.modules)){if(l.quiz?.questions)l.quiz={...l.quiz,questions:l.quiz.questions.map(q=>{const {correct,explanation,...safe}=q;return safe;})};l.completed=done.includes(l.id);}out.push({course:c,progress:{done,completed:done.filter(x=>required.some(l=>l.id===x)).length,total:required.length,percent:required.length?Math.round(done.filter(x=>required.some(l=>l.id===x)).length*100/required.length):0},lastLesson:e.last_lesson_id||'',expires:e.expires_at||'',certificate:certificate.data?{id:certificate.data.id,issued:Date.parse(certificate.data.issued_at)/1000}:null});}return out; }
function simplePdf(title,name,code) { const esc=s=>String(s).replace(/[()\\]/g,'\\$&');const stream=`BT /F1 22 Tf 72 700 Td (${esc(title)}) Tj /F1 14 Tf 0 -48 Td (Otorgado a: ${esc(name)}) Tj 0 -28 Td (Código de verificación: ${esc(code)}) Tj ET`;const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];let pdf='%PDF-1.4\n',offsets=[0];for(const [i,obj] of objs.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}const x=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;return Buffer.from(pdf); }

const DEMO_COURSE={
  id:'40000000-0000-4000-8000-000000000100',
  title:'Gestión de proyectos: planificación, riesgos y control · Demo completa',
  description:'Recorrido práctico para validar la experiencia del aula MALBA: contenido, videos, materiales, evaluación y certificado.',
  introduction:'En este curso de demostración dirigirás un caso breve de infraestructura eléctrica. Revisarás el alcance, la planificación, los riesgos y el cierre con recursos descargables y una evaluación final. Su contenido y certificado son exclusivamente demostrativos.',
  instructor:'Equipo MALBA PMC',hours:4,image:'assets/programs/pmo-960.webp',sourceProgramId:'',
  certificate:{enabled:true,title:'Certificado de demostración',statement:'Ha completado satisfactoriamente la experiencia de demostración del aula virtual MALBA PMC.',issuer:'Miguel Alba',role:'Director académico · MALBA PMC',signatureImage:''},
  modules:[
    {id:'41000000-0000-4000-8000-000000000101',title:'Fundamentos y planificación',description:'Define el resultado y organiza el trabajo.',lessons:[
      {id:'42000000-0000-4000-8000-000000000101',title:'Bienvenida y ruta de aprendizaje',type:'text',body:'Conoce el caso de práctica, los objetivos y la forma de avanzar. Encontrarás videos, lecturas descargables y un test breve. Marca cada lección cuando hayas revisado su contenido.',minutes:8,required:true,videoUrl:'',videoFileId:'',meetingUrl:'',resources:[{id:'43000000-0000-4000-8000-000000000101',name:'Lectura de referencia MALBA',url:'/assets/publications/gestiona-proyectos-edicion-7.pdf',fileId:''}]},
      {id:'42000000-0000-4000-8000-000000000102',title:'Planificación y decisiones del proyecto',type:'video',body:'Observa el video y registra tres decisiones que podrían afectar alcance, plazo o costo. Relaciona cada decisión con el resultado esperado del proyecto.',minutes:18,required:true,videoUrl:'https://www.youtube.com/watch?v=NrEJvAJ7NGo',videoFileId:'',meetingUrl:'',resources:[{id:'43000000-0000-4000-8000-000000000102',name:'Revista Gestiona Proyectos · Edición 6',url:'/assets/publications/gestiona-proyectos-edicion-6.pdf',fileId:''}]}
    ]},
    {id:'41000000-0000-4000-8000-000000000102',title:'Riesgos y control',description:'Anticipa eventos y revisa su efecto.',lessons:[
      {id:'42000000-0000-4000-8000-000000000103',title:'Riesgos que cambian el proyecto',type:'video',body:'Identifica la causa, el evento y la consecuencia de cada riesgo. Prioriza los riesgos que amenazan los objetivos y asigna una respuesta y un responsable.',minutes:20,required:true,videoUrl:'https://www.youtube.com/watch?v=RRj4MDh8rNQ',videoFileId:'',meetingUrl:'',resources:[{id:'43000000-0000-4000-8000-000000000103',name:'Gestión de riesgos · lectura complementaria',url:'/assets/publications/gestiona-proyectos-edicion-5.pdf',fileId:''}]},
      {id:'42000000-0000-4000-8000-000000000104',title:'Caso práctico: equipo crítico',type:'text',body:'Un equipo crítico podría retrasarse dos semanas. Analiza el impacto sobre el cronograma, compara las alternativas y define qué información necesita el responsable antes de tomar una decisión.',minutes:22,required:true,videoUrl:'',videoFileId:'',meetingUrl:'',resources:[{id:'43000000-0000-4000-8000-000000000104',name:'Caso práctico descargable',url:'/assets/publications/gestiona-proyectos-edicion-4.pdf',fileId:''}]}
    ]},
    {id:'41000000-0000-4000-8000-000000000103',title:'Evaluación y cierre',description:'Comprueba lo aprendido y completa la experiencia.',lessons:[
      {id:'42000000-0000-4000-8000-000000000105',title:'Test rápido de conocimientos',type:'quiz',body:'Responde las cuatro preguntas. Necesitas 75% para aprobar y puedes volver a intentarlo.',minutes:10,required:true,videoUrl:'',videoFileId:'',meetingUrl:'',resources:[],quiz:{passPercent:75,questions:[{question:'¿Qué debe definirse antes de organizar las actividades?',options:['El resultado esperado y los entregables','Solo el presupuesto','Únicamente la fecha final'],correct:0,explanation:'El alcance y los entregables orientan la organización del trabajo.'},{question:'¿Qué necesita un riesgo priorizado?',options:['Esperar a que ocurra','Respuesta, responsable y seguimiento','Solo un nombre'],correct:1,explanation:'Gestionar el riesgo requiere acciones, responsables y seguimiento.'},{question:'Antes de aceptar un cambio se debe revisar…',options:['Solo quién lo solicita','Su efecto en alcance, plazo, costo y riesgos','Solo el formato'],correct:1,explanation:'La decisión debe considerar todos los objetivos y restricciones.'},{question:'Una práctica de cierre útil es…',options:['Eliminar el registro','Consolidar lecciones aprendidas','Dejar todos los pendientes abiertos'],correct:1,explanation:'El cierre debe conservar el aprendizaje y formalizar la aceptación.'}]}},
      {id:'42000000-0000-4000-8000-000000000106',title:'Cierre y certificado',type:'text',body:'Confirma la aceptación de los entregables, registra decisiones y pendientes, y conserva las lecciones aprendidas. Cuando completes las lecciones obligatorias podrás descargar el certificado de demostración.',minutes:7,required:true,videoUrl:'',videoFileId:'',meetingUrl:'',resources:[{id:'43000000-0000-4000-8000-000000000106',name:'Ejemplo visual de certificado',url:'/assets/academia/certificado.webp',fileId:''}]}
    ]}
  ]
};

async function cmsApi(req,res,url) {
  if(req.method==='GET'&&url.pathname==='/api/public-settings'){const d=await getDocument(),settings=normalizeSiteSettings(d.published?.siteSettings||d.draft?.siteSettings||{});return json(res,200,settings);}
  if(req.method==='GET'&&url.pathname==='/api/session'){const s=sessionFrom(req,ADMIN_COOKIE,adminSessions);return json(res,200,{authenticated:!!s,username:s?.username||null,csrf:s?.csrf||null});}
  if(req.method==='POST'&&url.pathname==='/api/login'){const b=await requestBody(req);if(!process.env.CMS_ADMIN_USER||String(b.username||'')!==process.env.CMS_ADMIN_USER||String(b.password||'')!==process.env.CMS_ADMIN_PASSWORD)return json(res,401,{error:'Usuario o contraseña incorrectos.'});const value=newSession(process.env.CMS_ADMIN_USER),session=decodeToken(value);return json(res,200,{username:process.env.CMS_ADMIN_USER,csrf:session.csrf},{'Set-Cookie':cookie(ADMIN_COOKIE,value)});}
  if(req.method==='POST'&&url.pathname==='/api/logout'){const s=sessionFrom(req,ADMIN_COOKIE,adminSessions);if(s)adminSessions.delete(s.id);return json(res,200,{ok:true},{'Set-Cookie':cookie(ADMIN_COOKIE,'',0)});}
  const admin=requireAdmin(req,res);if(!admin)return true;if(req.method==='POST'&&!csrfOk(req,admin))return json(res,403,{error:'La sesión cambió. Recarga el panel.'});
  if(req.method==='GET'&&url.pathname==='/api/lms/admin')return json(res,200,await lmsAdminState());
  if(req.method==='GET'&&url.pathname==='/api/content'){const d=await getDocument();return json(res,200,{data:d.draft,revision:d.revision,updated:Date.parse(d.updated_at||'')/1000||Date.now()/1000,publishedAt:Date.parse(d.published_at||'')/1000||null,publishedIds:(d.published?.programs||[]).map(x=>x.id),dirty:JSON.stringify(d.draft)!==JSON.stringify(d.published)});}
  if(req.method==='GET'&&url.pathname==='/api/history'){const rows=supabase?(await supabase.from('cms_history').select('id,revision,username,created_at').order('created_at',{ascending:false}).limit(30)).data:fallbackHistory;return json(res,200,(rows||[]).map(x=>({id:x.id,revision:x.revision,username:x.username,created:x.created_at})));}
  if(req.method==='GET'&&url.pathname==='/api/export'){const d=await getDocument();return text(res,200,JSON.stringify({draft:d.draft,published:d.published,revision:d.revision},null,2),'application/json; charset=utf-8',{'Content-Disposition':'attachment; filename="malba-pmc-contenido.json"'});}
  if((req.method==='GET'||req.method==='POST')&&url.pathname==='/api/preview')return json(res,200,{url:new URL('/',`http://${req.headers.host||'localhost'}`).toString()});
  const b=await requestBody(req);
  if(req.method==='POST'&&url.pathname==='/api/site-settings'){const saved=await saveSiteSettings(b);return json(res,200,{ok:true,settings:saved.published.siteSettings,revision:saved.revision});}
  if(req.method==='POST'&&(url.pathname==='/api/upload'||url.pathname==='/api/upload-pdf')){const raw=Buffer.from(String(b.content||''),'base64');if(!raw.length)throw new Error('Archivo vacío.');const isPdf=url.pathname.endsWith('pdf');if(isPdf&&!raw.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('El archivo no es un PDF válido.');return json(res,200,await storeCmsFile(raw,isPdf,isPdf?'application/pdf':'image/webp'));}
  if(req.method==='POST'&&['/api/draft','/api/publish'].includes(url.pathname)){const d=await getDocument();if(Number(b.revision)!==Number(d.revision))return json(res,409,{error:'Hay una edición más reciente. Recarga el panel.'});const publishing=url.pathname==='/api/publish';
    // Validate and compile all public pages before committing a publication.
    const generated=publishing?compilePublicPages(b.data):null;
    const saved=await saveDocument({...d,draft:b.data},publishing);
    if(publishing){publicPageCache={version:String(saved.published_at||'')+':'+String(saved.revision||0),pages:generated};publicPageCacheTime=Date.now();}
    return json(res,200,{ok:true,revision:saved.revision,updated:Date.parse(saved.updated_at||'')/1000||Date.now()/1000,applied:publishing});}
  if(req.method==='POST'&&url.pathname==='/api/visibility'){const d=await getDocument(),next=structuredClone(b.data),records=b.area==='academy'?next.programs:(next.publications?.items||[]),item=records.find(x=>x.id===b.id);if(!item)return json(res,404,{error:'Contenido no encontrado.'});item.visibility=b.visibility;const saved=await saveDocument({...d,draft:next},false);return json(res,200,{revision:saved.revision,updated:Date.parse(saved.updated_at||'')/1000||Date.now()/1000,dirty:true,applied:false});}
  if(req.method==='POST'&&url.pathname==='/api/restore'){const d=await getDocument();let row;if(supabase)row=(await supabase.from('cms_history').select('data').eq('id',b.id).maybeSingle()).data;else row=fallbackHistory.find(x=>String(x.id)===String(b.id));if(!row)return json(res,404,{error:'Versión no encontrada.'});if(Number(b.revision)!==Number(d.revision))return json(res,409,{error:'Hay una edición más reciente. Recarga el panel.'});const saved=await saveDocument({...d,draft:row.data},false);return json(res,200,{data:saved.draft,revision:saved.revision,updated:Date.parse(saved.updated_at||'')/1000||Date.now()/1000});}
  return false;
}

async function lmsApi(req,res,url) {
  if(url.pathname==='/api/lms/login'&&req.method==='POST'){if(!supabase)return json(res,503,{error:'El backend del aula no está configurado.'});const b=await requestBody(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');const auth=await verifyStudentPassword(email,password);if(auth.error||!auth.data.user)return json(res,401,{error:'Correo o contraseña incorrectos.'});const user=await supabase.from('lms_students').select('*').eq('id',auth.data.user.id).maybeSingle();if(user.error)throw user.error;if(!user.data||!user.data.active||user.data.deleted_at)return json(res,403,{error:'Tu acceso al aula está deshabilitado.'});const value=newStudentSession(user.data),id=value.split('.')[0];return json(res,200,{ok:true},{'Set-Cookie':cookie(STUDENT_COOKIE,value)});}
  if(url.pathname==='/api/lms/session'&&req.method==='GET'){const s=sessionFrom(req,STUDENT_COOKIE,studentSessions);if(!s)return json(res,200,{authenticated:false,student:null,csrf:null});const st=await studentRow(s.studentId);return json(res,200,{authenticated:!!st&&!!st.active&&!st.deleted_at,student:st?{student_id:st.id,name:st.full_name,email:st.email,force_password:!!st.force_password_change}:null,csrf:s.csrf});}
  if(url.pathname==='/api/lms/verify'&&req.method==='GET'){const code=url.searchParams.get('code')||'';if(!supabase)return json(res,404,{error:'Certificado no encontrado o revocado.'});const q=await supabase.from('lms_certificates').select('id,verification_code,snapshot,issued_at').or(`id.eq.${code},verification_code.eq.${code}`).is('revoked_at',null).maybeSingle();if(q.error||!q.data)return json(res,404,{error:'Certificado no encontrado o revocado.'});return json(res,200,{name:q.data.snapshot?.name||'',title:q.data.snapshot?.title||'',issued:Date.parse(q.data.issued_at)/1000,code:q.data.verification_code||q.data.id});}
  if(url.pathname.startsWith('/api/lms/admin')){const admin=requireAdmin(req,res);if(!admin)return true;if(req.method==='POST'&&!csrfOk(req,admin))return json(res,403,{error:'La sesión cambió. Recarga el panel.'});if(url.pathname==='/api/lms/admin')return json(res,200,await lmsAdminState());
    if(req.method==='GET'&&url.pathname==='/api/lms/admin/preview'){const c=await getCourse(url.searchParams.get('course'));return c?json(res,200,{course:c}):json(res,404,{error:'Curso no encontrado.'});}
    if(req.method==='GET'&&url.pathname==='/api/lms/admin/certificate-preview'){const c=await getCourse(url.searchParams.get('course'));if(!c)return json(res,404,{error:'Curso no encontrado.'});return text(res,200,simplePdf('VISTA PREVIA · '+c.certificate.title,'Alumno de ejemplo','VISTA-PREVIA'),'application/pdf',{'Content-Disposition':'inline; filename="vista-certificado.pdf"'});}
    if(req.method==='GET'&&url.pathname==='/api/lms/admin/students/export'){const state=await lmsAdminState(),courseNames=new Map(state.courses.map(c=>[c.id,c.draft.title])),rows=state.students.map(student=>({'Nombre':student.name,'Correo':student.email,'Estado':student.deleted?'Papelera':student.active?'Activo':'Deshabilitado','Cursos':state.enrollments.filter(e=>e.student_id===student.id&&e.active).map(e=>courseNames.get(e.course_id)).filter(Boolean).join(', ')}));const file=await studentWorkbook(rows);return text(res,200,file,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{'Content-Disposition':'attachment; filename="alumnos-malba-pmc.xlsx"'});}
    if(req.method==='GET'&&url.pathname==='/api/lms/admin/students/template'){const file=await studentWorkbook([],true);return text(res,200,file,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{'Content-Disposition':'attachment; filename="plantilla-alumnos-malba.xlsx"'});}
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/upload'){const raw=await rawBody(req),name=decodeURIComponent(String(req.headers['x-file-name']||'material')),courseId=String(req.headers['x-course-id']||'');if(!/^[0-9a-f-]{36}$/i.test(courseId))throw new Error('Curso inválido.');const mime=String(req.headers['content-type']||'application/octet-stream');return json(res,200,await storeLmsFile(raw,courseId,name,mime));}
    const b=await requestBody(req);
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/demo-course'){const existing=await getCourse(DEMO_COURSE.id);if(existing)return json(res,200,{ok:true,created:false,id:DEMO_COURSE.id});const result=await saveCourse(structuredClone(DEMO_COURSE),true);return json(res,200,{...result,created:true});}
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/course/save')return json(res,200,await saveCourse(b.course,b.publish===true));
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/course/status'){const r=await supabase.from('lms_courses').update({status:b.active?'published':'hidden'}).eq('id',b.id);if(r.error)throw r.error;return json(res,200,{ok:true});}
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/student'){
      if(['toggle','delete','restore'].includes(b.action)){
        const update=b.action==='delete'?{active:false,deleted_at:new Date().toISOString()}:b.action==='restore'?{active:true,deleted_at:null}:{};
        if(b.action==='toggle'){const old=await studentRow(b.id);update.active=!old.active;}
        const r=await supabase.from('lms_students').update(update).eq('id',b.id);if(r.error)throw r.error;
        return json(res,200,{ok:true});
      }
      const name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase();
      if(!name||!email)throw new Error('Completa nombre y correo.');
      const requested=[...new Set([...(Array.isArray(b.courseIds)?b.courseIds:[]),...(b.courseId?[b.courseId]:[])].filter(Boolean))];
      if(requested.length>100)throw new Error('Selecciona hasta 100 cursos.');
      const selectedCourses=await Promise.all(requested.map(id=>getCourse(id,true)));
      if(selectedCourses.some(c=>!c))throw new Error('Todos los cursos deben estar publicados antes de matricular alumnos.');
      const trace=crypto.randomUUID().slice(0,8);console.info('LMS student write start',trace);
      let user,password=String(b.password||''),forcePassword=Boolean(password),created=false,reactivated=false;
      if(password&&password.length<12)throw new Error('La nueva contraseña temporal debe tener al menos 12 caracteres.');
      if(b.id){
        const existing=await studentRow(b.id);
        if(!existing||existing.deleted_at)return json(res,409,{error:'Este alumno no está activo. Restáuralo o créalo nuevamente desde Alumnos.'});
        if(String(existing.email||'').trim().toLowerCase()!==email)return json(res,409,{error:'El correo de acceso no puede modificarse desde Editar alumno. Crea un nuevo acceso para otro correo.'});
        const authAttributes={user_metadata:{full_name:name}};
        if(password)authAttributes.password=password;
        const updated=await supabase.auth.admin.updateUserById(b.id,authAttributes);
        if(updated.error)throw updated.error;
        forcePassword=password?true:!!existing.force_password_change;
        user=updated.data.user||{id:b.id};
      }else{
        // Borrar desde el CMS solo envía a papelera. Re-crear con el mismo correo
        // debe actualizar de forma explícita la contraseña de Supabase Auth.
        password=password||`Malba-${crypto.randomBytes(8).toString('hex')}`;
        const authAccount=await authUserByEmail(email);
        if(authAccount){
          const previous=await studentRow(authAccount.id);
          if(previous&&!previous.deleted_at)return json(res,409,{error:'Ya existe un alumno con este correo. Utiliza Editar alumno para gestionar su acceso.'});
          // An interrupted registration may have created Auth but not the student profile.
          // Only reclaim orphan Auth users that were explicitly provisioned for this LMS.
          const appManaged=authAccount.app_metadata?.malba_lms_student===true;
          if(!previous&&!appManaged)return json(res,409,{error:'Este correo pertenece a una cuenta externa. No se modificaron sus credenciales.'});
          const restored=await supabase.auth.admin.updateUserById(authAccount.id,{password,user_metadata:{full_name:name},app_metadata:{...(authAccount.app_metadata||{}),malba_lms_student:true}});
          if(restored.error)throw restored.error;
          user=restored.data.user||authAccount;
          reactivated=true;
          forcePassword=true;
        }else{
          const ensured=await ensureAuthUser(email,name,password,false);
          if(!ensured.created)return json(res,409,{error:'Este correo ya está registrado. Actualiza el listado y vuelve a intentarlo.'});
          user=ensured.user;
          created=true;
          forcePassword=true;
        }
      }
      console.info('LMS student Auth ready',trace,created?'created':reactivated?'reused':'updated');
      const up=await supabase.from('lms_students').upsert({id:user.id,full_name:name,email,active:b.active!==false,deleted_at:null,force_password_change:forcePassword}).select('id').single();
      if(up.error){
        // Best-effort rollback avoids leaving an unusable Auth-only account.
        if(created){const rollback=await supabase.auth.admin.deleteUser(user.id);if(rollback.error)console.error('LMS profile rollback failed',rollback.error);}
        throw up.error;
      }
      console.info('LMS student profile saved',trace);
      let emailStatus={sent:false,reason:'No solicitado.'};
      for(const id of requested)await saveEnrollment(user.id,id,true,b.expires||'');
      if(b.sendEmail&&(selectedCourses.length||password)){
        try{emailStatus=await sendWelcomeEmail({name,email},selectedCourses.length?selectedCourses:{title:'tus programas MALBA PMC'},password);}
        catch(error){emailStatus={sent:false,reason:'SMTP: '+String(error.message||error).slice(0,180)};}
      }
      return json(res,200,{ok:true,id:user.id,created,reactivated,email:emailStatus});
    }
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/students/import'){
      const raw=Buffer.from(String(b.content||''),'base64'),filename=String(b.filename||'');
      if(!/\.xlsx$/i.test(filename))throw new Error('Sube un archivo Excel .xlsx. Puedes descargar la plantilla desde esta ventana.');
      if(raw.length>5*1024*1024)throw new Error('El Excel debe pesar menos de 5 MB.');
      const rows=await parseExcelRows(raw);
      if(!rows.length)throw new Error('El Excel no contiene alumnos.');
      if(rows.length>500)throw new Error('Puedes importar hasta 500 alumnos por archivo.');
      const importCourse=b.courseId?await getCourse(b.courseId,true):null;
      if(b.courseId&&!importCourse)throw new Error('El curso debe estar publicado antes de importar matrículas.');
      const errors=[];let created=0,updated=0,enrolled=0,emailsSent=0;
      for(let i=0;i<rows.length;i++){
        const row=rows[i];
        try{
          const email=String(row.correo||row['correo electrónico']||row.email||'').trim().toLowerCase(),name=String(row.nombre||row['nombre completo']||row.name||email).trim();
          if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('correo inválido o vacío');
          const supplied=String(row.contraseña||row.password||''),password=supplied||`Malba-${crypto.randomBytes(8).toString('hex')}`;
          if(supplied&&supplied.length<12)throw new Error('la contraseña debe tener al menos 12 caracteres');
          const authAccount=await authUserByEmail(email);
          const previous=authAccount?await studentRow(authAccount.id):null;
          if(authAccount&&!previous)throw new Error('el correo pertenece a una cuenta que no es alumno');
          let ensured;
          if(previous?.deleted_at){
            const restored=await supabase.auth.admin.updateUserById(authAccount.id,{password,user_metadata:{full_name:name}});
            if(restored.error)throw restored.error;
            ensured={user:restored.data.user||authAccount,created:false,passwordChanged:true};
          }else ensured=await ensureAuthUser(email,name,password,false);
          const forcePassword=ensured.passwordChanged||!!previous?.force_password_change;
          const status=String(row.estado||'Activo').trim().toLocaleLowerCase('es'),active=!['deshabilitado','inactivo','no'].includes(status);
          const profile=await supabase.from('lms_students').upsert({id:ensured.user.id,full_name:name,email,active,deleted_at:null,force_password_change:forcePassword});
          if(profile.error)throw profile.error;
          if(b.courseId){await saveEnrollment(ensured.user.id,b.courseId,active,'');enrolled++;}
          if(b.sendEmail&&b.courseId&&active){const sent=await sendWelcomeEmail({name,email},importCourse,ensured.passwordChanged?password:'');if(sent.sent)emailsSent++;}
          if(ensured.created)created++;else updated++;
        }catch(e){errors.push({row:i+2,message:String(e.message||e)});}
      }
      return json(res,200,{ok:true,created,updated,enrolled,emailsSent,errors});
    }
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/students/bulk'){const ids=[...new Set((Array.isArray(b.ids)?b.ids:[]).filter(id=>/^[0-9a-f-]{36}$/i.test(id)))];if(!ids.length||ids.length>500)throw new Error('Selecciona entre 1 y 500 alumnos.');const updates={enable:{active:true,deleted_at:null},disable:{active:false},delete:{active:false,deleted_at:new Date().toISOString()},restore:{active:true,deleted_at:null}},payload=updates[b.action];if(!payload)throw new Error('Acción masiva no válida.');const changed=await supabase.from('lms_students').update(payload).in('id',ids);if(changed.error)throw changed.error;return json(res,200,{ok:true,updated:ids.length});}
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/students/bulk-enroll'){const ids=[...new Set((Array.isArray(b.ids)?b.ids:[]).filter(id=>/^[0-9a-f-]{36}$/i.test(id)))];if(!ids.length||ids.length>500)throw new Error('Selecciona entre 1 y 500 alumnos.');const courseIds=[...new Set([...(Array.isArray(b.courseIds)?b.courseIds:[]),...(b.courseId?[b.courseId]:[])].filter(Boolean))];if(!courseIds.length||courseIds.length>100)throw new Error('Selecciona entre 1 y 100 cursos.');const courses=await Promise.all(courseIds.map(id=>getCourse(id,true)));if(courses.some(c=>!c))throw new Error('Selecciona únicamente cursos publicados.');let enrolled=0,emailsSent=0;const errors=[];for(const id of ids){try{const student=await studentRow(id);if(!student||student.deleted_at)throw new Error('alumno no disponible');for(const courseId of courseIds){await saveEnrollment(id,courseId,true,'');enrolled++;}if(b.sendEmail){const sent=await sendWelcomeEmail({name:student.full_name,email:student.email},courses,'');if(sent.sent)emailsSent++;}}catch(error){errors.push({id,message:String(error.message||error).slice(0,180)});}}return json(res,200,{ok:true,enrolled,emailsSent,errors});}
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/enroll'){const course=await getCourse(b.courseId,true);if(!course)throw new Error('El curso debe estar publicado antes de matricular alumnos.');const existing=await supabase.from('lms_enrollments').select('id').eq('student_id',b.studentId).eq('course_id',b.courseId).maybeSingle();if(existing.error)throw existing.error;const payload={student_id:b.studentId,course_id:b.courseId,status:b.active===false?'paused':'active',expires_at:b.expires||null};const en=existing.data?await supabase.from('lms_enrollments').update(payload).eq('id',existing.data.id):await supabase.from('lms_enrollments').insert({id:asId(),...payload});if(en.error)throw en.error;let email={sent:false,reason:'No solicitado.'};if(b.sendEmail&&b.active!==false){const user=await studentRow(b.studentId);try{email=await sendWelcomeEmail({name:user.full_name,email:user.email},course,'');}catch(error){email={sent:false,reason:'SMTP: '+String(error.message||error).slice(0,180)};}}return json(res,200,{ok:true,email});}
    if(req.method==='POST'&&url.pathname==='/api/lms/admin/certificate/revoke'){const r=await supabase.from('lms_certificates').update({revoked_at:new Date().toISOString()}).eq('id',b.id);if(r.error)throw r.error;return json(res,200,{ok:true});}
    return json(res,404,{error:'Ruta de administración LMS no encontrada.'});
  }
  if(url.pathname==='/api/lms/logout'&&req.method==='POST'){const s=studentFrom(req,res);if(!s)return true;studentSessions.delete(s.id);return json(res,200,{ok:true},{'Set-Cookie':cookie(STUDENT_COOKIE,'',0)});}
  let student=null;let st=null;const adminFileRequest=req.method==='GET'&&(url.pathname.startsWith('/api/lms/files/')||url.pathname.startsWith('/api/lms/certificate/'))&&!!sessionFrom(req,ADMIN_COOKIE,adminSessions);if(!adminFileRequest)student=studentFrom(req,res);if(!student&&!adminFileRequest)return true;if(student){st=await studentRow(student.studentId);if(!st||!st.active||st.deleted_at)return json(res,403,{error:'Tu acceso está deshabilitado.'});}
  if(req.method==='GET'&&url.pathname==='/api/lms/me'){const courses=await studentCourses(st.id);const certs=await supabase.from('lms_certificates').select('id,issued_at,snapshot').eq('student_id',st.id).is('revoked_at',null);return json(res,200,{courses,certificates:(certs.data||[]).map(c=>({id:c.id,issued:Date.parse(c.issued_at)/1000,title:c.snapshot?.title||''}))});}
  if(req.method==='POST'&&url.pathname==='/api/lms/password'){const b=await requestBody(req);if(String(b.password||'').length<12)throw new Error('Usa al menos 12 caracteres.');const auth=await verifyStudentPassword(st.email,String(b.currentPassword||''));if(auth.error)throw new Error('La contraseña actual no es correcta.');const u=await supabase.auth.admin.updateUserById(st.id,{password:String(b.password)});if(u.error)throw u.error;const r=await supabase.from('lms_students').update({force_password_change:false}).eq('id',st.id);if(r.error)throw r.error;return json(res,200,{ok:true});}
  if(req.method==='GET'&&url.pathname.startsWith('/api/lms/files/')){const id=decodeURIComponent(url.pathname.slice('/api/lms/files/'.length));if(!/^[a-zA-Z0-9._-]{8,240}$/.test(id))return json(res,400,{error:'Archivo inválido.'});if(student){const linked=await supabase.from('lms_materials').select('lesson_id').eq('file_path',id).maybeSingle();if(linked.error||!linked.data)return json(res,404,{error:'Archivo no encontrado.'});const lesson=await supabase.from('lms_lessons').select('module_id').eq('id',linked.data.lesson_id).maybeSingle(),module=lesson.data?await supabase.from('lms_modules').select('course_id').eq('id',lesson.data.module_id).maybeSingle():{data:null};const enrollment=module.data?await supabase.from('lms_enrollments').select('id').eq('student_id',student.studentId).eq('course_id',module.data.course_id).in('status',['active','completed']).maybeSingle():{data:null};if(!enrollment.data)return json(res,403,{error:'Este archivo no pertenece a tu curso.'});}let data;try{data=await downloadLmsFile(id);}catch{return json(res,404,{error:'Archivo no encontrado.'});}const isPdf=/\.pdf$/i.test(id);if(url.searchParams.get('render')==='1'&&isPdf){const tmp=path.join('/tmp',`malba-pdf-${crypto.randomBytes(6).toString('hex')}`),page=Math.max(1,Number(url.searchParams.get('page')||1)),full=tmp+'.pdf';fs.writeFileSync(full,data);const rendered=spawnSync('pdftoppm',['-f',String(page),'-l',String(page),'-png','-singlefile',full,tmp],{timeout:15000});const image=tmp+'.png';try{fs.unlinkSync(full);}catch{}if(rendered.status===0&&fs.existsSync(image)){const preview=fs.readFileSync(image);try{fs.unlinkSync(image);}catch{}return text(res,200,preview,'image/png',{'X-PDF-Pages':String(page)});}return json(res,501,{error:'La vista previa PDF no está disponible en este servidor. Descarga el archivo para abrirlo.'});}return text(res,200,data,MIME[path.extname(id).toLowerCase()]||'application/octet-stream',{'Content-Disposition':`inline; filename="${safeUploadName(id.split('--').pop())}"`});}
  if(req.method==='GET'&&url.pathname.startsWith('/api/lms/certificate/')){const id=path.basename(url.pathname,'.pdf'),r=await supabase.from('lms_certificates').select('snapshot,issued_at').eq('id',id).is('revoked_at',null).maybeSingle();if(!r.data)return json(res,404,{error:'Certificado no encontrado.'});return text(res,200,simplePdf(r.data.snapshot?.title||'Certificado',r.data.snapshot?.name||(st?.full_name||'Alumno MALBA PMC'),id),'application/pdf',{'Content-Disposition':`attachment; filename="Certificado-MALBA-${id.slice(0,8)}.pdf"`});}
  const b=await requestBody(req);
  if(req.method==='POST'&&url.pathname==='/api/lms/progress'){const c=await getCourse(b.courseId,true),lesson=lessonsFrom(c?.modules).find(x=>x.id===b.lessonId);if(!lesson)throw new Error('Lección no encontrada.');if(lesson.type==='quiz'&&b.completed===true)throw new Error('Aprueba el test para completar esta lección.');if(b.completed===true)await supabase.from('lms_progress').upsert({student_id:st.id,course_id:c.id,lesson_id:lesson.id,completed_at:new Date().toISOString()});if(b.completed===false)await supabase.from('lms_progress').delete().match({student_id:st.id,course_id:c.id,lesson_id:lesson.id});await supabase.from('lms_enrollments').update({last_lesson_id:lesson.id}).match({student_id:st.id,course_id:c.id});const current=(await studentCourses(st.id)).find(x=>x.course.id===c.id);let certificate=current?.certificate||null;if(current&&current.progress.total>0&&current.progress.completed>=current.progress.total&&c.certificate.enabled&&!certificate){const created=await supabase.from('lms_certificates').insert({student_id:st.id,course_id:c.id,verification_code:crypto.randomUUID(),snapshot:{name:st.full_name,title:c.title,hours:c.hours,certificate:c.certificate}}).select('id,issued_at').single();if(!created.error)certificate={id:created.data.id,issued:Date.parse(created.data.issued_at)/1000};}return json(res,200,{progress:current?.progress||{percent:0},certificate});}
  if(req.method==='POST'&&url.pathname==='/api/lms/quiz'){const c=await getCourse(b.courseId,true),lesson=lessonsFrom(c?.modules).find(x=>x.id===b.lessonId);if(!lesson||lesson.type!=='quiz')throw new Error('Test no encontrado.');const qs=lesson.quiz?.questions||[],answers=b.answers||[];if(answers.length!==qs.length)throw new Error('Responde todas las preguntas.');const score=Math.round(answers.reduce((n,a,i)=>n+(Number(a)===Number(qs[i].correct)?1:0),0)*100/qs.length),passed=score>=Number(lesson.quiz.passPercent||70);if(passed)await supabase.from('lms_progress').upsert({student_id:st.id,course_id:c.id,lesson_id:lesson.id,completed_at:new Date().toISOString()});const current=(await studentCourses(st.id)).find(x=>x.course.id===c.id);let certificate=current?.certificate||null;if(current&&current.progress.total>0&&current.progress.completed>=current.progress.total&&c.certificate.enabled&&!certificate){const created=await supabase.from('lms_certificates').insert({student_id:st.id,course_id:c.id,verification_code:crypto.randomUUID(),snapshot:{name:st.full_name,title:c.title,hours:c.hours,certificate:c.certificate}}).select('id,issued_at').single();if(!created.error)certificate={id:created.data.id,issued:Date.parse(created.data.issued_at)/1000};}return json(res,200,{score,passed,feedback:qs.map((q,i)=>({correct:Number(answers[i])===Number(q.correct),explanation:q.explanation||''})),progress:current?.progress||{percent:0},certificate});}
  return json(res,404,{error:'Ruta LMS no encontrada.'});
}

async function api(req,res,url) { if(url.pathname.startsWith('/api/public-asset/'))return publicAsset(req,res,url);if(url.pathname.startsWith('/api/lms/'))return lmsApi(req,res,url);return cmsApi(req,res,url); }
const server=http.createServer(async(req,res)=>{const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);try{if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true,service:'malba-pmc',version:APP_VERSION,supabase:!!supabase});if((req.method==='GET'||req.method==='HEAD')&&REDIRECTS[url.pathname]){res.writeHead(301,{'Location':REDIRECTS[url.pathname],'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});return res.end();}if(url.pathname.startsWith('/api/')){const handled=await api(req,res,url);if(handled!==false)return;}if(req.method!=='GET'&&req.method!=='HEAD')return text(res,405,'Método no permitido.');
    // Runtime pages reflect the published CMS revision (also after server restart).
    const pagePath=publicPagePath(url.pathname);
    if(pagePath&&!/^(?:aula-virtual|dashboard|verificar-certificado)\//.test(pagePath)&&(pagePath.endsWith('/index.html')||pagePath==='index.html'||pagePath==='sitemap.xml')){
      try {
        const snapshot=await getPublicPages();
        if(snapshot.pages.has(pagePath)){
          if(req.method==='HEAD'){res.writeHead(200,{'Content-Type':pagePath.endsWith('.xml')?'application/xml; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end();}
          return servePublishedPage(res,pagePath,snapshot.pages.get(pagePath));
        }
        // A removed program must not remain accessible via its old static file.
        if(pagePath.endsWith('/index.html'))return text(res,404,'Página no publicada.');
      } catch(error) {
        // Site remains accessible even when the Python renderer is unavailable.
        console.error('Public CMS rendering unavailable; serving last static fallback',error);
      }
    }
    const file=safeFile(url.pathname);if(!file)return text(res,404,'Recurso no encontrado.');if(req.method==='HEAD'){res.writeHead(200,{'Content-Type':MIME[path.extname(file).toLowerCase()]||'application/octet-stream','X-Content-Type-Options':'nosniff'});return res.end();}return serve(res,file);}catch(error){const requestId=crypto.randomUUID();console.error(requestId,error);return json(res,500,{error:error.message&&process.env.NODE_ENV!=='production'?error.message:'No se pudo completar la operación.',requestId});}});
server.listen(PORT,'0.0.0.0',()=>console.log(`MALBA PMC listening on ${PORT}`));
module.exports=server;
