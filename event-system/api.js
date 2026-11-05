'use strict';
const crypto=require('node:crypto');
const createDemo=require('./demo');
const createPayments=require('./payments');
const CAPACITY='La inscripción al evento está sujeta al aforo disponible y no garantiza el ingreso. Recomendamos llegar con anticipación y seguir las indicaciones de la organización. La adquisición del libro no otorga prioridad ni garantiza el acceso al evento.';
const SLUG='presentacion-libro';
const DELIVERY='Recojo en el lugar del evento';
const DEFAULT={title:'Presentación del libro de Miguel Alba',date:'2026-11-27T19:00:00-05:00',location:'Consejo Nacional del Colegio de Ingenieros del Perú',capacity:50,deadline:null,status:'draft',registrationOpen:false,waitlist:false,price:129,regularPrice:169,launchUntil:'2026-11-28T00:00:00-05:00',taxIncluded:true,priceConfirmed:true,bookAvailable:false,paymentMode:'disabled',deliveries:[DELIVERY],adminEmail:'',privacyUrl:'https://olivedrab-mouse-758184.hostingersite.com/evento/presentacion-libro/privacidad.html'};
const clean=(v,n)=>String(v||'').trim().slice(0,n);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function priceAt(c,now=Date.now()){return c.regularPrice&&c.launchUntil&&now>=Date.parse(c.launchUntil)?Number(c.regularPrice):Number(c.price);}
function validateRegistration(b){
 const p={name:clean(b.name,150),email:clean(b.email,254).toLowerCase(),phone:clean(b.phone,20),company:clean(b.company,150),position:clean(b.position,120),mode:b.mode,delivery:b.mode==='book'?DELIVERY:'',utm:{}};
 if(p.name.length<3||!/^\S+@[^\s@]+\.[^\s@]+$/.test(p.email)||!/^\+?[\d ()-]{7,20}$/.test(p.phone)||p.phone.replace(/\D/g,'').length<7)throw Error('Revisa tu nombre, correo electrónico y celular.');
 if(!['free','book'].includes(p.mode)||b.consent!==true||b.capacity!==true)throw Error('Selecciona una modalidad y acepta la política y el aviso de aforo.');
 if(b.website)throw Error('No se pudo validar la solicitud.');
 for(const k of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'])if(b.utm?.[k])p.utm[k]=clean(b.utm[k],100);
 return p;
}
function validateConfig(b){
 const c={...DEFAULT};for(const k of ['title','location','adminEmail','privacyUrl'])c[k]=clean(b[k],k==='location'?300:180);
 for(const k of ['registrationOpen','waitlist','priceConfirmed','bookAvailable'])c[k]=b[k]===true;
 c.status=['draft','published','closed','cancelled'].includes(b.status)?b.status:'draft';
 c.paymentMode=['sandbox','production'].includes(b.paymentMode)?b.paymentMode:'disabled';
 for(const k of ['date','deadline','launchUntil']){c[k]=b[k]?new Date(b[k]).toISOString():null;}
 c.capacity=b.capacity===''||b.capacity==null?null:Number(b.capacity);c.price=b.price===''||b.price==null?null:Number(b.price);
 if(c.capacity!==null&&(!Number.isInteger(c.capacity)||c.capacity<1||c.capacity>100000))throw Error('Configura un aforo válido.');
 if(c.price!==null&&(!Number.isFinite(c.price)||c.price<=0||c.price>99999))throw Error('Configura un precio válido.');
 c.regularPrice=b.regularPrice==null?null:Number(b.regularPrice);c.taxIncluded=true;
 if(c.regularPrice!==null&&(!Number.isFinite(c.regularPrice)||c.regularPrice<c.price||c.regularPrice>99999))throw Error('Configura un precio regular válido.');
 if(c.adminEmail&&!/^\S+@[^\s@]+\.[^\s@]+$/.test(c.adminEmail))throw Error('Correo administrativo inválido.');
 c.deliveries=[DELIVERY];
 if(c.privacyUrl&&!/^https:\/\/[^\s]+$/.test(c.privacyUrl))throw Error('Usa una URL HTTPS para la política de privacidad.');
 if(c.registrationOpen&&(!c.privacyUrl||!c.date||!c.location||!c.capacity||!(c.adminEmail||process.env.MALBA_CONTACT_RECIPIENT||process.env.SMTP_USER)||c.status!=='published'||Date.parse(c.date)<=Date.now()))throw Error('Para abrir inscripciones completa fecha futura, sede, aforo, correo administrativo, política de privacidad y estado publicado.');
 if(c.deadline&&c.date&&Date.parse(c.deadline)>Date.parse(c.date))throw Error('El cierre no puede ser posterior al evento.');
 if(c.bookAvailable&&(!c.priceConfirmed||!c.price||!c.deliveries.length||!['sandbox','production'].includes(c.paymentMode)))throw Error('Confirma precio, entrega y modalidad de pago antes de habilitar la compra.');
 return c;
}
module.exports=function createEventApi({db,json,text,requireAdmin,csrfOk,nodemailer,ExcelJS,sign}){
 const limits=new Map();
 const payments=createPayments({db,json,text,requireAdmin,csrfOk,sign});
 const demo=createDemo({json,requireAdmin,csrfOk,sign,defaults:DEFAULT,priceAt,payments});
 function rate(req,key,max){const now=Date.now(),id=crypto.createHash('sha256').update(String(req.socket.remoteAddress||'unknown')+key).digest('hex');if(limits.size>10000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);let v=limits.get(id);if(!v||v.until<now){v={n:0,until:now+60000};limits.set(id,v);}return ++v.n<=max;}
 async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>12000)throw Error('La solicitud es demasiado grande.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
 async function query(q){const r=await q;if(r.error)throw Error(r.error.message);return r.data;}
 async function config(){return (await query(db.from('book_events').select('config,revision').eq('id',SLUG).single()));}
 function canRegister(c){return c.registrationOpen&&c.status==='published'&&c.date&&c.location&&c.capacity&&Date.parse(c.date)>Date.now()&&(!c.deadline||Date.parse(c.deadline)>Date.now());}
 function publicConfig(c){const {adminEmail,...safe}=c;const live=c.paymentMode==='production',configured=payments.ready(live?'PRODUCTION':'TEST');return {...safe,paymentProvider:configured?(live?'izipay_live':'izipay_test'):'simulation',launchPrice:c.price,price:priceAt(c),registrationOpen:!!canRegister(c),capacityNotice:CAPACITY,paymentMode:configured?c.paymentMode:'disabled'};}
 function paymentToken(orderId){const expires=Date.now()+30*60000;const raw=orderId+':'+expires;return raw+'.'+sign('book-payment:'+raw);}
 function validPaymentToken(value){const [raw,mac]=String(value||'').split('.');if(!raw||!mac)return null;const expected=sign('book-payment:'+raw);if(mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null;const [id,expires]=raw.split(':');return Number(expires)>Date.now()&&/^[0-9a-f-]{36}$/.test(id)?id:null;}
 async function context(id){const reg=await query(db.from('book_registrations').select('*,book_participants(*),book_orders(*)').eq('id',id).single());return reg;}
 async function flushMail(registrationId){
  const c=(await config()).config;const host=process.env.SMTP_HOST,user=process.env.SMTP_USER,pass=process.env.SMTP_PASSWORD||process.env.SMTP_PASS;
  if(!host||!user||!pass)return {sent:0,pending:true};
  let q=db.from('book_mail_outbox').select('*').eq('status','pending').order('updated_at').limit(20);if(registrationId)q=q.eq('registration_id',registrationId);
  const jobs=await query(q);let sent=0,recipientSent=false,failed=0;
  const transport=nodemailer.createTransport({host,port:Number(process.env.SMTP_PORT||465),secure:process.env.SMTP_SECURE?process.env.SMTP_SECURE==='true':Number(process.env.SMTP_PORT||465)===465,auth:{user,pass},connectionTimeout:10000,socketTimeout:15000});
  for(const job of jobs){
   if(job.kind==='admin'&&!(c.adminEmail||process.env.MALBA_CONTACT_RECIPIENT||process.env.SMTP_USER))continue;
   const claimed=await query(db.from('book_mail_outbox').update({status:'sending',attempts:job.attempts+1,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','pending').select('id'));if(!claimed.length)continue;
   try{const reg=await context(job.registration_id),p=reg.book_participants,o=reg.book_orders?.[0];
    if(job.kind==='purchase'&&o?.status!=='paid')throw Error('No existe un pago real verificado.');
    const eventDate=c.date?new Date(c.date).toLocaleString('es-PE',{timeZone:'America/Lima',dateStyle:'long',timeStyle:'short'}):'Fecha por confirmar';
    const subject=job.kind==='admin'?'Nueva inscripción | Presentación del libro MALBA PMC':job.kind==='purchase'?'Compra verificada | MALBA PMC':'Recibimos tu inscripción | Presentación del libro MALBA PMC';
    const title=job.kind==='admin'?'Nueva inscripción recibida':job.kind==='purchase'?'Compra confirmada':'Recibimos tu inscripción';
    const description=reg.status==='waitlist'?'Tu solicitud está en lista de espera. No es una confirmación de ingreso.':'Tu inscripción ha sido registrada. Recuerda que no garantiza el ingreso.';
    const order=o?`<p>Pedido: ${escape(o.id)}<br>Libro físico · S/ ${Number(o.amount).toFixed(2)}<br>Entrega: ${escape(o.delivery)}<br>Estado: ${o.status==='paid'?'Pago verificado':o.status==='simulated_paid'?'Simulación completada, sin cobro real':'Pendiente de pago (prueba, sin cobro real)'}</p>`:'';
    const html=`<!doctype html><html lang="es"><body style="margin:0;background:#f4f2f7;font-family:Arial,sans-serif;color:#25364a"><div style="max-width:600px;margin:auto;padding:36px 24px;background:white;border-top:5px solid #5d4594"><p style="color:#5d4594;font-weight:bold">MALBA PMC</p><h1 style="font-size:26px">${title}</h1><p>Hola, ${escape(p.full_name)}.</p><p>${description}</p><h2 style="font-size:18px">${escape(c.title)}</h2><p>${escape(eventDate)} (hora de Perú)<br>${escape(c.location||'Sede por confirmar')}</p>${order}<p style="background:#f0edf6;padding:18px;font-size:12px">${CAPACITY}</p>${job.kind==='admin'?`<p>Participante: ${escape(p.full_name)}<br>Correo: ${escape(p.email)}<br>Celular: ${escape(p.phone)}<br>Modalidad: ${reg.mode==='book'?'Evento + libro':'Solo evento'}</p>`:''}${c.adminEmail?`<p>Consultas: <a href="mailto:${escape(c.adminEmail)}">${escape(c.adminEmail)}</a></p>`:''}<p>MALBA PMC</p></div></body></html>`;
    await transport.sendMail({from:require('../mail-sender').sender(process.env),to:job.kind==='admin'?(c.adminEmail||process.env.MALBA_CONTACT_RECIPIENT||process.env.SMTP_USER):p.email,subject,html,text:`${title}\nHola, ${p.full_name}.\n${description}\n${eventDate}\n${c.location}\n${CAPACITY}`,messageId:`<malba-event-${job.id}@malba-pmc.com>`});
    await query(db.from('book_mail_outbox').update({status:'sent',last_error:null,updated_at:new Date().toISOString()}).eq('id',job.id));sent++;if(job.kind==='registration')recipientSent=true;
   }catch(e){failed++;console.error('MALBA event SMTP failed:',String(e.code||e.message||'Error').slice(0,200));await query(db.from('book_mail_outbox').update({status:'failed',last_error:clean(e.message,250),updated_at:new Date().toISOString()}).eq('id',job.id));}
  }transport.close();return{sent,recipientSent,failed};
 }
 return async function eventApi(req,res,url){
  const route=url.pathname.replace(/\/$/,'');
  if((route.startsWith('/api/events/payments/')&&route!=='/api/events/payments/start')||route.startsWith('/api/events/admin/payments/'))return payments.handler(req,res,url);
  if(route.startsWith('/api/events/demo/')||route.startsWith('/api/events/admin/demo/'))return demo(req,res,url);
  const adminRoute=route.startsWith('/api/events/admin');
  let admin;if(adminRoute){admin=requireAdmin(req,res);if(!admin)return;if(!csrfOk(req,admin))return json(res,403,{error:'Recarga el panel para renovar la sesión.'});}
  if(!db){if(route==='/api/events/config'&&req.method==='GET')return json(res,200,{...publicConfig(DEFAULT),configured:false});return json(res,503,{error:'Las inscripciones estarán disponibles cuando termine la configuración.'});}
  try{
   if(route==='/api/events/config'&&req.method==='GET')return json(res,200,publicConfig((await config()).config));
   if(req.method==='POST'&&!adminRoute){const origin=req.headers.origin;if(!origin||origin!==new URL(process.env.STAGING_ORIGIN||'https://olivedrab-mouse-758184.hostingersite.com').origin&&!(process.env.NODE_ENV!=='production'&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)))return json(res,403,{error:'Origen de solicitud inválido.'});if(!String(req.headers['content-type']).startsWith('application/json'))return json(res,415,{error:'Formato no permitido.'});if(!rate(req,route,route.endsWith('metrics')?600:120))return json(res,429,{error:'Demasiados intentos. Espera un minuto antes de reintentar.'});}
   if(route==='/api/events/payments/start'&&req.method==='POST'){
    const b=await body(req),id=validPaymentToken(b.token);if(!id)return json(res,403,{error:'La sesión de pago venció.'});
    const c=(await config()).config;const gatewayMode=c.paymentMode==='production'?'PRODUCTION':'TEST';if(!['sandbox','production'].includes(c.paymentMode)||!payments.ready(gatewayMode))return json(res,503,{error:'La pasarela no está disponible para esta modalidad de pago.'});
    const o=await query(db.from('book_orders').select('*,book_registrations(book_participants(*))').eq('id',id).single());
    if(!o||!['pending','failed'].includes(o.status))throw Error('El pedido no admite otro pago.');
    const p=o.book_registrations.book_participants;
    const session=await payments.createSession({orderId:o.id,amount:o.amount,email:p.email,name:p.full_name,billing:b.billing,mode:gatewayMode});return json(res,201,session);
   }
   if(route==='/api/events/register'&&req.method==='POST'){
    const p=validateRegistration(await body(req));if(!rate(req,'email:'+p.email,5))return json(res,429,{error:'Espera un minuto antes de volver a enviar tu solicitud.'});const r=await query(db.rpc('book_register',{payload:p}));
    if(r.duplicate)return json(res,200,{duplicate:true,message:'Si este correo ya está inscrito, conservamos su solicitud original. Revisa tu correo o contacta a la organización para modificarla.'});
    let mail={sent:0};try{mail=await flushMail(r.id);}catch(e){console.error('Event email remains queued:',e.message);}return json(res,201,{status:r.status,orderId:r.orderId||null,amount:r.amount??null,paymentToken:r.orderId?paymentToken(r.orderId):null,emailQueued:mail.recipientSent!==true&&mail.failed!==true,emailSent:mail.recipientSent===true,emailFailed:mail.failed>0,capacityNotice:CAPACITY});
   }
   if(route==='/api/events/simulate'&&req.method==='POST'){
    const b=await body(req),id=validPaymentToken(b.token);if(!id)return json(res,403,{error:'La sesión de prueba venció. Contacta a la organización para reintentar.'});
    const c=(await config()).config;if(c.paymentMode!=='sandbox')throw Error('La simulación está deshabilitada.');
    const status=b.outcome==='success'?'simulated_paid':b.outcome==='failed'?'failed':b.outcome==='pending'?'pending':null;if(!status)throw Error('Resultado de prueba inválido.');
    await query(db.from('book_metrics').insert({event_name:'payment_attempt',source:''}));
    const rows=await query(db.from('book_orders').update({status}).eq('id',id).in('status',['pending','failed']).select('id,status'));if(rows.length&&status==='simulated_paid')await query(db.from('book_metrics').insert({event_name:'payment_simulated_confirmed',source:''}));return json(res,200,{status:rows[0]?.status||'simulated_paid',simulated:true,message:status==='simulated_paid'?'Simulación completada. No se realizó ningún cobro.':status==='failed'?'El pago de prueba falló. Tu inscripción se conserva y puedes reintentar.':'Pago de prueba pendiente. Tu inscripción se conserva.'});
   }
   if(route==='/api/events/metrics'&&req.method==='POST'){const b=await body(req);if(!['visit','click_free','click_book'].includes(b.event))throw Error('Evento inválido.');await query(db.from('book_metrics').insert({event_name:b.event,source:clean(b.source,100)}));return json(res,200,{ok:true});}
   if(route==='/api/events/admin/config'&&req.method==='GET')return json(res,200,await config());
   if(route==='/api/events/admin/config'&&req.method==='POST'){const b=await body(req),c=validateConfig(b.config);const rows=await query(db.from('book_events').update({config:c,revision:Number(b.revision)+1,updated_at:new Date().toISOString()}).eq('id',SLUG).eq('revision',Number(b.revision)).select('revision'));if(!rows.length)return json(res,409,{error:'Otra sesión actualizó el evento. Recarga antes de guardar.'});return json(res,200,{config:c,revision:rows[0].revision});}
   if(route==='/api/events/admin/registrations'&&req.method==='GET'){
    const page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0)),q=clean(url.searchParams.get('q'),150);let filter=db.from('book_registrations').select('*,book_participants!inner(*),book_orders(*)',{count:'exact'}).eq('event_id',SLUG).order('created_at',{ascending:false});
    const mode=url.searchParams.get('mode'),state=url.searchParams.get('status'),payment=url.searchParams.get('payment');
    if(['free','book'].includes(mode))filter=filter.eq('mode',mode);if(['registered','waitlist','cancelled'].includes(state))filter=filter.eq('status',state);
    if(q){const safe=q.replace(/[^\p{L}\p{N}@. _-]/gu,'');filter=filter.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`,{referencedTable:'book_participants'});}
    if(['pending','failed','simulated_paid','paid'].includes(payment)){filter=db.from('book_registrations').select('*,book_participants!inner(*),book_orders!inner(*)',{count:'exact'}).eq('event_id',SLUG).eq('book_orders.status',payment).order('created_at',{ascending:false});if(mode)filter=filter.eq('mode',mode);if(state)filter=filter.eq('status',state);if(q){const safe=q.replace(/[^\p{L}\p{N}@. _-]/gu,'');filter=filter.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`,{referencedTable:'book_participants'});}}
    const r=await filter.range(page*50,page*50+49);if(r.error)throw Error(r.error.message);return json(res,200,{rows:r.data,total:r.count,page});
   }
   if(route==='/api/events/admin/stats'&&req.method==='GET'){
    const specs=[['total','book_registrations',{}],['free','book_registrations',{mode:'free'}],['book','book_registrations',{mode:'book'}],['registered','book_registrations',{status:'registered'}],['waitlist','book_registrations',{status:'waitlist'}],['paid','book_orders',{status:'paid'}],['pending','book_orders',{status:'pending'}],['failed','book_orders',{status:'failed'}],['simulated','book_orders',{status:'simulated_paid'}],['mailFailed','book_mail_outbox',{status:'failed'}],['mailPending','book_mail_outbox',{status:'pending'}],['mailSending','book_mail_outbox',{status:'sending'}]];
    const stats={};await Promise.all(specs.map(async([key,table,match])=>{const r=await db.from(table).select('id',{count:'exact',head:true}).match(match);if(r.error)throw Error(r.error.message);stats[key]=r.count;}));const entered=await db.from('book_registrations').select('id',{head:true,count:'exact'}).not('entered_at','is',null);if(entered.error)throw Error(entered.error.message);stats.entered=entered.count;
    const c=(await config()).config;stats.available=c.capacity===null?null:Math.max(0,c.capacity-stats.registered);
    for(const name of ['visit','click_free','click_book','payment_attempt','payment_simulated_confirmed']){const r=await db.from('book_metrics').select('id',{head:true,count:'exact'}).eq('event_name',name);if(r.error)throw Error(r.error.message);stats[name]=r.count;}
    stats.conversion=stats.visit?Math.round(stats.total/stats.visit*1000)/10:0;return json(res,200,stats);
   }
   if(route==='/api/events/admin/admission'&&req.method==='POST'){const b=await body(req);await query(db.rpc('book_admission',{reg_id:b.id,next_status:b.status,enter:b.enter===true}));return json(res,200,{ok:true});}
   if(route==='/api/events/admin/mail'&&req.method==='POST'){const b=await body(req);if(b.retry===true)await query(db.from('book_mail_outbox').update({status:'pending',updated_at:new Date().toISOString()}).eq('status','failed'));return json(res,200,await flushMail());}
   if(route==='/api/events/admin/export'&&req.method==='GET'){
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Inscripciones');sheet.columns=['Fecha','Nombre','Correo','Celular','Empresa','Cargo','Modalidad','Inscripción','Pago','Importe PEN','Entrega','Ingreso','UTM origen','UTM campaña'].map(header=>({header,width:25}));let start=0;
    while(true){const rows=await query(db.from('book_registrations').select('*,book_participants(*),book_orders(*)').eq('event_id',SLUG).order('created_at').order('id').range(start,start+999));for(const r of rows){const p=r.book_participants,o=r.book_orders?.[0];sheet.addRow([r.created_at,p.full_name,p.email,p.phone,p.company,p.position,r.mode,r.status,o?.status||'',o?Number(o.amount):'',o?.delivery||'',r.entered_at||'',r.utm?.utm_source||'',r.utm?.utm_campaign||'']);}if(rows.length<1000)break;start+=1000;}
    sheet.getRow(1).font={bold:true,color:{argb:'FF5D4594'}};sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:'N1'};return text(res,200,Buffer.from(await workbook.xlsx.writeBuffer()),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{'Content-Disposition':'attachment; filename="MALBA-inscripciones-evento.xlsx"'});
   }
   return json(res,404,{error:'Ruta de evento no encontrada.'});
  }catch(e){console.error('Event API:',e.message);return json(res,400,{error:adminRoute?e.message: /inscripci|aforo|plazo|modalidad|compra|libro|nombre|correo|celular|política|solicitud|evento|simulaci|Resultado/i.test(e.message)?e.message:'No pudimos procesar la solicitud. Intenta nuevamente en unos minutos.'});}
 };
};
module.exports.validateRegistration=validateRegistration;module.exports.validateConfig=validateConfig;module.exports.CAPACITY=CAPACITY;

module.exports.priceAt=priceAt;
