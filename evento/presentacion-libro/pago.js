'use strict';
(async()=>{
 const $=s=>document.querySelector(s),token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
 const preview=$('#preview-receipt'),download=$('#receipt-download');
 const status=$('#checkout-status'),container=$('#payment-container'),check=$('#check-status');let pollTimer=null,polls=0;
 async function api(path,body){const r=await fetch('/api/events/payments/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined,cache:'no-store',referrerPolicy:'no-referrer'});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo verificar el pago.');return data;}
 async function refresh(){try{const s=await api('status');if(s.status==='paid'){status.textContent=s.mode==='TEST'?'Pago TEST verificado por Izipay. No se realizó ningún cargo real.':'Pago confirmado. Recibirás el comprobante cuando termine su procesamiento.';$('#checkout-title').textContent='Pago confirmado';$('#book-delivery').hidden=!s.retail;container.hidden=true;check.hidden=true;preview.hidden=s.mode!=='TEST';clearInterval(pollTimer);return;}status.textContent='Estamos esperando la confirmación de Izipay. Puedes verificar nuevamente en unos segundos.';}catch(e){status.textContent=e.message;clearInterval(pollTimer);}}
 function script(src,attrs={}){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;for(const[k,v]of Object.entries(attrs))s.setAttribute(k,v);s.onload=resolve;s.onerror=()=>reject(Error('No se pudo cargar el formulario de Izipay. Recarga la página del evento para reintentar.'));document.head.append(s);});}
 check.addEventListener('click',refresh);
 preview.addEventListener('click',async()=>{
  preview.disabled=true;status.textContent='Preparando la vista previa del comprobante…';
  try{const data=await api('preview',{}),value=typeof data.pdf==='string'?data.pdf:(data.pdf?.pdf||data.pdf?.base64||data.pdf?.archivo);if(typeof value!=='string')throw Error('El facturador no devolvió un PDF de vista previa.');
   const raw=value.replace(/^data:application\/pdf;base64,/,''),bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('La vista previa no tiene formato PDF.');
   download.href=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));download.hidden=false;preview.hidden=true;status.textContent='Vista previa lista. Este documento de prueba no se envía a SUNAT.';
  }catch(e){status.textContent=e.message;}finally{preview.disabled=false;}
 });
 try{
  if(!/^[a-f0-9-]{36}\.\d+\.[a-f0-9]+$/i.test(token))throw Error('Abre el pago desde el formulario original para iniciar una sesión válida.');
  const form=await api('checkout');
  if(form.retail){const back=$('#checkout-back');back.href='/publicaciones/#comprar-libro';back.textContent='Volver a Publicaciones';}
  if(form.paid){await refresh();return;}
  $('#checkout-mode').textContent=form.mode==='TEST'?'Izipay · Modo de prueba':'Pago seguro con Izipay';
  $('#checkout-notice').hidden=form.mode!=='TEST';$('#checkout-total').textContent=new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(form.amount);
  const css=document.createElement('link');css.rel='stylesheet';css.href='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.css';document.head.append(css);
  await script('https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js',{'kr-public-key':form.publicKey,'kr-language':'es-ES'});
  await script('https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.js');
  await window.KR.setFormConfig({formToken:form.formToken,'kr-language':'es-ES'});
  window.KR.onSubmit(async data=>{
   try{await api('return',{'kr-answer':data.rawClientAnswer,'kr-hash':data.hash});container.hidden=true;check.hidden=false;await refresh();pollTimer=setInterval(()=>{if(++polls>=12){clearInterval(pollTimer);return;}refresh();},5000);}catch(e){status.textContent=e.message;check.hidden=false;}
   return false;
  });
  status.textContent=form.mode==='TEST'?'Formulario Izipay TEST listo. Utiliza una tarjeta de prueba.':'Completa el pago en el formulario seguro.';
 }catch(e){status.textContent=e.message;container.hidden=true;}
 window.addEventListener('pagehide',()=>clearInterval(pollTimer));
})();
