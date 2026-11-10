'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const izi=require('../event-system/izipay'),c2u=require('../event-system/close2u'),create=require('../event-system/payments');
const env={IZIPAY_SHOP_ID:'fixture-shop',IZIPAY_TEST_PASSWORD:'fixture-server-secret',IZIPAY_TEST_PUBLIC_KEY:'fixture-public',IZIPAY_TEST_HMAC:'fixture-browser-secret',STAGING_ORIGIN:'https://olivedrab-mouse-758184.hostingersite.com',C2U_RUC:'20123456789',C2U_USER:'fixture@example.invalid',C2U_PASSWORD:'fixture',C2U_ISSUER_EMAIL:'fixture@example.invalid',C2U_TRADE_NAME:'Fixture',C2U_LEGAL_NAME:'Fixture SAC',C2U_SERIE_FACTURA:'F001',C2U_SERIE_BOLETA:'B001'};
const session={id:'12345678-1234-1234-1234-123456789012',provider_order_id:'MALBA-fixture',shop_id:env.IZIPAY_SHOP_ID,mode:'TEST',amount_minor:12900,currency:'PEN',status:'paid',billing:{type:'boleta'},email:'sandbox@example.com',customer_name:'Participante de prueba'};
const answer={shopId:session.shop_id,orderStatus:'PAID',orderDetails:{mode:'TEST',orderId:session.provider_order_id,orderTotalAmount:12900,orderCurrency:'PEN'},transactions:[{uuid:'12345678-1234-1234-1234-123456789abc',status:'PAID',amount:12900,currency:'PEN'}]};
const fields=(a,key)=>{'use strict';const raw=JSON.stringify(a);return {'kr-answer':raw,'kr-hash':crypto.createHmac('sha256',key).update(raw).digest('hex')};};
function dbFor(s){const calls=[];return{calls,from(table){const q=new Proxy({}, {get(_,k){if(k==='then')return resolve=>resolve({data:s,error:null});return(...args)=>{calls.push([table,k,args]);return q;};}});return q;},rpc(name,args){calls.push([name,args]);return Promise.resolve({data:{paid:true}});}};}
async function call(api,path,{body,token,origin=env.STAGING_ORIGIN}={}){const req={method:body?'POST':'GET',headers:{origin,host:new URL(origin).host,'content-type':'application/json',authorization:token?'Bearer '+token:''},async *[Symbol.asyncIterator](){yield JSON.stringify(body);}},res={};await api(req,res,new URL(path,origin));return res;}
const out={json:(r,status,value)=>Object.assign(r,{status,value}),text:(r,status,value)=>Object.assign(r,{status,value})};
test('Izipay signatures distinguish browser HMAC from server IPN and reject tampering',()=>{
 const f=fields(answer,env.IZIPAY_TEST_PASSWORD);assert.deepEqual(izi.verifyHash(f,env.IZIPAY_TEST_PASSWORD),answer);
 assert.throws(()=>izi.verifyHash(f,env.IZIPAY_TEST_HMAC));assert.throws(()=>izi.verifyHash({...f,'kr-answer':f['kr-answer']+' '},env.IZIPAY_TEST_PASSWORD));
 assert.throws(()=>izi.verifyHash({...f,'kr-hash-algorithm':'md5'},env.IZIPAY_TEST_PASSWORD));
});
test('payment reconciliation rejects wrong shop, mode, amount, currency and reference',()=>{
 assert.equal(izi.verifyAnswer(answer,session).paid,true);assert.equal(izi.verifyAnswer({...answer,transactions:[{...answer.transactions[0],uuid:'12345678123412341234123456789abc'}]},session).paid,true);
 for(const x of [{shopId:'other'},{orderDetails:{...answer.orderDetails,mode:'PRODUCTION'}},{orderDetails:{...answer.orderDetails,orderTotalAmount:1}},{orderDetails:{...answer.orderDetails,orderCurrency:'USD'}},{orderDetails:{...answer.orderDetails,orderId:'other'}},{transactions:[...answer.transactions,...answer.transactions]}])assert.throws(()=>izi.verifyAnswer({...answer,...x},session));
 assert.equal(izi.verifyAnswer({...answer,orderStatus:'UNPAID',transactions:[]},session).paid,false);
});
test('CreatePayment uses authoritative amount and a per-order IPN URL',async()=>{
 let payload;const r=await izi.createPayment(session,{email:'sandbox@example.com',name:'Fixture'},env.STAGING_ORIGIN,{env,fetcher:async(url,options)=>{assert(url.startsWith('https://api.micuentaweb.pe/'));payload=JSON.parse(options.body);return{ok:true,json:async()=>({status:'SUCCESS',answer:{formToken:'fixture-form-token'}})};}});
 assert.equal(payload.amount,12900);assert.equal(payload.currency,'PEN');assert.equal(payload.orderId,session.provider_order_id);assert.equal(payload.ipnTargetUrl,env.STAGING_ORIGIN+'/api/events/payments/ipn');assert.equal(r.publicKey,env.IZIPAY_TEST_PUBLIC_KEY);
 assert.throws(()=>izi.credentials(env,'PRODUCTION'));
});
test('browser payment return alone cannot settle an order; private IPN can',async()=>{
 const db=dbFor({...session,status:'pending'}),api=create({...out,db,env,sign:()=>'',requireAdmin:()=>null,csrfOk:()=>false,fetcher:async()=>{throw Error('Provider temporarily unavailable');}});
 const browser=await call(api.handler,'/api/events/payments/return',{body:fields(answer,env.IZIPAY_TEST_HMAC)});assert.equal(browser.status,200);assert(!db.calls.some(c=>c[0]==='book_finish_izipay'));
 const forged=await call(api.handler,'/api/events/payments/ipn',{body:fields(answer,env.IZIPAY_TEST_HMAC)});assert.equal(forged.status,400);assert(!db.calls.some(c=>c[0]==='book_finish_izipay'));
 const ipn=await call(api.handler,'/api/events/payments/ipn',{body:fields(answer,env.IZIPAY_TEST_PASSWORD)});assert.equal(ipn.status,200);assert(db.calls.some(c=>c[0]==='book_finish_izipay'));
});
test('CLOSE2U never issues a real tax document for TEST payment or disabled production',async()=>{
 let calls=0;const client=c2u.createClient({env:{...env,C2U_LIVE_ENABLED:'true'},fetcher:async()=>{calls++;throw Error('Must not reach provider');}});
 await assert.rejects(client.send(session));assert.equal(calls,0);
 const disabled=c2u.createClient({env,fetcher:async()=>{throw Error('Must not reach provider');}});await assert.rejects(disabled.send({...session,mode:'PRODUCTION'}));
});
test('CLOSE2U preview keeps price inclusive of IGV and number zero without issuing',async()=>{
 const urls=[];const client=c2u.createClient({env,fetcher:async(url,options)=>{urls.push(url);if(url.endsWith('/token'))return{ok:true,json:async()=>({c2uToken:'fixture-token',fechaExpiracion:new Date(Date.now()+3600000).toISOString()})};const b=JSON.parse(options.body);assert.equal(b.datosDocumento.numero,0);assert.equal(b.close2u.tipoRegistro,'PRECIOS_CON_IGV');assert.equal(b.detalleDocumento[0].precioVentaUnitarioItem,129);return{ok:true,text:async()=>JSON.stringify('JVBERfixture')};}});
 assert.equal(await client.send(session,{preview:true}),'JVBERfixture');assert(urls[1].includes('/preview-api/boleta/'));assert(!urls.some(u=>u.includes('/integracion/boleta/')));
});
test('fiscal fields validate RUC, legal name, fiscal address and optional DNI',()=>{
 assert.throws(()=>c2u.billing({type:'factura',document:'123',name:'X',address:''}));assert.throws(()=>c2u.billing({type:'boleta',document:'123'}));assert.equal(c2u.billing({type:'boleta'}).document,'');
 assert.equal(c2u.billing({type:'factura',document:'20123456789',name:'Fixture SAC',address:'Av. Fixture 123'}).type,'factura');
});
test('invalid or expired checkout tokens fail before reading private payment data',async()=>{
 const db=dbFor(session),api=create({...out,db,env,sign:()=> 'signature',requireAdmin:()=>null,csrfOk:()=>false});
 assert.equal((await call(api.handler,'/api/events/payments/status',{token:'bad'})).status,400);assert.equal(db.calls.length,0);
 const t=session.id+'.1.signature';assert.equal((await call(api.handler,'/api/events/payments/status',{token:t})).status,400);assert.equal(db.calls.length,0);
});
test('public receipt preview requires an authenticated paid TEST session and reuses its result',async()=>{
 const expires=Date.now()+60000,token=session.id+'.'+expires+'.fixture-signature',client_hash=crypto.createHash('sha256').update(token).digest('hex');
 for(const s of [{...session,status:'pending'},{...session,mode:'PRODUCTION'}]){
  const db=dbFor({...s,client_hash}),api=create({...out,db,env,sign:()=> 'fixture-signature',requireAdmin:()=>null,csrfOk:()=>false,fetcher:async()=>{throw Error('Must not reach provider');}});
  assert.equal((await call(api.handler,'/api/events/payments/preview',{token,body:{}})).status,400);
 }
 let calls=0;const db=dbFor({...session,client_hash}),api=create({...out,db,env,sign:()=> 'fixture-signature',requireAdmin:()=>null,csrfOk:()=>false,fetcher:async url=>{calls++;return url.endsWith('/token')?{ok:true,json:async()=>({c2uToken:'fixture-token'})}:{ok:true,text:async()=>JSON.stringify('JVBERfixture')};}});
 const first=await call(api.handler,'/api/events/payments/preview',{token,body:{}}),again=await call(api.handler,'/api/events/payments/preview',{token,body:{}});
 assert.equal(first.status,200);assert.equal(again.value.pdf,'JVBERfixture');assert.equal(calls,2);
});

