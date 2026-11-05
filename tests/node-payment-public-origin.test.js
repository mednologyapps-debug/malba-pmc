'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {publicOrigin,allowedBrowserOrigin}=require('../event-system/public-origin');
test('production reverse proxy uses canonical domain rather than internal staging',()=>{
 const env={NODE_ENV:'production',STAGING_ORIGIN:'https://olivedrab-mouse-758184.hostingersite.com'};
 assert.equal(publicOrigin(env),'https://malba-pmc.com');
 assert.equal(allowedBrowserOrigin('https://malba-pmc.com',env),true);
 assert.equal(allowedBrowserOrigin('https://malba-pmc.com.evil.test',env),false);
 assert.equal(allowedBrowserOrigin('http://malba-pmc.com',env),false);
});
test('explicit HTTPS canonical origin remains stable behind proxy',()=>{
 const env={NODE_ENV:'production',MALBA_PUBLIC_ORIGIN:'https://malba-pmc.com'};
 assert.equal(publicOrigin(env),'https://malba-pmc.com');
 assert.equal(allowedBrowserOrigin('https://olivedrab-mouse-758184.hostingersite.com',env),true);
 assert.throws(()=>publicOrigin({...env,MALBA_PUBLIC_ORIGIN:'https://attacker.example'}));
 assert.throws(()=>publicOrigin({...env,MALBA_PUBLIC_ORIGIN:'http://malba-pmc.com'}));
});
test('staging fallback remains available when not in production',()=>{
 assert.equal(publicOrigin({NODE_ENV:'development'}),'https://olivedrab-mouse-758184.hostingersite.com');
});
test('checkout page has no forced sandbox navigation',()=>{
 const html=fs.readFileSync('evento/presentacion-libro/pago.html','utf8');
 assert.doesNotMatch(html,/prueba=1/);
 assert.match(html,/href="\/evento\/presentacion-libro\/"/);
});
