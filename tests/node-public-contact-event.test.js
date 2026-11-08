'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('all public contact and event scripts are valid JavaScript',()=>{
 for(const file of ['contact-api.js','site-widgets.js','app.js','consultoria.js','academia.js','soluciones.js','dashboard/events-admin.js','evento/presentacion-libro/evento.js','event-system/api.js','event-system/payments.js','event-system/izipay.js']){
  const p=cp.spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
  assert.equal(p.status,0,file+'\n'+p.stderr);
 }
});
test('event form has one registration identity and distinct fiscal data',()=>{
 const html=fs.readFileSync(path.join(root,'evento/presentacion-libro/index.html'),'utf8');
 assert.match(html,/name="receiptType"/);
 assert.match(html,/value="boleta"/);
 assert.match(html,/value="factura"/);
 assert.doesNotMatch(html,/class="optional-fields"/);
 assert.match(html,/Recogerás tu ejemplar en el lugar del evento/);
});
test('public contact is handled on the server, never by launching a WhatsApp draft',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const consult=fs.readFileSync(path.join(root,'consultoria.js'),'utf8');
 assert.match(app,/\/api\/public-contact/);assert.match(consult,/\/api\/consultations\/request/);
 assert.doesNotMatch(app,/window\.open\(destination/);
 assert.doesNotMatch(consult,/window\.open\('https:\/\/wa/);
});
test('production payment mode remains gated by explicit credentials',()=>{
 const izipay=fs.readFileSync(path.join(root,'event-system/izipay.js'),'utf8');
 const api=fs.readFileSync(path.join(root,'event-system/api.js'),'utf8');
 assert.match(izipay,/IZIPAY_LIVE_ENABLED/);
 assert.match(api,/payments\.ready\(gatewayMode\)/);
 assert.match(api,/mode:gatewayMode/);
});

test('contact behind the production proxy sends one notice and one acknowledgment', async t => {
 const nodemailer = require('nodemailer');
 const contact = require('../contact-api');
 const env = {SMTP_HOST:'smtp.example.invalid',SMTP_USER:'sender@example.invalid',SMTP_PASSWORD:'fixture',MALBA_CONTACT_RECIPIENT:'team@example.invalid',NODE_ENV:'production'};
 const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
 Object.assign(process.env, env);
 t.after(() => {
  for (const [key, value] of Object.entries(previous)) {
   if (value === undefined) delete process.env[key];
   else process.env[key] = value;
  }
 });
 const messages = [];
 t.mock.method(nodemailer,'createTransport',() => ({sendMail:async message => {
  messages.push(message);
  return {accepted:[message.to]};
 }}));
 const request = {
  method:'POST', socket:{remoteAddress:'127.0.0.1'},
  headers:{origin:'https://malba-pmc.com',host:'olivedrab-mouse-758184.hostingersite.com','content-type':'application/json'},
  async *[Symbol.asyncIterator]() {
   yield Buffer.from(JSON.stringify({name:'Participante QA',email:'visitor@example.invalid',message:'Consulta de prueba de contacto.'}));
  }
 };
 const result = await contact(request,{}, {json:(_,status,body) => ({status,body})});
 assert.equal(result.status,200);
 assert.equal(messages.length,2);
 assert.equal(messages[0].to,'team@example.invalid');
 assert.equal(messages[0].replyTo.address,'visitor@example.invalid');
 assert.equal(messages[1].to.address,'visitor@example.invalid');
 assert.match(result.body.message,/confirmación/);
});
