'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const create=require('../consultation-system/api');
const env={NODE_ENV:'production',MALBA_PUBLIC_ORIGIN:'https://malba-pmc.com',SMTP_HOST:'smtp.example.invalid',SMTP_USER:'team@example.invalid',SMTP_PASSWORD:'fixture'};
const slot={id:'11111111-1111-4111-8111-111111111111',starts_at:'2026-12-10T15:00:00Z',ends_at:'2026-12-10T16:00:00Z'};
const identity={requestId:'22222222-2222-4222-8222-222222222222',slotId:slot.id,name:'Cliente de prueba',email:'client@example.invalid',company:'Empresa QA',service:'Gestión de proyectos',message:'Necesito apoyo para planificar mi proyecto.',consent:true};
const sign=value=>crypto.createHmac('sha256','only-tests').update(value).digest('hex');
function fixture(responder,{admin=false,csrf=true,mailer,settings=env}={}){
 const calls=[];
 const db={from(table){const item={table,operation:'select',filters:[]};const chain=new Proxy({}, {get(_,key){if(key==='then')return(resolve,reject)=>Promise.resolve(responder(item)).then(resolve,reject);return(...args)=>{if(['select','update','insert'].includes(key)){item.operation=key==='select'?item.operation:key;if(key==='update'||key==='insert')item.payload=args[0];}else item.filters.push([key,...args]);calls.push(item);return chain;};}});return chain;},rpc(name,payload){const item={rpc:name,payload};calls.push(item);return Promise.resolve(responder(item));}};
 const api=create({db,json:(res,status,value)=>Object.assign(res,{status,value}),requireAdmin:(req,res)=>{if(admin)return {};res.status=401;return null;},csrfOk:()=>csrf,sign,nodemailer:mailer||{createTransport:()=>{throw Error('Unexpected SMTP');}},getDocument:async()=>({published:{consulting:{services:[{name:identity.service}]}}}),env:settings});
 return {calls,async request(route,{body,token,origin=env.MALBA_PUBLIC_ORIGIN}={}){const req={method:body?'POST':'GET',headers:{origin,'content-type':'application/json',authorization:token?'Bearer '+token:''},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}},res={};await api(req,res,new URL(route,env.MALBA_PUBLIC_ORIGIN));return res;}};
}
test('public availability excludes reservations and never discloses client or consultant data',async()=>{
 const used={...slot,id:'33333333-3333-4333-8333-333333333333'};
 const api=fixture(item=>({data:item.table==='consultation_settings'?{enabled:true,consultant_email:'consultant@example.invalid'}:item.table==='consultation_slots'?[slot,{...used,consultation_bookings:[{status:'pending'}]}]:[]}));
 const result=await api.request('/api/consultations/availability?month=2026-12');
 assert.equal(result.status,200);assert.deepEqual(result.value.slots,[slot]);assert.equal(result.value.consultant_email,undefined);
});
test('disabled agenda returns an empty calendar without querying bookings',async()=>{
 const api=fixture(item=>{assert.equal(item.table,'consultation_settings');return {data:{enabled:false,consultant_email:''}};});
 const result=await api.request('/api/consultations/availability?month=2026-12');assert.equal(result.value.enabled,false);assert.deepEqual(result.value.slots,[]);
});
test('unauthenticated admins, invalid CSRF, forged origins and absent confirmation tokens fail before reading bookings',async()=>{
 const reject=()=>{throw Error('Database should not be queried');};
 assert.equal((await fixture(reject).request('/api/consultations/admin/slots?month=2026-12')).status,401);
 assert.equal((await fixture(reject,{admin:true,csrf:false}).request('/api/consultations/admin/decision',{body:{id:slot.id,status:'confirmed'}})).status,403);
 assert.equal((await fixture(reject).request('/api/consultations/request',{body:identity,origin:'https://other.example.invalid'})).status,403);
 assert.equal((await fixture(reject).request('/api/consultations/confirmation')).status,400);
});
test('booking validates the service and consent before calling the atomic reservation function',async()=>{
 const api=fixture(item=>{assert.equal(item.rpc,'consultation_reserve');assert.equal(item.payload.p_slot,slot.id);assert.equal(item.payload.p_email,identity.email);assert.match(item.payload.p_token_hash,/^[a-f0-9]{64}$/);return {data:{status:'pending',duplicate:false}};},{settings:{...env,SMTP_HOST:''}});
 assert.equal((await api.request('/api/consultations/request',{body:identity})).status,503);
 const ready=fixture(item=>{if(item.rpc)return {data:{status:'pending',duplicate:true}};return {data:[]};});
 assert.equal((await ready.request('/api/consultations/request',{body:{...identity,consent:false}})).status,400);
 assert.equal((await ready.request('/api/consultations/request',{body:{...identity,service:'Unrelated'}})).status,400);
 const result=await ready.request('/api/consultations/request',{body:identity});assert.equal(result.status,201);assert.equal(result.value.status,'pending');
 const reservation=ready.calls.find(c=>c.rpc==='consultation_reserve');assert.match(reservation.payload.p_token_hash,/^[a-f0-9]{64}$/);assert.equal(result.value.token,undefined);
});
test('opening the confirmation link is read-only; only a deliberate POST confirms',async()=>{
 const token=identity.requestId+'.'+sign('consultation-confirm:'+identity.requestId);
 const api=fixture(item=>item.rpc?{data:{status:'confirmed',duplicate:false}}:{data:{...identity,status:'pending',consultation_slots:slot}});
 const result=await api.request('/api/consultations/confirmation',{token});assert.equal(result.status,200);assert.equal(api.calls.some(c=>c.rpc),false);
 const confirmed=await api.request('/api/consultations/confirmation',{token,body:{status:'confirmed'}});assert.equal(confirmed.value.status,'confirmed');
 const update=api.calls.find(c=>c.rpc==='consultation_decide');assert.equal(update.payload.p_id,null);assert.equal(update.payload.p_token_hash,crypto.createHash('sha256').update(token).digest('hex'));
});
test('SMTP sends pending notice and a private confirmation link; errors do not discard the saved reservation',async()=>{
 const messages=[],booking={...identity,id:'44444444-4444-4444-8444-444444444444',request_id:identity.requestId,consultant_email:'consultant@example.invalid',status:'pending',consultation_slots:slot};
 const jobs=[{id:'job1',booking_id:booking.id,kind:'requested_client',status:'pending',attempts:0},{id:'job2',booking_id:booking.id,kind:'requested_consultant',status:'pending',attempts:0}];
 const api=fixture(item=>{
  if(item.rpc)return {data:{status:'pending'}};
  if(item.table==='consultation_settings')return {data:{enabled:true,consultant_email:'consultant@example.invalid'}};
  if(item.table==='consultation_mail_outbox'&&item.operation==='select')return {data:jobs};
  if(item.table==='consultation_mail_outbox')return {data:[{id:'claim'}]};
  if(item.table==='consultation_bookings')return {data:booking};
  throw Error('Unexpected table');
 },{mailer:{createTransport:()=>({sendMail:async message=>{messages.push(message);return {accepted:[message.to]};},close(){}})}});
 assert.equal((await api.request('/api/consultations/request',{body:identity})).value.status,'pending');
 for(let i=0;i<30&&messages.length<2;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(messages.length,2);assert.equal(messages[0].to,identity.email);assert.match(messages[0].text,/Espera el correo de confirmación/);
 assert.equal(messages[1].to,booking.consultant_email);assert.match(messages[1].html,/Revisar y confirmar consultoría/);assert.match(messages[1].text,/https:\/\/malba-pmc.com\/consultoria\/confirmar\/#/);
 assert.doesNotMatch(messages[0].html,/consultoria\/confirmar/);
});
