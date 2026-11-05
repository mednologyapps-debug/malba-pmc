'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('event administration only lists participants and statuses',()=>{
 const s=fs.readFileSync('dashboard/events-admin.js','utf8');
 assert.doesNotMatch(s,/renderBookEventSettings|Configuración del evento|Habilitar inscripciones al evento/);
 assert.match(s,/Participante/);
 assert.match(s,/Estado del libro/);
 assert.match(s,/Pago pendiente/);
 assert.doesNotMatch(s,/Empresa y cargo/);
});
test('event privacy page is present and booking stays consent-gated',()=>{
 const html=fs.readFileSync('evento/presentacion-libro/privacidad.html','utf8');
 assert.match(html,/Aviso de privacidad/);
 const api=fs.readFileSync('event-system/api.js','utf8');
 assert.match(api,/privacyUrl/);assert.match(api,/canRegister/);
 assert.match(api,/capacity:50/);
});