test('signed production IPN enqueues a retail receipt without changing event enrollment', async () => {
 const live = {...env, IZIPAY_LIVE_ENABLED:'true', IZIPAY_PROD_PASSWORD:'fixture-live-secret', IZIPAY_PROD_PUBLIC_KEY:'fixture-live-public', IZIPAY_PROD_HMAC:'fixture-live-browser'};
 const sale = {...session, mode:'PRODUCTION', order_id:null, billing:{type:'boleta',retailPhone:'999888777'}};
 const db = dbFor(sale);
 const api = create({...out,db,env:live,sign:()=>'',requireAdmin:()=>null,csrfOk:()=>false});
 const paid = {...answer,orderDetails:{...answer.orderDetails,mode:'PRODUCTION'}};
 const forged = await call(api.handler,'/api/events/payments/ipn',{body:fields(paid,live.IZIPAY_PROD_HMAC)});
 assert.equal(forged.status,400);
 assert.equal(db.calls.some(c=>c[0]==='book_invoice_jobs'),false);
 const valid = await call(api.handler,'/api/events/payments/ipn',{body:fields(paid,live.IZIPAY_PROD_PASSWORD)});
 assert.equal(valid.status,200);
 const writes = db.calls.filter(c=>c[0]==='book_invoice_jobs');
 assert.deepEqual(writes,[['book_invoice_jobs','upsert',[{session_id:sale.id},{onConflict:'session_id',ignoreDuplicates:true}]]]);
});

