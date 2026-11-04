'use strict';
(()=>{
 const $=s=>document.querySelector(s),dialog=$('#registration'),form=$('#registration-form'),submit=$('#submit-registration');
 const notice='La inscripción al evento está sujeta al aforo disponible y no garantiza el ingreso. Recomendamos llegar con anticipación y seguir las indicaciones de la organización. La adquisición del libro no otorga prioridad ni garantiza el acceso al evento.';
 document.querySelectorAll('.capacity-copy').forEach(x=>x.textContent=notice);
 const utm={};for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']){const v=new URLSearchParams(location.search).get(key);if(v)utm[key]=v.slice(0,100);}
 let config=null,mode='free',busy=false,lastTrigger=null,paymentToken=null;
 const money=n=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(n);
 function metric(event){fetch('/api/events/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,source:utm.utm_source||''}),keepalive:true}).catch(()=>{});}
 async function api(path,body){const r=await fetch(path,{method:body?'POST':'GET',headers:{'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});if(!r.headers.get('content-type')?.includes('application/json'))throw Error('El servicio de inscripción no está disponible. Intenta más tarde.');const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo completar la solicitud.');return data;}
 const canBuy=()=>config?.bookAvailable&&config?.priceConfirmed&&config?.price>0&&config?.paymentMode==='sandbox'&&config?.deliveries?.length;
 function updateMode(){
  $('#purchase-fields').hidden=mode!=='book';$('#delivery').required=mode==='book'&&!!canBuy();
  document.querySelectorAll('.mode-switch button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  $('#flow-label').textContent=mode==='book'?'Inscripción + libro':'Inscripción gratuita';
  $('#form-title').textContent=mode==='book'?'El conocimiento, contigo.':'Nos encantará verte.';
  $('#form-intro').textContent=mode==='book'?'Completa tus datos una sola vez para registrar tu participación y preparar tu pedido.':'Completa tus datos para registrar tu interés en participar.';
  const open=!!config?.registrationOpen;
  submit.disabled=!open||mode==='book'&&!canBuy();submit.textContent=!open?'Inscripciones próximamente':mode==='book'?'Registrar y continuar a prueba de pago':'Enviar inscripción gratuita';
  $('#form-error').textContent=!open?'Las inscripciones todavía no están abiertas. La organización confirmará los detalles del evento.':mode==='book'&&!canBuy()?'La compra aún no está habilitada. Puedes cambiar a «Solo evento» para inscribirte.':'';
 }
 function setMode(value,trigger){if(busy)return;mode=value;updateMode();if(!dialog.open){lastTrigger=trigger;$('#form-content').hidden=false;$('#result').hidden=true;dialog.showModal();metric(value==='book'?'click_book':'click_free');}}
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode,b)));
 $('#registration .close').addEventListener('click',()=>{if(!busy)dialog.close();});dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>lastTrigger?.focus());
 function showResult(title,copy){$('#form-content').hidden=true;const section=$('#result');section.replaceChildren();section.hidden=false;const mark=document.createElement('span');mark.className='success-mark';mark.textContent='✓';mark.setAttribute('aria-hidden','true');const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=copy;const capacity=document.createElement('p');capacity.className='form-capacity';capacity.textContent=notice;section.append(mark,h,p,capacity);section.focus();dialog.scrollTop=0;return section;}
 function addButton(container,label,handler){const b=document.createElement('button');b.type='button';b.className='solid-button';b.textContent=label;b.addEventListener('click',handler);container.append(b);return b;}
 function paymentView(){
  const section=showResult('Tu inscripción está registrada.','El pedido queda pendiente. Estás en una simulación: no ingreses datos de tarjeta y no se realizará ningún cobro.');
  const total=document.createElement('p');total.textContent='Libro físico · '+money(config.price)+' · '+$('#delivery').value;section.append(total);const actions=document.createElement('div');actions.className='payment-actions';section.append(actions);
  for(const [outcome,label]of [['success','Simular pago aprobado'],['failed','Simular pago fallido'],['pending','Simular pago pendiente']])addButton(actions,label,async()=>{if(busy)return;busy=true;actions.querySelectorAll('button').forEach(b=>b.disabled=true);try{const r=await api('/api/events/simulate',{token:paymentToken,outcome});const view=showResult(r.status==='simulated_paid'?'Prueba completada.':r.status==='failed'?'El pago de prueba falló.':'Pago de prueba pendiente.',r.message);if(r.status!=='simulated_paid')addButton(view,'Reintentar pago de prueba',paymentView);addButton(view,'Cerrar',()=>dialog.close());}catch(e){const p=document.createElement('p');p.textContent=e.message;actions.after(p);actions.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{busy=false;}});
 }
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy||!form.reportValidity())return;if(!config?.registrationOpen||mode==='book'&&!canBuy())return;busy=true;submit.disabled=true;submit.textContent='Registrando…';$('#form-error').textContent='';const f=new FormData(form);try{
  const data=await api('/api/events/register',{...Object.fromEntries(f),mode,consent:f.has('consent'),capacity:f.has('capacity'),utm});
  if(data.duplicate){const s=showResult('Revisemos tu inscripción.',data.message);addButton(s,'Cerrar',()=>dialog.close());}
  else if(data.orderId){paymentToken=data.paymentToken;paymentView();}
  else{const s=showResult(data.status==='waitlist'?'Estás en lista de espera.':'Recibimos tu inscripción.',data.status==='waitlist'?'Registramos tu solicitud en lista de espera. La organización te informará sobre la disponibilidad.':data.emailSent?'Registramos tu participación. Revisa tu correo para ver los detalles y el aviso de aforo.':'Tu registro está guardado. El correo de confirmación está en proceso de envío.');addButton(s,'Listo, cerrar',()=>dialog.close());form.reset();}
 }catch(err){$('#form-error').textContent=err.message;$('#form-error').scrollIntoView({block:'nearest'});}finally{busy=false;updateMode();}});
 api('/api/events/config').then(c=>{config=c;document.querySelectorAll('a[data-privacy]').forEach(a=>{if(c.privacyUrl){a.href=c.privacyUrl;a.removeAttribute('aria-disabled');}else{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.title='La organización confirmará la política antes de abrir inscripciones.';}});if(c.date){const date=new Date(c.date);$('#event-date').textContent=date.toLocaleString('es-PE',{timeZone:'America/Lima',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})+' · Perú';}if(c.location)$('#event-location').textContent=c.location;
  $('#availability').textContent=c.registrationOpen?'Inscripciones abiertas'+(c.waitlist?' · Lista de espera habilitada':''):'Próximamente: confirmaremos fecha, sede e inscripciones.';
  if(c.priceConfirmed&&c.price>0){$('#order-price').textContent=money(c.price);$('#order-total').textContent=money(c.price);$('#book-choice-note').textContent='Tu ejemplar físico · '+money(c.price);}
  for(const d of c.deliveries||[]){const o=document.createElement('option');o.value=d;o.textContent=d;$('#delivery').append(o);}
  if(canBuy())$('#purchase-notice').textContent='Modo de prueba: el siguiente paso simula el pago. No ingreses datos de tarjeta. No se realizará ningún cobro.';
  updateMode();metric('visit');
 }).catch(()=>{$('#availability').textContent='No pudimos cargar las inscripciones. Intenta nuevamente en unos minutos.';});
})();
