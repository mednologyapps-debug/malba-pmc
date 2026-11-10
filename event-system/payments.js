'use strict';
const crypto=require('node:crypto'),izipay=require('./izipay'),c2u=require('./close2u');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=function createPayments({db,json,text,requireAdmin,csrfOk,sign,nodemailer,onEventPaid,env=process.env,fetcher=fetch}){
 const fiscal=c2u.createClient({env,fetcher});
 const previews=new Map();
 async function preview(s){
  if(s.mode!=='TEST'||s.status!=='paid')throw Error('Completa primero un pago TEST verificado.');
  if(!previews.has(s.id)){
   if(previews.size>=100)previews.delete(previews.keys().next().value);
   const pending=fiscal.send(s,{preview:true}).catch(e=>{previews.delete(s.id);throw e;});previews.set(s.id,pending);
  }
  return {preview:true,pdf:await previews.get(s.id)};
 }
 async function query(q){const r=await q;if(r.error)throw Error('No se pudo guardar el estado del pago.');return r.data;}
 function ready(mode='TEST'){const gateway=!!db&&izipay.ready(env,mode);return mode!=='PRODUCTION'?gateway:gateway&&env.C2U_LIVE_ENABLED==='true'&&!!(env.C2U_RUC&&env.C2U_USER&&env.C2U_PASSWORD&&env.C2U_SERIE_FACTURA&&env.C2U_SERIE_BOLETA);}
 function origin(){return require('./public-origin').publicOrigin(env);}
 async function sessionByToken(token){
  const [id,expires,mac]=String(token||'').split('.');
  if(!/^[a-f0-9-]{36}$/i.test(id||'')||!/^\d+$/.test(expires||''))throw Error('Sesión de pago inválida.');
  const expected=sign('izipay-session:'+id+':'+expires);
  if(!mac||mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected))||Number(expires)<Date.now())throw Error('La sesión de pago venció.');
  const s=await query(db.from('book_payment_sessions').select('*').eq('id',id).single());
  if(!s||s.client_hash!==hash(token))throw Error('Sesión de pago inválida.');return s;
 }
 async function createSession({orderId=null,amount,email,name,billing={},retailPhone='',mode='TEST'}){
  if(!db)throw Error('La pasarela requiere la conexión del servidor.');
  const creds=izipay.credentials(env,mode),amountMinor=Math.round(Number(amount)*100);if(!Number.isInteger(amountMinor)||amountMinor<=0)throw Error('Importe inválido.');
  if(orderId){const previous=await query(db.from('book_payment_sessions').select('*').eq('order_id',orderId).maybeSingle());if(previous){
   if(previous.mode!==mode)throw Error('Este pedido tiene una sesión de otra modalidad de pago. Contacta a MALBA para reiniciarlo de forma segura.');
   if(previous.expires_at&&Date.parse(previous.expires_at)<Date.now())throw Error('La sesión de pago anterior venció. Contacta a la organización.');
   const expires=Date.parse(previous.expires_at),token=previous.id+'.'+expires+'.'+sign('izipay-session:'+previous.id+':'+expires);
   return {token,sessionId:previous.id,checkoutUrl:'/evento/presentacion-libro/pago.html?v=20261109-complete#'+token};
  }}
  const id=crypto.randomUUID(),expires=Date.now()+30*60000,token=id+'.'+expires+'.'+sign('izipay-session:'+id+':'+expires);
  const receipt=c2u.billing(billing);
  if(retailPhone)receipt.retailPhone=retailPhone;
  const s={id,order_id:orderId,provider_order_id:'MALBA-'+id,shop_id:creds.shopId,mode,amount_minor:amountMinor,currency:'PEN',client_hash:hash(token),email,customer_name:name,billing:receipt,expires_at:new Date(expires).toISOString()};
  await query(db.from('book_payment_sessions').insert(s));
  return {token,sessionId:id,checkoutUrl:'/evento/presentacion-libro/pago.html?v=20261109-complete#'+token};
 }
 async function readBody(req){let size=0,raw='';for await(const chunk of req){size+=chunk.length;if(size>128000)throw Error('Solicitud de pago demasiado grande.');raw+=chunk;}
  return String(req.headers['content-type']).includes('application/x-www-form-urlencoded')?Object.fromEntries(new URLSearchParams(raw)):JSON.parse(raw||'{}');
 }
 async function notify(fields,browser=false){
  let unsigned;try{unsigned=JSON.parse(String(fields['kr-answer']||''));}catch{throw Error('Notificación inválida.');}
  const reference=unsigned.orderDetails?.orderId;if(typeof reference!=='string'||reference.length>80)throw Error('Referencia de pago inválida.');
  const s=await query(db.from('book_payment_sessions').select('*').eq('provider_order_id',reference).single());
  if(!s)throw Error('Pedido de pago no encontrado.');
  const creds=izipay.credentials(env,s.mode),answer=izipay.verifyHash(fields,browser?creds.hmac:creds.password),check=izipay.verifyAnswer(answer,s);
  if(!check.paid)return {verified:true,waitingForNotification:false};
  if(!browser)await settle(s,check.transactionId);
  const paid=browser&&(s.status==='paid'||await reconcile(s,check.transactionId));
  return {verified:true,paid,waitingForNotification:browser&&!paid};
 }
 async function settle(s,transactionId){
  await query(db.rpc('book_finish_izipay',{session_id:s.id,tx_id:transactionId,paid_amount:s.amount_minor,paid_currency:s.currency,paid_mode:s.mode,paid_shop:s.shop_id,paid_reference:s.provider_order_id}));
  if(s.mode==='PRODUCTION'&&s.order_id&&onEventPaid){
   void onEventPaid(s.order_id).catch(()=>console.error('Event purchase email remains queued.'));
  }
  if(s.mode==='PRODUCTION'&&!s.order_id&&s.billing?.retailPhone){
   await query(db.from('book_invoice_jobs').upsert({session_id:s.id},{onConflict:'session_id',ignoreDuplicates:true}));
  }
 }
 const providerChecks=new Map();
 async function reconcile(s,transactionId,recovery=false){
  if(s.status==='paid')return true;
  const key=s.id+(recovery?':recovery':transactionId?':transaction':':order'),now=Date.now();
  for(const [id,check] of providerChecks)if(check.until<=now)providerChecks.delete(id);
  if(providerChecks.has(key))return providerChecks.get(key).result;
  if(providerChecks.size>=200)return false;
  const result=(async()=>{
   let outcome='not_confirmed';
   try{
    const verifiedId=await izipay.lookupPaid(s,transactionId,{env,fetcher,recovery});
    if(verifiedId){
     outcome='settlement_failed';
     await settle(s,verifiedId);
     outcome='confirmed';
     return true;
    }
   }catch(error){
    if(outcome!=='settlement_failed')outcome=error.lookupCode||'lookup_failed';
   }finally{
    if(recovery)try{
     await query(db.from('book_payment_sessions').update({recovery_result:outcome,recovery_checked_at:new Date().toISOString()}).eq('id',s.id));
    }catch{console.error('Could not record Izipay recovery result.');}
   }
   return false;
  })();
  providerChecks.set(key,{until:now+8000,result});
  return result;
 }
 async function status(token,confirm){
  const s=await sessionByToken(token);
  const paid=s.status==='paid'||confirm&&s.status==='pending'&&await reconcile(s);
  let eventStatus;
  if(paid&&s.order_id&&s.mode==='PRODUCTION'){
   const order=await query(db.from('book_orders').select('book_registrations(status)').eq('id',s.order_id).single());
   eventStatus=order?.book_registrations?.status;
  }
  return {status:paid?'paid':s.status,mode:s.mode,amount:s.amount_minor/100,currency:s.currency,retail:!!s.billing?.retailPhone,event:!!s.order_id,eventStatus};
 }
 async function handler(req,res,url){
  const path=url.pathname.replace(/\/$/,'');
  try{
   if(!db)return json(res,503,{error:'La pasarela todavía no está disponible.'});
   if(path==='/api/events/payments/ipn'&&req.method==='POST'){
    await notify(await readBody(req));return text(res,200,'OK','text/plain; charset=utf-8');
   }
   const isAdmin=path.startsWith('/api/events/admin/');
   if(isAdmin){const admin=requireAdmin(req,res);if(!admin)return;if(!csrfOk(req,admin))return json(res,403,{error:'Sesión administrativa vencida.'});}
   if(req.method==='POST'&&!require('./public-origin').allowedBrowserOrigin(req.headers.origin,env))return json(res,403,{error:'Origen no permitido.'});
   const bearer=String(req.headers.authorization||'').replace(/^Bearer /,'');
   if(path==='/api/events/payments/checkout'&&req.method==='GET'){
    const s=await sessionByToken(bearer);
    const resumed=s.status==='pending'&&Date.now()-Date.parse(s.created_at)>30000;
    if(s.status==='paid'||resumed&&await reconcile(s))return json(res,200,{paid:true,mode:s.mode,retail:!!s.billing?.retailPhone});
    const form=await izipay.createPayment(s,{email:s.email,name:s.customer_name},origin(),{env,fetcher});return json(res,200,{...form,amount:s.amount_minor/100,currency:s.currency,retail:!!s.billing?.retailPhone});
   }
   if(path==='/api/events/payments/status'&&req.method==='GET')return json(res,200,await status(bearer,url.searchParams.get('confirm')==='1'));
   if(path==='/api/events/payments/return'&&req.method==='POST')return json(res,200,await notify(await readBody(req),true));
   if(path==='/api/events/payments/preview'&&req.method==='POST')return json(res,200,await preview(await sessionByToken(bearer)));
   if(path==='/api/events/admin/payments/health'&&req.method==='GET')return json(res,200,{izipayTest:ready(),izipayProduction:ready('PRODUCTION'),close2uConfigured:!!(env.C2U_RUC&&env.C2U_USER&&env.C2U_PASSWORD),realInvoices:env.C2U_LIVE_ENABLED==='true'});
   if(path==='/api/events/admin/payments/close2u-check'&&req.method==='POST'){await fiscal.token();return json(res,200,{connected:true});}
   if(path==='/api/events/admin/payments/invoice-preview'&&req.method==='POST'){
    const b=await readBody(req);return json(res,200,await preview(await sessionByToken(b.token)));
   }
   if(path==='/api/events/admin/payments/send-issued-invoice'&&req.method==='POST'){
    const {orderId}=await readBody(req);
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(orderId||''))return json(res,400,{error:'Pedido inválido.'});
    return json(res,200,await sendIssuedInvoice(orderId));
   }
   if(path==='/api/events/admin/payments/issue'&&req.method==='POST'){
    if(env.C2U_LIVE_ENABLED!=='true')return json(res,409,{error:'La emisión fiscal real está deshabilitada.'});
    const b=await readBody(req),jobs=await query(db.from('book_invoice_jobs').update({status:'processing',updated_at:new Date().toISOString()}).eq('id',b.id).eq('status','pending').select('*'));
    if(!jobs.length)return json(res,409,{error:'El comprobante ya fue procesado o requiere revisión.'});
    await issueClaimed(jobs[0]);return json(res,200,{issued:true});
   }
   return json(res,404,{error:'Ruta de pago no encontrada.'});
  }catch(e){return json(res,400,{error:e.message});}
 }

 async function issueClaimed(job){
  try{
   const s=await query(db.from('book_payment_sessions').select('*').eq('id',job.session_id).single());
   const receipt=await fiscal.send(s);if(!receipt?.serie||!Number.isInteger(Number(receipt.numero))||Number(receipt.numero)<1)throw Error('Respuesta fiscal ambigua.');
   await query(db.from('book_invoice_jobs').update({status:'issued',receipt,delivery_copy_status:'pending',updated_at:new Date().toISOString()}).eq('id',job.id));
  }catch{await query(db.from('book_invoice_jobs').update({status:'review',last_error:'Revisar en CLOSE2U antes de reintentar; la solicitud pudo haber sido recibida.',updated_at:new Date().toISOString()}).eq('id',job.id));throw Error('El comprobante requiere revisión. No se reintentará automáticamente.');}
 }
 let dispatching=false;
 async function dispatch(){
  if(dispatching||!db||env.C2U_LIVE_ENABLED!=='true')return;dispatching=true;
  try{
   const candidates=await query(db.from('book_invoice_jobs').select('id').eq('status','pending').order('updated_at').limit(1));
   if(candidates.length){
    const jobs=await query(db.from('book_invoice_jobs').update({status:'processing',updated_at:new Date().toISOString()}).eq('id',candidates[0].id).eq('status','pending').select('*'));
    if(jobs.length)await issueClaimed(jobs[0]).catch(()=>console.error('Event invoice job requires review.'));
   }
   const now=Date.now();
   await query(db.from('book_invoice_jobs').update({delivery_copy_status:'review',delivery_copy_error:'El envío quedó interrumpido. Revisar el correo antes de reenviar.'}).eq('delivery_copy_status','sending').lt('updated_at',new Date(now-15*60000).toISOString()));
   const deliveries=await query(db.from('book_invoice_jobs').select('id,session_id,delivery_copy_attempts').eq('status','issued').eq('delivery_copy_status','pending').lt('updated_at',new Date(now-45000).toISOString()).order('updated_at').limit(5));
   for(const job of deliveries){
    const session=await query(db.from('book_payment_sessions').select('id,email,billing,status,mode').eq('id',job.session_id).single());
    await deliverPdf(session,job,'pending').catch(()=>console.error('Invoice PDF delivery needs attention.'));
   }
  }catch{console.error('Invoice worker unavailable.');}finally{dispatching=false;}
 }
 if(env.C2U_LIVE_ENABLED==='true'&&db){const timer=setInterval(dispatch,60000);timer.unref();}
 // Explicit admin action for an existing receipt.
 async function sendIssuedInvoice(orderId){
  const session=await query(db.from('book_payment_sessions').select('id,email,billing,status,mode').eq('order_id',orderId).eq('status','paid').eq('mode','PRODUCTION').maybeSingle());
  if(!session)throw Error('El pedido todavía no tiene un pago confirmado.');
  const job=await query(db.from('book_invoice_jobs').select('id,delivery_copy_attempts,delivery_copy_status').eq('session_id',session.id).eq('status','issued').maybeSingle());
  if(!job||![null,'pending'].includes(job.delivery_copy_status))throw Error('El comprobante aún no fue emitido, ya se envió o requiere revisión.');
  return deliverPdf(session,job,job.delivery_copy_status);
 }
 async function deliverPdf(session,job,expectedStatus){
  if(session?.status!=='paid'||session.mode!=='PRODUCTION')throw Error('El pedido todavía no tiene un pago confirmado.');
  const attempts=job.delivery_copy_attempts+1;
  const claim=db.from('book_invoice_jobs').update({delivery_copy_status:'sending',delivery_copy_error:null,delivery_copy_attempts:attempts,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status','issued');
  const jobs=await query((expectedStatus===null?claim.is('delivery_copy_status',null):claim.eq('delivery_copy_status',expectedStatus)).select('receipt'));
  if(!jobs.length)throw Error('Ya se está procesando el envío del comprobante.');
  const {receipt}=jobs[0];
  let transport,smtpAttempted=false;
  try{
   const {SMTP_HOST:host,SMTP_USER:user}=env,pass=env.SMTP_PASSWORD||env.SMTP_PASS;
   if(!nodemailer||!host||!user||!pass)throw Error('El correo de MALBA no está configurado.');
   const type=session.billing.type,label=type==='factura'?'Factura':'Boleta';
   const pdf=await fiscal.issuedPdf(receipt,type);
   const xml=await fiscal.issuedXml(receipt,type);
   const to=session.email,account=c2u.ACCOUNTING_EMAIL,cc=to.toLowerCase()===account?undefined:account;
   const number=receipt.serie+'-'+receipt.numero;
   const port=Number(env.SMTP_PORT||465);
   transport=nodemailer.createTransport({host,port,secure:env.SMTP_SECURE?env.SMTP_SECURE==='true':port===465,auth:{user,pass},connectionTimeout:10000,socketTimeout:20000});
   smtpAttempted=true;
   const result=await transport.sendMail({from:require('../mail-sender').sender(env),to,cc,subject:label+' electrónica '+number+' | MALBA PMC',text:'Adjuntamos en este correo el comprobante electrónico '+number+' de tu compra en MALBA PMC en formatos PDF y XML.',attachments:[{filename:label+'-'+number+'.pdf',content:pdf,contentType:'application/pdf'},{filename:label+'-'+number+'.xml',content:xml,contentType:'application/xml'}],messageId:'<malba-invoice-copy-'+job.id+'@malba-pmc.com>'});
   const accepted=(result.accepted||[]).map(address=>String(address).toLowerCase());
   if(![to,cc].filter(Boolean).every(address=>accepted.includes(address.toLowerCase())))throw Error('SMTP no aceptó todos los destinatarios.');
   await query(db.from('book_invoice_jobs').update({delivery_copy_status:'sent',delivery_copy_sent_at:new Date().toISOString()}).eq('id',job.id));
   return {sent:true};
  }catch(error){
   const reason=smtpAttempted?'SMTP requiere revisión.':String(error.message).slice(0,160);
   const retry=!smtpAttempted&&expectedStatus==='pending'&&attempts<5;
   const status=retry?'pending':!smtpAttempted&&expectedStatus===null?null:'review';
   await query(db.from('book_invoice_jobs').update({delivery_copy_status:status,delivery_copy_error:reason,updated_at:new Date().toISOString()}).eq('id',job.id));
   throw Error('No se pudo confirmar el envío del comprobante. '+reason);
  }finally{transport?.close();}
 }
 let reconciling=false;
 async function reconcileRecentPayments(){
  if(reconciling||!ready('PRODUCTION'))return;
  reconciling=true;
  try{
   const cutoff=new Date(Date.now()-45*60000).toISOString();
   const fields='id,order_id,provider_order_id,shop_id,mode,amount_minor,currency,status,billing,recovery_transaction';
   const pending=()=>db.from('book_payment_sessions').select(fields).eq('status','pending').eq('mode','PRODUCTION');
   const recoveries=await query(pending().not('recovery_transaction','is',null).order('recovery_checked_at',{ascending:true,nullsFirst:true}).limit(5));
   for(const session of recoveries)await reconcile(session,session.recovery_transaction.replace(/-/g,''),true);
   const sessions=await query(pending().is('recovery_transaction',null).gte('created_at',cutoff).order('created_at',{ascending:false}).limit(20));
   for(const session of sessions)await reconcile(session);
  }catch{console.error('Izipay automatic reconciliation unavailable.');}
  finally{reconciling=false;}
 }
 if(db){
  const first=setTimeout(reconcileRecentPayments,8000);
  const timer=setInterval(reconcileRecentPayments,60000);
  first.unref?.();timer.unref?.();
 }
 async function lookupStatuses(ids){return ids.length&&db?query(db.from('book_payment_sessions').select('id,status').in('id',ids)):[];}
 return {ready,createSession,status,handler,lookupStatuses};
};