test('verified browser return settles only after an independent matching debit from Izipay',async()=>{
 const transaction={...answer.transactions[0],shopId:session.shop_id,operationType:'DEBIT'};
 for(const expected of [false,true]){
  const db=dbFor({...session,status:'pending'}),api=create({...out,db,env,sign:()=>'',fetcher:async(url,options)=>{
   assert.match(url,/Transaction\/Get$/);
   assert.deepEqual(JSON.parse(options.body),{uuid:transaction.uuid});
   assert.match(options.headers.Authorization,/^Basic /);
   return {ok:true,json:async()=>({status:'SUCCESS',answer:{...transaction,amount:expected?transaction.amount:1}})};
  }});
  const result=await call(api.handler,'/api/events/payments/return',{body:fields(answer,env.IZIPAY_TEST_HMAC)});
  assert.equal(result.value.paid,expected);
  assert.equal(db.calls.some(c=>c[0]==='book_finish_izipay'),expected);
 }
});

test('automatic status check can reconcile a missing IPN by the exact order',async()=>{
 const expires=Date.now()+60000,token=session.id+'.'+expires+'.fixture-signature';
 const client_hash=crypto.createHash('sha256').update(token).digest('hex');
 const db=dbFor({...session,status:'pending',client_hash}),api=create({...out,db,env,sign:()=> 'fixture-signature',fetcher:async(url,options)=>{
  assert.match(url,/Order\/Get$/);
  assert.deepEqual(JSON.parse(options.body),{orderId:session.provider_order_id,operationType:'DEBIT'});
  return {ok:true,json:async()=>({status:'SUCCESS',answer:{...answer,transactions:[{...answer.transactions[0],operationType:'DEBIT'}]}})};
 }});
 const result=await call(api.handler,'/api/events/payments/status?confirm=1',{token});
 assert.equal(result.value.status,'paid');
 assert.equal(db.calls.filter(c=>c[0]==='book_finish_izipay').length,1);
});

