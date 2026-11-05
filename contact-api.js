'use strict';
const nodemailer=require('nodemailer');
const limits=new Map();
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function str(v,n){return typeof v==='string'?v.trim().slice(0,n):'';}
async function read(req){let length=0,buffers=[];for await(const chunk of req){length+=chunk.length;if(length>10000)throw new Error('El formulario es demasiado grande.');buffers.push(chunk);}return JSON.parse(Buffer.concat(buffers).toString('utf8'));}
module.exports=async function contact(req,res,{json}){
 if(req.method!=='POST')return json(res,405,{error:'Método no permitido.'});
 const origin=String(req.headers.origin||'');
 if(origin){try{if(!require('./event-system/public-origin').allowedBrowserOrigin(origin))return json(res,403,{error:'Origen no permitido.'});}catch{return json(res,403,{error:'Origen no permitido.'});}}
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Formato no permitido.'});
 let b;try{b=await read(req);}catch{return json(res,400,{error:'Solicitud inválida.'});}
 if(!b||typeof b!=='object')return json(res,400,{error:'Solicitud inválida.'});
 if(str(b.website,100))return json(res,200,{ok:true});
 const name=str(b.name,120),email=str(b.email,254).toLowerCase(),phone=str(b.phone,30),company=str(b.company,150),service=str(b.service,100),message=str(b.message,1500),source=str(b.source,60);
 if(name.length<3||!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email)||message.length<10)return json(res,400,{error:'Completa nombre, correo y una consulta de al menos 10 caracteres.'});
 const key=String(req.socket.remoteAddress||'unknown');
 const now=Date.now();
 for(const [k,v] of limits)if(now-v.started>600000)limits.delete(k);
 function withinLimit(id,max){
  if(limits.size>=10000&&!limits.has(id))return false;
  const current=limits.get(id)||{started:now,count:0};
  current.count++;
  limits.set(id,current);
  return current.count<=max;
 }
 if(!withinLimit(key,80)||!withinLimit(key+':'+email,5))return json(res,429,{error:'Has enviado varias consultas. Inténtalo más tarde.'});
 const env=process.env,host=env.SMTP_HOST,user=env.SMTP_USER,pass=env.SMTP_PASSWORD||env.SMTP_PASS,to=env.MALBA_CONTACT_RECIPIENT||env.SMTP_USER;
 if(!host||!user||!pass||!to)return json(res,503,{error:'El correo de contacto no está configurado. Intenta más tarde.'});
 const port=Number(env.SMTP_PORT||465),secure=env.SMTP_SECURE?env.SMTP_SECURE==='true':port===465;
 const transport=nodemailer.createTransport({host,port,secure,auth:{user,pass},tls:{rejectUnauthorized:true}});
 const entries=[['Nombre',name],['Correo',email],['Celular',phone],['Empresa',company],['Servicio',service],['Origen',source],['Consulta',message]].filter(x=>x[1]);
 const plain=entries.map(([k,v])=>k+': '+v).join('\n');
 const html='<div style="font:14px/1.7 Arial,sans-serif;color:#183b62;max-width:620px;margin:auto"><h2 style="color:#5d4594">Nueva consulta · MALBA PMC</h2>'+entries.map(([k,v])=>'<p><strong>'+esc(k)+'</strong><br>'+esc(v).replace(/\n/g,'<br>')+'</p>').join('')+'</div>';
 let from;
 try{
  from=require('./mail-sender').sender(env);
  const received=await transport.sendMail({from,to,replyTo:{name,address:email},subject:'Nueva consulta desde la web MALBA PMC',text:plain,html});
  if(!received.accepted.length)throw Error('Destinatario administrativo rechazado.');
 }catch(e){console.error('MALBA contact SMTP notification:',e?.code||e?.name||'error',e?.responseCode||'');return json(res,502,{error:'No pudimos enviar tu consulta. Intenta nuevamente más tarde.'});}
 try{
  const ack=await transport.sendMail({from,to:{address:email},subject:'Recibimos tu consulta · MALBA PMC',text:'Hola, '+name+'. Recibimos tu consulta y nuestro equipo se pondrá en contacto contigo por correo. Gracias por escribirnos.'});
  if(!ack.accepted.length)throw Error('Destinatario del acuse rechazado.');
  return json(res,200,{ok:true,message:'Recibimos tu consulta y enviamos una confirmación a tu correo.'});
 }catch(e){
  console.error('MALBA contact SMTP confirmation:',e?.code||e?.name||'error',e?.responseCode||'');
  return json(res,200,{ok:true,message:'Recibimos tu consulta. El correo de confirmación no pudo enviarse.'});
 }
};
