'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sender,address}=require('../mail-sender');
test('Hostinger formatted SMTP_FROM resolves to authenticated mailbox',()=>{
 const env={SMTP_USER:'aula@malba-pmc.com',SMTP_FROM:'MALBA PMC <aula@malba-pmc.com>'};
 assert.deepEqual(sender(env),{name:'MALBA PMC',address:'aula@malba-pmc.com'});
 assert.equal(address(env.SMTP_FROM),'aula@malba-pmc.com');
});
test('SMTP_FROM cannot spoof a different address',()=>{
 const env={SMTP_USER:'aula@malba-pmc.com',SMTP_FROM:'otro@example.com'};
 assert.equal(sender(env).address,'aula@malba-pmc.com');
});
test('Invalid SMTP credentials fail cleanly',()=>assert.throws(()=>sender({SMTP_USER:'nope'})));
test('Event registration distinguishes failed emails from queued mail',()=>{
 const api=require('node:fs').readFileSync('event-system/api.js','utf8');
 assert.match(api,/emailFailed:/);assert.match(api,/require\('\.\.\/mail-sender'\)\.sender/);
});