test('a recovery hint cannot settle a debit unless Izipay binds it to the expected order',async()=>{
 const transaction={...answer.transactions[0],shopId:session.shop_id,operationType:'DEBIT'};
 const calls=[];
 const lookup=reference=>izi.lookupPaid(session,transaction.uuid,{env,recovery:true,fetcher:async url=>{
  calls.push(url);
  const response=url.endsWith('/Transaction/Get')?transaction:{...answer,orderDetails:{...answer.orderDetails,orderId:reference},transactions:[transaction]};
  return {ok:true,json:async()=>({status:'SUCCESS',answer:response})};
 }});
 assert.equal(await lookup('another-order'),null);
 assert.equal(await lookup(session.provider_order_id),transaction.uuid);
 assert.equal(calls.length,4);
});

test('CLOSE2U routes its automatic email internally so MALBA can send one email with both files',()=>{
 for(const billing of [{type:'boleta'},{type:'factura',document:'20123456789',name:'Fixture SAC',address:'Av. Fixture 123'}]){
  const payload=c2u.buildPayload({...session,billing},env);
  assert.equal(payload.receptor.correo,env.C2U_ISSUER_EMAIL);
  assert.equal(payload.receptor.correoCopia,undefined);
  assert.equal(c2u.buildPayload({...session,billing},env,{preview:true}).receptor.correo,session.email);
 }
});

test('CLOSE2U retrieves the existing PDF using its issued number without calling issuance',async()=>{
 const pdf=Buffer.from('%PDF-1.7\nfixture'),seen=[];
 const fiscal=c2u.createClient({env,fetcher:async(url,options)=>{
  seen.push(url);
  if(url.endsWith('/token'))return {ok:true,json:async()=>({c2uToken:'fixture'})};
  assert.equal(options.method,'PUT');
  assert.deepEqual(JSON.parse(options.body),{emisor:20123456789,numero:3,serie:'BBV1',tipoComprobante:'03'});
  return {ok:true,text:async()=>url.includes('/consultarPdf/')?JSON.stringify(pdf.toString('base64')):url.includes('/consultarXml/')?JSON.stringify({xmlFirma:Buffer.from('<?xml version="1.0"?><Invoice/>').toString('base64')}):JSON.stringify({estadoEntrega:1})};
 }});
 assert.deepEqual(await fiscal.issuedPdf({serie:'BBV1',numero:3},'boleta'),pdf);
 assert.equal((await fiscal.issuedXml({serie:'BBV1',numero:3},'boleta')).toString(), '<?xml version="1.0"?><Invoice/>');
 assert.equal(await fiscal.deliveryStatus({serie:'BBV1',numero:3},'boleta'),'1');
 assert.ok(seen.every(url=>/\/token$|\/consultarPdf\/|\/consultarXml\/|\/consultarEstado\//.test(url)));
 assert.ok(seen.some(url=>url.startsWith('https://jarvis.tefacturo.pe/')&&url.includes('/consultarXml/')));
});
