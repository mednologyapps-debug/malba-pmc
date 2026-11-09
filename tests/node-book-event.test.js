'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const fs=require('node:fs');const create=require('../event-system/api');const ExcelJS=require('exceljs');
const valid={name:'Participante de prueba',email:'QA@example.invalid',phone:'+51 999 111 222',mode:'free',consent:true,capacity:true};
const config={title:'Evento QA',date:'2027-01-01T23:00:00.000Z',location:'Sede QA',capacity:2,status:'published',registrationOpen:true,price:150,priceConfirmed:true,bookAvailable:true,paymentMode:'sandbox',deliveries:['Recojo QA'],adminEmail:'admin@example.invalid',privacyUrl:'https://example.invalid/privacy'};
const sign=x=>crypto.createHmac('sha256','local-test-only').update(x).digest('hex');
function fakeDb(responder){const calls=[];return{calls,from(table){const c={table,op:'select',filters:[]};const chain=new Proxy({}, {get(_,key){if(key==='then')return(resolve,reject)=>Promise.resolve(responder(c)).then(resolve,reject);return(...args)=>{if(['select','insert','update','delete'].includes(key)){if(key==='select')c.select=args;else{c.op=key;c.payload=args[0];}}else c.filters.push([key,...args]);calls.push(c);return chain;};}});return chain;},rpc(name,args){calls.push({rpc:name,args});return Promise.resolve(responder({rpc:name,args}));}};}
function setup(responder,options={}){const db=fakeDb(responder),api=create({db,json:(r,status,value)=>{r.status=status;r.value=value;},text:(r,status,value)=>{r.status=status;r.value=value;},requireAdmin:(req,res)=>{if(options.admin)return {csrf:'csrf'};res.status=401;res.value={error:'Sesión requerida'};return null;},csrfOk:()=>options.csrf!==false,nodemailer:options.mailer||{},ExcelJS,sign});return{db,async call(route,body,headers={}){const req={method:body?'POST':'GET',headers:{origin:'https://olivedrab-mouse-758184.hostingersite.com','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body));}},res={};await api(req,res,new URL(route,'http://test.local'));return res;}};}
test('validates data, explicit consent, honeypot and configuration before opening',()=>{assert.equal(create.validateRegistration(valid).email,'qa@example.invalid');for(const x of [{email:'bad'},{consent:false},{capacity:false},{website:'spam'},{phone:'abc'},{mode:'other'}])assert.throws(()=>create.validateRegistration({...valid,...x}));assert.throws(()=>create.validateConfig({...config,capacity:null}));assert.throws(()=>create.validateConfig({...config,privacyUrl:''}));assert.throws(()=>create.validateConfig({...config,adminEmail:''}));assert.throws(()=>create.validateConfig({...config,paymentMode:'live'}));assert.equal(create.validateConfig(config).paymentMode,'sandbox');});
test('public configuration hides administrative email and reports unavailable DB honestly',async()=>{const a=setup(()=>({data:{config,revision:1}}));const r=await a.call('/api/events/config');assert.equal(r.status,200);assert.equal(r.value.adminEmail,undefined);assert.equal(r.value.registrationOpen,true);});
test('admin endpoints reject anonymous and invalid CSRF without DB reads',async()=>{const a=setup(()=>{throw Error('must not reach database');});assert.equal((await a.call('/api/events/admin/config')).status,401);const b=setup(()=>{throw Error('must not reach database');},{admin:true,csrf:false});assert.equal((await b.call('/api/events/admin/config',{})).status,403);});
test('rejects cross-origin submissions before RPC',async()=>{const a=setup(()=>{throw Error('must not reach database');});assert.equal((await a.call('/api/events/register',valid,{origin:'https://evil.invalid'})).status,403);});
test('registration uses atomic RPC; SMTP absent leaves durable outbox queued',async()=>{const a=setup(c=>c.rpc?{data:{id:'registration',status:'registered'}}:{data:{config}});const r=await a.call('/api/events/register',valid);assert.equal(r.status,201);assert.equal(r.value.emailSent,false);assert.equal(r.value.emailQueued,true);assert.equal(a.db.calls[0].rpc,'book_register');assert.equal(a.db.calls[0].args.payload.email,'qa@example.invalid');});
test('duplicates return no registration, order, personal data or payment token',async()=>{const a=setup(()=>({data:{duplicate:true}}));const r=await a.call('/api/events/register',valid);assert.equal(r.status,200);assert.equal(r.value.duplicate,true);assert.equal(r.value.paymentToken,undefined);assert.equal(r.value.orderId,undefined);});
test('signed sandbox token can only produce simulated_paid; forged and expired tokens fail',async()=>{const id='12345678-1234-1234-1234-123456789abc';const a=setup(c=>c.table==='book_events'?{data:{config}}:c.table==='book_orders'?{data:[{id,status:'simulated_paid'}]}:{data:[]});const raw=id+':'+(Date.now()+60000),token=raw+'.'+sign('book-payment:'+raw);const r=await a.call('/api/events/simulate',{token,outcome:'success'});assert.equal(r.status,200);assert.equal(r.value.status,'simulated_paid');assert(a.db.calls.some(c=>c.table==='book_orders'&&c.payload?.status==='simulated_paid'));assert(!a.db.calls.some(c=>c.payload?.status==='paid'));assert.equal((await a.call('/api/events/simulate',{token:token+'x',outcome:'success'})).status,403);const old=id+':1';assert.equal((await a.call('/api/events/simulate',{token:old+'.'+sign('book-payment:'+old),outcome:'success'})).status,403);});
test('exports a readable workbook with text cells and participant/order data',async()=>{const a=setup(()=>({data:[{created_at:'2026-11-04',mode:'free',status:'registered',book_participants:{full_name:'=UNTRUSTED()',email:'qa@example.invalid',phone:'999111222'},book_orders:[],utm:{utm_source:'linkedin'}}]}),{admin:true});const r=await a.call('/api/events/admin/export');assert.equal(r.status,200);const wb=new ExcelJS.Workbook();await wb.xlsx.load(r.value);assert.equal(wb.worksheets[0].getCell('B2').value,'=UNTRUSTED()');assert.equal(wb.worksheets[0].getCell('M2').value,'linkedin');});
test('SMTP sends distinct participant and administrator messages with escaped content and idempotent claim',async()=>{const old={};for(const k of ['SMTP_HOST','SMTP_USER','SMTP_PASSWORD']){old[k]=process.env[k];process.env[k]=k==='SMTP_USER'?'aula@example.invalid':'test';}try{const sent=[],person={full_name:'<script>QA</script>',email:'qa@example.invalid'},jobs=[{id:'job1',registration_id:'reg',kind:'registration',attempts:0},{id:'job2',registration_id:'reg',kind:'admin',attempts:0}];const a=setup(c=>c.rpc?{data:{id:'reg',status:'registered'}}:c.table==='book_events'?{data:{config}}:c.table==='book_registrations'?{data:{status:'registered',mode:'free',book_participants:person,book_orders:[]}}:c.table==='book_mail_outbox'&&c.op==='select'?{data:jobs}:c.payload?.status==='sending'?{data:[{id:'claim'}]}:{data:[]},{mailer:{createTransport:()=>({sendMail:async m=>sent.push(m),close(){}})}});const r=await a.call('/api/events/register',valid);assert.equal(r.value.emailSent,true);assert.equal(sent.length,2);assert.equal(sent[0].to,person.email);assert.equal(sent[1].to,config.adminEmail);assert(sent[0].html.includes('&lt;script&gt;QA&lt;/script&gt;'));assert(sent[0].text.includes(create.CAPACITY));assert.equal(sent[0].subject,'Recibimos tu inscripción | Presentación del libro MALBA PMC');}finally{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}});
test('static landing has consent, two choices, correct assets and private server modules',()=>{const html=fs.readFileSync('evento/presentacion-libro/index.html','utf8');assert.equal((html.match(/<h1>/g)||[]).length,1);for(const asset of [...html.matchAll(/(?:src|href)="(\/assets\/[^"#]+)"/g)].map(x=>x[1]))assert(fs.existsSync('.'+asset.split('?')[0]),asset);assert(html.includes('name="capacity" required'));assert(html.includes('data-mode="free"'));assert(html.includes('data-mode="book"'));assert(fs.readFileSync('server.js','utf8').includes('server\\.js|event-system|'));});

test('launch price includes all November 27 in Peru then returns to regular price',()=>{
 const c={price:129,regularPrice:169,launchUntil:'2026-11-28T00:00:00-05:00'};
 assert.equal(create.priceAt(c,Date.parse('2026-11-27T23:59:59.999-05:00')),129);
 assert.equal(create.priceAt(c,Date.parse('2026-11-28T00:00:00-05:00')),169);
 assert.equal(create.priceAt({price:150},Date.now()),150);
});

test('isolated event demo registers only synthetic fixtures and requires admin to list them',async()=>{
 const a=setup(()=>{throw Error('Demo must never access the database');},{admin:true});
 const headers={host:'olivedrab-mouse-758184.hostingersite.com'};
 const c=await a.call('/api/events/demo/config',undefined,headers);
 assert.equal(c.status,200);assert.equal(c.value.testMode,true);assert.equal(c.value.registrationOpen,true);
 const r=await a.call('/api/events/demo/register',{fixtureId:c.value.fixtureId,mode:'book',consent:true,capacity:true,name:'Private name',email:'private@actual.test'},headers);
 assert.equal(r.status,201);assert.equal(r.value.amount,129);assert.equal(r.value.emailQueued,false);
 const paid=await a.call('/api/events/demo/simulate',{token:r.value.paymentToken,outcome:'success'},headers);
 assert.equal(paid.value.status,'simulated_paid');
 const list=await a.call('/api/events/admin/demo/registrations',undefined,headers);
 assert.equal(list.value.total,1);assert.equal(list.value.rows[0].book_participants.full_name,'Participante de prueba');
 assert(list.value.rows[0].book_participants.email.endsWith('@example.invalid'));
 assert.equal(a.db.calls.length,0);
 const anon=setup(()=>{throw Error('No DB');});assert.equal((await anon.call('/api/events/admin/demo/registrations',undefined,headers)).status,401);
 assert.equal((await a.call('/api/events/demo/register',{fixtureId:c.value.fixtureId,mode:'free',consent:true,capacity:true},{...headers,origin:'https://other.invalid'})).status,403);
 assert.equal((await a.call('/api/events/demo/config',undefined,{host:'malba-pmc.com'})).status,404);
});

test('book registration returns a pending payment token without sending registration mail',async t=>{
 const keys=['IZIPAY_LIVE_ENABLED','IZIPAY_SHOP_ID','IZIPAY_PROD_PASSWORD','IZIPAY_PROD_PUBLIC_KEY','IZIPAY_PROD_HMAC','C2U_LIVE_ENABLED','C2U_RUC','C2U_USER','C2U_PASSWORD','C2U_SERIE_FACTURA','C2U_SERIE_BOLETA'];
 for(const key of keys){const previous=process.env[key];process.env[key]=key.endsWith('ENABLED')?'true':'test-only';t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});}
 const id='12345678-1234-4234-8234-123456789abc';
 const a=setup(call=>{
  if(call.table==='book_events')return {data:{config:{...config,paymentMode:'production'}}};
  if(call.rpc==='book_register')return {data:{id:'registration',status:'registered',orderId:id,amount:10}};
  throw Error('Unexpected lookup before payment');
 });
 const result=await a.call('/api/events/register',{...valid,mode:'book'});
 assert.equal(result.status,201);
 assert.equal(result.value.status,'pending_payment');
 assert.equal(result.value.orderId,id);
 assert.match(result.value.paymentToken,/^12345678-/);
 assert.equal(a.db.calls.some(call=>call.table==='book_mail_outbox'),false);
});

test('purchase confirmation reads the one-to-one order returned by PostgREST',async t=>{
 for(const key of ['SMTP_HOST','SMTP_USER','SMTP_PASSWORD']){
  const previous=process.env[key];
  process.env[key]=key==='SMTP_USER'?'team@example.invalid':'test-only';
  t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});
 }
 const sent=[];
 const a=setup(c=>{
  if(c.table==='book_events')return {data:{config}};
  if(c.table==='book_registrations')return {data:{status:'registered',mode:'book',book_participants:{full_name:'Prueba',email:'qa@example.invalid'},book_orders:{id:'paid-order',amount:10,status:'paid',delivery:'Recojo'}}};
  if(c.op==='select')return {data:[{id:'job',registration_id:'reg',kind:'purchase',attempts:0}]};
  return {data:[{id:'job'}]};
 },{admin:true,mailer:{createTransport:()=>({sendMail:async message=>{sent.push(message);return {accepted:[message.to]};},close(){}})}});
 const response=await a.call('/api/events/admin/mail',{});
 assert.equal(response.value.sent,1);
 assert.equal(sent.length,1);
 assert.match(sent[0].text,/Tu pago y tu inscripción a la presentación están confirmados/);
});
