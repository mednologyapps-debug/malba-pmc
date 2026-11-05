'use strict';
// Public URLs are explicitly configured, never derived from proxy forwarding headers.
// This avoids relying on the Hostinger internal host for Izipay's public IPN URL.
const MAIN='https://malba-pmc.com';
const STAGING='https://olivedrab-mouse-758184.hostingersite.com';
function normalized(value){
 try{
  const u=new URL(String(value||''));
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('invalid');
  return u.origin;
 }catch{throw Error('La URL pública de pagos debe ser HTTPS y no incluir rutas ni parámetros.');}
}
function publicOrigin(env=process.env){
 const chosen=env.MALBA_PUBLIC_ORIGIN||env.PUBLIC_SITE_ORIGIN||(env.NODE_ENV==='production'?MAIN:(env.STAGING_ORIGIN||STAGING));
 const origin=normalized(chosen);
 if(![MAIN,STAGING].includes(origin))throw Error('El dominio público de pagos no está autorizado.');
 return origin;
}
function allowedBrowserOrigin(origin,env=process.env){
 if(!origin)return false;
 const allowed=new Set([MAIN,STAGING,publicOrigin(env)]);
 if(env.NODE_ENV!=='production')allowed.add('http://localhost:3000'),allowed.add('http://127.0.0.1:3000');
 return allowed.has(origin);
}
module.exports={publicOrigin,allowedBrowserOrigin,MAIN,STAGING};
