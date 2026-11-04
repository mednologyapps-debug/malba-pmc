'use strict';
const crypto=require('node:crypto'),izipay=require('./izipay'),c2u=require('./close2u');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=function createPayments({db,json,text,requireAdmin,csrfOk,sign,env=process.env,fetcher=fetch}){
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
 function ready(mode='TEST'){return !!db&&izipay.ready(env,mode);}
 function origin(){const url=new URL(env.STAGING_ORIGIN||'https://olivedrab-mouse-758184.hostingersite.com');if(url.protocol!=='https:')throw Error('La pasarela requiere HTTPS.');return url.origin;}
 async function sessionByToken(token){
  const [id,expires,mac]=String(token||'').split('.');
  if(!/^[a-f0-9-]{36}$/i.test(id||'')||!/^\d+$/.test(expires||''))throw Error('Sesión de pago inválida.');
  const expected=sign('izipay-session:'+id+':'+expires);
  if(!mac||mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected))||Number(expires)<Date.now())throw Error('La sesión de pago venció.');
  const s=await query(db.from('book_payment_sessions').select('*').eq('id',id).single());
  if(!s||s.client_hash!==hash(token))throw Error('Sesión de pago inválida.');return s;
 }
 async function createSession({orderId=null,amount,email,name,billing={},mode='TEST'}){
  if(!db)throw Error('La pasarela requiere la conexión del servidor.');
  const creds=izipay.credentials(env,mode),amountMinor=Math.round(Number(amount)*100);if(!Number.isInteger(amountMinor)||amountMinor<=0)throw Error('Importe inválido.');
  if(orderId){const previous=await query(db.from('book_payment_sessions').select('*').eq('order_id',orderId).maybeSingle());if(previous){
   if(previous.mode!==mode)throw Error('Este pedido tiene una sesión de otra modalidad de pago. Contacta a MALBA para reiniciarlo de forma segura.');
   if(previous.expires_at&&Date.parse(previous.expires_at)<Date.now())throw Error('La sesión de pago anterior venció. Contacta a la organización.');
   const expires=Date.parse(previous.expires_at),token=previous.id+'.'+expires+'.'+sign('izipay-session:'+previous.id+':'+expires);
   return {token,sessionId:previous.id,checkoutUrl:'/evento/presentacion-libro/pago.html#'+token};
  }}
  const id=crypto.randomUUID(),expires=Date.now()+30*60000,token=id+'.'+expires+'.'+sign('izipay-session:'+id+':'+expires);
  const s={id,order_id:orderId,provider_order_id:'MALBA-'+id,shop_id:creds.shopId,mode,amount_minor:amountMinor,currency:'PEN',client_hash:hash(token),email,customer_name:name,billing:c2u.billing(billing),expires_at:new Date(expires).toISOString()};
  await query(db.from('book_payment_sessions').insert(s));
  return {token,sessionId:id,checkoutUrl:'/evento/presentacion-libro/pago.html#'+token};
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
  // Browser return is authenticated for display only. Only server IPN settles an order.
  if(check.paid&&!browser)await query(db.rpc('book_finish_izipay',{session_id:s.id,tx_id:check.transactionId,paid_amount:s.amount_minor,paid_currency:s.currency,paid_mode:s.mode,paid_shop:s.shop_id,paid_reference:s.provider_order_id}));
  return {verified:true,waitingForNotification:browser&&check.paid};
 }
 async function status(token){const s=await sessionByToken(token);return {status:s.status,mode:s.mode,amount:s.amount_minor/100,currency:s.currency};}
 async function handler(req,res,url){
  const path=url.pathname.replace(/\/$/,'');
  try{
   if(!db)return json(res,503,{error:'La pasarela todavía no está disponible.'});
   if(path==='/api/events/payments/ipn'&&req.method==='POST'){
    await notify(await readBody(req));return text(res,200,'OK','text/plain; charset=utf-8');
   }
   const isAdmin=path.startsWith('/api/events/admin/');
   if(isAdmin){const admin=requireAdmin(req,res);if(!admin)return;if(!csrfOk(req,admin))return json(res,403,{error:'Sesión administrativa vencida.'});}
   if(req.method==='POST'&&req.headers.origin!==origin())return json(res,403,{error:'Origen no permitido.'});
   const bearer=String(req.headers.authorization||'').replace(/^Bearer /,'');
   if(path==='/api/events/payments/checkout'&&req.method==='GET'){
    const s=await sessionByToken(bearer);if(s.status==='paid')return json(res,200,{paid:true,mode:s.mode});
    const form=await izipay.createPayment(s,{email:s.email,name:s.customer_name},origin(),{env,fetcher});return json(res,200,{...form,amount:s.amount_minor/100,currency:s.currency});
   }
   if(path==='/api/events/payments/status'&&req.method==='GET')return json(res,200,await status(bearer));
   if(path==='/api/events/payments/return'&&req.method==='POST')return json(res,200,await notify(await readBody(req),true));
   if(path==='/api/events/payments/preview'&&req.method==='POST')return json(res,200,await preview(await sessionByToken(bearer)));
   if(path==='/api/events/admin/payments/health'&&req.method==='GET')return json(res,200,{izipayTest:ready(),izipayProduction:ready('PRODUCTION'),close2uConfigured:!!(env.C2U_RUC&&env.C2U_USER&&env.C2U_PASSWORD),realInvoices:env.C2U_LIVE_ENABLED==='true'});
   if(path==='/api/events/admin/payments/close2u-check'&&req.method==='POST'){await fiscal.token();return json(res,200,{connected:true});}
   if(path==='/api/events/admin/payments/invoice-preview'&&req.method==='POST'){
    const b=await readBody(req);return json(res,200,await preview(await sessionByToken(b.token)));
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
   await query(db.from('book_invoice_jobs').update({status:'issued',receipt,updated_at:new Date().toISOString()}).eq('id',job.id));
  }catch{await query(db.from('book_invoice_jobs').update({status:'review',last_error:'Revisar en CLOSE2U antes de reintentar; la solicitud pudo haber sido recibida.',updated_at:new Date().toISOString()}).eq('id',job.id));throw Error('El comprobante requiere revisión. No se reintentará automáticamente.');}
 }
 let dispatching=false;
 async function dispatch(){
  if(dispatching||!db||env.C2U_LIVE_ENABLED!=='true')return;dispatching=true;
  try{const candidates=await query(db.from('book_invoice_jobs').select('id').eq('status','pending').order('updated_at').limit(1));if(!candidates.length)return;
   const jobs=await query(db.from('book_invoice_jobs').update({status:'processing',updated_at:new Date().toISOString()}).eq('id',candidates[0].id).eq('status','pending').select('*'));
   if(jobs.length)await issueClaimed(jobs[0]);
  }catch{console.error('Event invoice job requires review.');}finally{dispatching=false;}
 }
 if(env.C2U_LIVE_ENABLED==='true'&&db){const timer=setInterval(dispatch,60000);timer.unref();}
 async function lookupStatuses(ids){return ids.length&&db?query(db.from('book_payment_sessions').select('id,status').in('id',ids)):[];}
 return {ready,createSession,status,handler,lookupStatuses};
};
