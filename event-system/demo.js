'use strict';
const crypto=require('node:crypto');
// Isolated synthetic fixtures. No database, SMTP, payment or invoice calls.
module.exports=function createDemo({json,requireAdmin,csrfOk,sign,defaults,priceAt,payments}){
 const fixtures=new Map(),registrations=new Map();
 const ttl=2*60*60*1000;
 function sweep(){const before=Date.now()-ttl;for(const [id,f]of fixtures)if(f.created<before){fixtures.delete(id);registrations.delete(id);}}
 const profile=id=>({name:'Participante de prueba',email:'prueba-'+id.slice(0,8)+'@example.invalid',phone:'999000000'});
 async function body(req){let size=0,s='';for await(const chunk of req){size+=chunk.length;if(size>1024)throw Error('Solicitud de prueba demasiado grande.');s+=chunk;}return JSON.parse(s||'{}');}
 return async(req,res,url)=>{
  const host=String(req.headers.host||url.host).split(':')[0];
  if(!['olivedrab-mouse-758184.hostingersite.com','terminal.local','localhost','127.0.0.1'].includes(host))return json(res,404,{error:'Pruebas no disponibles en este dominio.'});
  const route=url.pathname.replace(/\/$/,'');sweep();
  if(route.startsWith('/api/events/admin/')){const admin=requireAdmin(req,res);if(!admin)return;if(!csrfOk(req,admin))return json(res,403,{error:'Recarga el panel para renovar la sesión.'});}
  if(req.method==='POST'){
   let origin;try{origin=new URL(req.headers.origin);}catch{return json(res,403,{error:'Origen de prueba inválido.'});}
   if(origin.host!==(req.headers.host||url.host))return json(res,403,{error:'Origen de prueba inválido.'});
   if(!String(req.headers['content-type']).startsWith('application/json'))return json(res,415,{error:'Formato no permitido.'});
  }
  try{
   if(route==='/api/events/demo/config'&&req.method==='GET'){
    if(fixtures.size>=100)return json(res,429,{error:'Se alcanzó el límite de pruebas temporales. Intenta más tarde.'});
    const fixtureId=crypto.randomUUID();fixtures.set(fixtureId,{created:Date.now()});
    const {adminEmail,...safe}=defaults;
    return json(res,200,{...safe,price:priceAt(defaults),launchPrice:defaults.price,testMode:true,paymentProvider:payments?.ready()?'izipay_test':'simulation',registrationOpen:true,bookAvailable:true,paymentMode:'sandbox',profile:profile(fixtureId),fixtureId});
   }
   if(route==='/api/events/demo/register'&&req.method==='POST'){
    const b=await body(req),f=fixtures.get(b.fixtureId);
    if(!f)return json(res,400,{error:'Recarga la página para iniciar otra prueba.'});
    if(!['free','book'].includes(b.mode)||b.consent!==true||b.capacity!==true)return json(res,400,{error:'Selecciona la modalidad y acepta los avisos de prueba.'});
    if(registrations.has(b.fixtureId))return json(res,200,{duplicate:true,message:'Este registro de prueba ya existe. Recarga la página para probar otra inscripción.'});
    const p=profile(b.fixtureId),id=crypto.randomUUID(),orderId=b.mode==='book'?crypto.randomUUID():null;
    registrations.set(b.fixtureId,{id,created_at:new Date().toISOString(),mode:b.mode,status:'registered',is_test:true,book_participants:{full_name:p.name,email:p.email,phone:p.phone,company:'Prueba',position:''},book_orders:orderId?[{id:orderId,status:'pending',amount:priceAt(defaults),delivery:'Recojo en el lugar del evento'}]:[]});
    return json(res,201,{status:'registered',orderId,amount:orderId?priceAt(defaults):null,paymentToken:orderId?orderId+'.'+sign('event-demo:'+orderId):null,testMode:true,emailQueued:false,emailSent:false});
   }
   if(route==='/api/events/demo/payments/start'&&req.method==='POST'){
    const b=await body(req),[id,mac]=String(b.token||'').split('.'),expected=sign('event-demo:'+id);
    if(!mac||mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return json(res,403,{error:'Sesión de prueba inválida.'});
    const reg=[...registrations.values()].find(r=>r.book_orders[0]?.id===id),order=reg?.book_orders[0];
    if(!order||!payments?.ready())return json(res,409,{error:'El pago Izipay TEST todavía no está disponible.'});
    if(!order.checkout)order.checkout=await payments.createSession({amount:order.amount,email:'sandbox@example.com',name:'Participante de prueba',billing:{type:'boleta'},mode:'TEST'});
    return json(res,201,order.checkout);
   }
   if(route==='/api/events/demo/simulate'&&req.method==='POST'){
    const b=await body(req),[id,mac]=String(b.token||'').split('.'),expected=sign('event-demo:'+id);
    if(!mac||mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return json(res,403,{error:'Sesión de prueba inválida.'});
    const order=[...registrations.values()].flatMap(r=>r.book_orders).find(o=>o.id===id);
    if(!order)return json(res,400,{error:'La prueba venció. Recarga la página.'});
    const status={success:'simulated_paid',failed:'failed',pending:'pending'}[b.outcome];
    if(!status)return json(res,400,{error:'Resultado de prueba inválido.'});
    if(order.checkout)return json(res,409,{error:'Este pedido debe verificarse mediante Izipay TEST.'});
    if(order.status!=='simulated_paid')order.status=status;
    return json(res,200,{status:order.status,simulated:true,message:'Prueba guardada. No se realizó ningún cobro ni se emitió un comprobante.'});
   }
   if(route==='/api/events/admin/demo/registrations'&&req.method==='GET'){
    const q=String(url.searchParams.get('q')||'').toLowerCase(),page=Math.max(0,Number(url.searchParams.get('page'))||0);
    const sessions=await payments?.lookupStatuses([...registrations.values()].flatMap(r=>r.book_orders.map(o=>o.checkout?.sessionId).filter(Boolean)))||[];
    for(const reg of registrations.values())for(const o of reg.book_orders){const s=sessions.find(s=>s.id===o.checkout?.sessionId);if(s?.status==='paid')o.status='simulated_paid';}
    const rows=[...registrations.values()].reverse().filter(r=>!q||(r.book_participants.full_name+' '+r.book_participants.email).toLowerCase().includes(q));
    return json(res,200,{rows:rows.slice(page*50,page*50+50),total:rows.length,page,temporary:true});
   }
   return json(res,404,{error:'Ruta de prueba no encontrada.'});
  }catch{return json(res,400,{error:'No se pudo completar la prueba. Recarga la página.'});}
 };
};
