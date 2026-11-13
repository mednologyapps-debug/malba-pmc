'use strict';
(async()=>{
 const $=s=>document.querySelector(s),token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
 const preview=$('#preview-receipt'),download=$('#receipt-download');
 const confirmation=$('#purchase-confirmation');let confirmed=false;
 const status=$('#checkout-status'),container=$('#payment-container');let pollTimer=null,processing=false;
 async function api(path,body){const r=await fetch('/api/events/payments/'+path,{method:body?'POST':'GET',headers:{'Accept':'application/json','Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined,cache:'no-store',referrerPolicy:'no-referrer'});const type=r.headers.get('content-type')||'';if(!type.includes('json'))throw Error('No pudimos verificar la respuesta del servicio de pago. No vuelvas a enviar el pago; consulta nuevamente su estado o contáctanos.');let data;try{data=await r.json();}catch{throw Error('No pudimos verificar la respuesta del servicio de pago. No vuelvas a enviar el pago; consulta nuevamente su estado o contáctanos.');}if(!r.ok)throw Error(data.error||'No se pudo verificar el pago.');return data;}
 function showPaid(s){
  if(confirmed)return;
  confirmed=true;
  clearTimeout(pollTimer);
  status.textContent=s.mode==='TEST'?'Pago TEST verificado por Izipay. No se realizó ningún cargo real.':'Pago confirmado. Recibirás el comprobante por correo.';
  $('#checkout-title').textContent='Pago confirmado';
  $('#book-delivery').hidden=!s.retail;
  container.hidden=true;
  preview.hidden=s.mode!=='TEST';
  if(s.event&&s.mode==='PRODUCTION'){
   const participation=s.eventStatus==='registered'?'Tu pago y tu inscripción al evento están confirmados.':s.eventStatus==='waitlist'?'Tu pago está confirmado. Tu solicitud de asistencia sigue en lista de espera.':'Tu compra del libro está confirmada.';
   $('#purchase-confirmation-copy').textContent=participation+' Podrás recoger tu ejemplar en el lugar del evento.';
   confirmation.showModal();
  }
 }
 async function verifyAutomatically(){
  const until=Date.now()+90000;
  status.textContent='Procesando tu pago…';
  async function poll(){
   if(confirmed)return;
   try{
    const payment=await api('status?confirm=1');
    if(payment.status==='paid'){showPaid(payment);return;}
   }catch{/* Keep checking automatically after transient failures. */}
   if(Date.now()<until)pollTimer=setTimeout(poll,4000);
   else status.textContent='Te avisaremos por correo cuando se confirme el pago.';
  }
  await poll();
 }
 function script(src,attrs={}){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;for(const[k,v]of Object.entries(attrs))s.setAttribute(k,v);s.onload=resolve;s.onerror=()=>reject(Error('No se pudo cargar el formulario de Izipay. Recarga la página del evento para reintentar.'));document.head.append(s);});}
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
  if(form.retail){
   const back=$('#checkout-back');
   if(back){back.href='/publicaciones/#comprar-libro';back.textContent='Volver a Publicaciones';}
   $('#checkout-help').textContent='La confirmación del pago se valida con Izipay. Después podrás coordinar la entrega por WhatsApp.';
  }
  if(form.paid){showPaid(await api('status'));return;}
  $('#checkout-mode').textContent=form.mode==='TEST'?'Izipay · Modo de prueba':'Pago seguro con Izipay';
  $('#checkout-notice').hidden=form.mode!=='TEST';$('#checkout-total').textContent=new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(form.amount);
  const css=document.createElement('link');css.rel='stylesheet';css.href='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.css';document.head.append(css);
  await script('https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js',{'kr-public-key':form.publicKey,'kr-language':'es-ES'});
  await script('https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.js');
  await window.KR.setFormConfig({formToken:form.formToken,'kr-language':'es-ES'});
  window.KR.onSubmit(async data=>{
   if(processing||confirmed)return false;
   processing=true;
   container.hidden=true;
   status.textContent='Procesando tu pago…';
   try{
    const result=await api('return',{'kr-answer':data.rawClientAnswer,'kr-hash':data.hash});
    if(!result.paid&&!result.waitingForNotification){
     status.textContent='El pago no se completó. Puedes volver a intentarlo.';
     container.hidden=false;
     processing=false;
     return false;
    }
   }catch{/* An uncertain response must be verified before another payment is offered. */}
   await verifyAutomatically();
   return false;
  });
  status.textContent=form.mode==='TEST'?'Formulario Izipay TEST listo. Utiliza una tarjeta de prueba.':'Completa el pago en el formulario seguro.';
 }catch(e){status.textContent=e.message;container.hidden=true;}
 window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
})();
