'use strict';
(()=>{
 const $=s=>document.querySelector(s),dialog=$('#registration'),form=$('#registration-form'),submit=$('#submit-registration');
 const notice='La inscripción al evento está sujeta al aforo disponible y no garantiza el ingreso. Recomendamos llegar con anticipación y seguir las indicaciones de la organización. La adquisición del libro no otorga prioridad ni garantiza el acceso al evento.';
 document.querySelectorAll('.capacity-copy').forEach(x=>x.textContent=notice);
 const utm={};for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']){const v=new URLSearchParams(location.search).get(key);if(v)utm[key]=v.slice(0,100);}
 let config=null,mode='free',busy=false,lastTrigger=null,paymentToken=null,orderAmount=null,billingDetails=null;
 const demoMode=new URLSearchParams(location.search).get('prueba')==='1';
 const money=n=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(n);
 function metric(event){if(demoMode)return;fetch('/api/events/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,source:utm.utm_source||''}),keepalive:true}).catch(()=>{});}
 async function api(path,body){if(demoMode)path=path.replace('/api/events/','/api/events/demo/');const r=await fetch(path,{method:body?'POST':'GET',headers:{'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});if(!r.headers.get('content-type')?.includes('application/json'))throw Error('El servicio de inscripción no está disponible. Intenta más tarde.');const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo completar la solicitud.');return data;}
 const receiptField=$('#receipt-document'),invoiceExtra=$('#invoice-extra');
 document.querySelectorAll('input[name=receiptType]').forEach(input=>input.addEventListener('change',()=>{
  const invoice=form.elements.receiptType.value==='factura';
  invoiceExtra.hidden=!invoice;receiptField.required=invoice;receiptField.maxLength=invoice?11:8;
  receiptField.placeholder=invoice?'RUC de 11 dígitos':'DNI de 8 dígitos (opcional)';
  $('#receipt-document-label').firstChild.textContent=invoice?'RUC (obligatorio)':'DNI (opcional)';
  invoiceExtra.querySelectorAll('input').forEach(field=>field.required=invoice);
 }));
 const canBuy=()=>config?.bookAvailable&&config?.priceConfirmed&&config?.price>0&&['sandbox','production'].includes(config?.paymentMode)&&(['izipay_test','izipay_live'].includes(config?.paymentProvider)||demoMode&&config?.paymentProvider==='simulation');
 function updateMode(){
  $('#purchase-fields').hidden=mode!=='book';
  document.querySelectorAll('.mode-switch button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  $('#form-title').textContent=mode==='book'?'Inscríbete y compra tu libro':'Inscríbete al evento';
  $('#form-intro').textContent=mode==='book'?'Completa tus datos para continuar al pago seguro. Verás la confirmación cuando Izipay apruebe el pago.':'Completa tus datos para inscribirte.';
  const open=!!config?.registrationOpen;
  submit.disabled=!open||mode==='book'&&!canBuy();submit.textContent=!open?'Inscripciones próximamente':mode==='book'?(config?.paymentProvider==='izipay_live'?'Continuar al pago seguro':config?.paymentProvider==='izipay_test'?'Continuar a Izipay TEST':'Continuar a pago de prueba'):'Confirmar inscripción';
  $('#form-error').textContent=!open?'Las inscripciones todavía no están abiertas. La organización confirmará los detalles del evento.':mode==='book'&&!canBuy()?'La compra aún no está habilitada. Puedes cambiar a «Solo evento» para inscribirte.':'';
 }
 function setMode(value,trigger){if(busy)return;mode=value;updateMode();if(!dialog.open){lastTrigger=trigger;$('#form-content').hidden=false;$('#result').hidden=true;dialog.showModal();metric(value==='book'?'click_book':'click_free');}}
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode,b)));
 $('#registration .close').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>lastTrigger?.focus());
 function showResult(title,copy){$('#form-content').hidden=true;const section=$('#result');section.replaceChildren();section.hidden=false;const mark=document.createElement('span');mark.className='success-mark';mark.textContent='✓';mark.setAttribute('aria-hidden','true');const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=copy;const capacity=document.createElement('p');capacity.className='form-capacity';capacity.textContent=notice;section.append(mark,h,p,capacity);section.focus();dialog.scrollTop=0;return section;}
 function addButton(container,label,handler){const b=document.createElement('button');b.type='button';b.className='solid-button';b.textContent=label;b.addEventListener('click',handler);container.append(b);return b;}
 async function startPayment(data, billing){
  if(!['izipay_test','izipay_live'].includes(config?.paymentProvider)){
   paymentToken=data.paymentToken;orderAmount=data.amount;simulatePayment();return;
  }
  submit.textContent='Abriendo Izipay…';
  const payment=await api('/api/events/payments/start',{token:data.paymentToken,billing});
  if(!payment.checkoutUrl)throw Error('No pudimos abrir el pago. Puedes volver a intentarlo.');
  location.assign(payment.checkoutUrl);
 }
 function simulatePayment(){
  const section=showResult('Pedido de prueba pendiente','Selecciona un resultado para simular el pago.');
  const total=document.createElement('p');total.textContent='Libro físico · '+money(orderAmount??config.price)+' · '+$('#delivery').value;section.append(total);const actions=document.createElement('div');actions.className='payment-actions';section.append(actions);
  for(const [outcome,label]of [['success','Simular pago aprobado'],['failed','Simular pago fallido'],['pending','Simular pago pendiente']])addButton(actions,label,async()=>{if(busy)return;busy=true;actions.querySelectorAll('button').forEach(b=>b.disabled=true);try{const r=await api('/api/events/simulate',{token:paymentToken,outcome});const view=showResult(r.status==='simulated_paid'?'Prueba completada.':r.status==='failed'?'El pago de prueba falló.':'Pago de prueba pendiente.',r.message);if(r.status!=='simulated_paid')addButton(view,'Reintentar pago de prueba',simulatePayment);addButton(view,'Cerrar',()=>dialog.close());}catch(e){const p=document.createElement('p');p.textContent=e.message;actions.after(p);actions.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{busy=false;}});
 }
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy||!form.reportValidity())return;if(!config?.registrationOpen||mode==='book'&&!canBuy())return;busy=true;submit.disabled=true;submit.textContent='Registrando…';$('#form-error').textContent='';const f=new FormData(form);try{
  billingDetails=null;
  if(mode==='book'){
   const type=f.get('receiptType')==='factura'?'factura':'boleta';
   const document=String(f.get('receiptDocument')||'').trim();
   const name=String(f.get('receiptBusinessName')||'').trim();
   const address=String(f.get('receiptAddress')||'').trim();
   if(type==='factura'&&(!/^\d{11}$/.test(document)||name.length<3||address.length<5))throw Error('Para factura, indica RUC de 11 dígitos, razón social y dirección fiscal.');
   if(type==='boleta'&&document&&!/^\d{8}$/.test(document))throw Error('Para boleta, el DNI debe tener 8 dígitos.');
   billingDetails={type,document,name,address};
  }
  const data=await api('/api/events/register',demoMode?{fixtureId:config.fixtureId,mode,consent:f.has('consent'),capacity:f.has('capacity')}:{...Object.fromEntries(f),mode,consent:f.has('consent'),capacity:f.has('capacity'),utm});
  if(mode==='book'){
   if(data.duplicate||!data.paymentToken)throw Error(data.message||'Revisa tu correo y celular antes de reintentar el pago.');
   await startPayment(data,billingDetails);
  } else if(data.duplicate){const s=showResult('Revisemos tu inscripción.',data.message);addButton(s,'Cerrar',()=>dialog.close());}
  else{const s=showResult(data.status==='waitlist'?'Estás en lista de espera.':'Recibimos tu inscripción.',data.testMode?'Tu registro de prueba está guardado. Puedes revisarlo en el administrador.':data.status==='waitlist'?'Registramos tu solicitud en lista de espera. La organización te informará sobre la disponibilidad.':data.emailSent?'Registramos tu participación. Revisa tu correo para ver los detalles y el aviso de aforo.':data.emailFailed?'Tu inscripción quedó registrada, pero no pudimos enviar el correo de confirmación. MALBA revisará el envío.':'Tu registro está guardado. El correo de confirmación está en proceso de envío.');addButton(s,'Listo, cerrar',()=>dialog.close());if(!demoMode)form.reset();}
 }catch(err){$('#form-error').textContent=err.message;$('#form-error').scrollIntoView({block:'nearest'});}finally{busy=false;const message=$('#form-error').textContent;updateMode();if(message)$('#form-error').textContent=message;}});
 api('/api/events/config').then(c=>{config=c;document.querySelectorAll('a[data-privacy]').forEach(a=>{if(c.privacyUrl){a.href=c.privacyUrl;a.removeAttribute('aria-disabled');}else{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.title='La organización confirmará la política antes de abrir inscripciones.';}});if(c.date){const date=new Date(c.date);$('#event-date').textContent=date.toLocaleString('es-PE',{timeZone:'America/Lima',day:'numeric',month:'long',year:'numeric'});$('#event-time').textContent=date.toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit',hour12:true})+' · Hora de Perú';}if(c.location)$('#event-location').textContent=c.location;
  $('#test-notice').hidden=!c.testMode;
  if(c.testMode){for(const [name,value]of Object.entries(c.profile)){const input=form.elements[name];if(input){input.value=value;input.readOnly=true;}}$('#registration-consent').textContent='Entiendo que este es un registro de prueba y usaré datos ficticios.';}
  if(c.priceConfirmed&&c.price>0){
   $('#order-price').textContent=money(c.price);$('#order-total').textContent=money(c.price);
   document.querySelectorAll('[data-book-price]').forEach(x=>x.textContent=money(c.price));
   const launch=Number(c.regularPrice)>Number(c.price);
   document.querySelectorAll('[data-price-label]').forEach(x=>x.textContent=launch?'Libro a precio de lanzamiento':'Libro físico');
   document.querySelectorAll('[data-regular-wrap]').forEach(x=>x.hidden=!launch);
   document.querySelectorAll('[data-regular-price]').forEach(x=>x.textContent=money(c.regularPrice));
   const lastDay=c.launchUntil?new Date(Date.parse(c.launchUntil)-1).toLocaleDateString('es-PE',{timeZone:'America/Lima',day:'numeric',month:'long',year:'numeric'}):'';
   document.querySelectorAll('[data-price-note]').forEach(x=>x.textContent=launch?'Ambos precios incluyen IGV · Hasta el '+lastDay:'IGV incluido');
  }
  if(canBuy())$('#purchase-notice').textContent=config?.paymentProvider==='izipay_live'?'Pago seguro con Izipay. El comprobante se emitirá después de confirmar el pago.':config?.paymentProvider==='izipay_test'?'Izipay TEST: usa únicamente tarjetas de prueba. No se realizará ningún cargo real.':'Modo de prueba: el siguiente paso simula el pago.';
  updateMode();metric('visit');
 }).catch(()=>{$('#form-error').textContent='No pudimos cargar las inscripciones. Intenta nuevamente en unos minutos.';});
})();
