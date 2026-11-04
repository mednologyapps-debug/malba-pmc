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
 assert.match(app,/\/api\/public-contact/);assert.match(consult,/\/api\/public-contact/);
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
