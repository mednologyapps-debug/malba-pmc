'use strict';
(() => {
 const form = document.querySelector('#book-checkout-form');
 if (!form) return;
 const submit = form.querySelector('[type=submit]');
 const error = document.querySelector('#book-checkout-error');
 const invoice = document.querySelector('#book-invoice-fields');
 const boleta = document.querySelector('#book-boleta-fields');
 const fields = form.elements;
 // The classic checkout is a single continuous form on all screen sizes.
 form.removeAttribute('data-wizard');
 form.removeAttribute('data-active-step');
 form.querySelectorAll('[data-step]').forEach(section=>{ section.hidden=false; });
 form.querySelector('.book-wizard-progress')?.remove();
 form.querySelector('.book-wizard-actions')?.remove();
 submit.hidden=false;
 const note=form.querySelector('.book-checkout-note');
 if(note)note.hidden=false;

 // Keep the real payment action reachable while this long, single-page form is on screen.
 // This button submits the SAME form; it never starts a separate checkout request.
 const floating=document.createElement('button');
 floating.type='button';
 floating.className='book-floating-pay';
 floating.textContent='Continuar al pago seguro';
 floating.setAttribute('aria-label','Continuar al pago seguro');
 floating.hidden=true;
 document.body.append(floating);
 let scheduled=false;
 function updateFloating(){
  scheduled=false;
  const rect=form.getBoundingClientRect(),real=submit.getBoundingClientRect();
  const viewport=window.innerHeight||document.documentElement.clientHeight;
  const formVisible=rect.top<viewport-64&&rect.bottom>96;
  const realVisible=real.top<viewport-50&&real.bottom>55;
  floating.hidden=!formVisible||realVisible;
  floating.disabled=submit.disabled;
  if(!floating.hidden){
   const available=Math.max(0,window.innerWidth-24);
   const w=Math.min(Math.max(rect.width,0),available);
   floating.style.width=w+'px';
   floating.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-12-w))+'px';
  }
 }
 function scheduleFloating(){
  if(scheduled)return;
  scheduled=true;
  window.requestAnimationFrame(updateFloating);
 }
 floating.addEventListener('click',()=>{
  if(submit.disabled)return;
  form.requestSubmit(submit);
 });
 window.addEventListener('scroll',scheduleFloating,{passive:true});
 window.addEventListener('resize',scheduleFloating);
 new MutationObserver(scheduleFloating).observe(submit,{attributes:true,attributeFilter:['disabled'],childList:true});
 scheduleFloating();

 function selectReceipt() {
  const isInvoice = fields.receipt_type.value === 'factura';
  invoice.hidden = !isInvoice;
  boleta.hidden = isInvoice;
  for (const input of invoice.querySelectorAll('input')) input.disabled = !isInvoice;
  for (const input of boleta.querySelectorAll('input')) input.disabled = isInvoice;
 }
 fields.receipt_type.addEventListener('change', selectReceipt);
 selectReceipt();
 submit.disabled = true;
 async function refreshPrice(){
  try{
   const response=await fetch('/api/events/config',{cache:'no-store',headers:{Accept:'application/json'}});
   const cfg=await response.json();
   if(!response.ok||cfg.paymentMode!=='production'||!cfg.bookAvailable||!(Number(cfg.price)>0))throw Error('La compra no está disponible en este momento.');
   form.dataset.price=String(cfg.price);
   const amount=new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'});
   const price=form.querySelector('.book-price-value');if(price)price.textContent=amount.format(Number(cfg.price));
   const promo=Number(cfg.regularPrice)>Number(cfg.price);
   const badge=form.querySelector('.book-launch-notice');if(badge)badge.hidden=!promo;
   const compare=form.querySelector('.book-original-price');if(compare){compare.hidden=!promo;if(promo)compare.querySelector('.book-regular-value').textContent=amount.format(Number(cfg.regularPrice));}
   submit.disabled=false;
   scheduleFloating();
  }catch(e){error.textContent=e.message||'No se pudo comprobar el precio.';error.hidden=false;submit.disabled=true;scheduleFloating();}
 }
 refreshPrice();

 form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  if (!form.reportValidity()) return;
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Preparando el pago…';
  floating.textContent = submit.textContent;
  floating.disabled = true;
  const type = fields.receipt_type.value;
  try {
   const response = await fetch('/api/events/payments/book', {
    method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({
     name:fields.billing_full_name.value, email:fields.billing_email.value, phone:fields.billing_phone.value,
     expectedPrice:Number(form.dataset.price), consent:fields.terms_accepted.checked,
     billing:type === 'factura' ? {type, document:fields.billing_ruc.value, name:fields.billing_company.value, address:fields.billing_address_1.value} : {type, document:fields.billing_dni.value}
    })
   });
   const data = await response.json();
   if (!response.ok) throw Error(data.error || 'No se pudo iniciar el pago.');
   location.assign(data.checkoutUrl);
  } catch (err) {
   error.textContent = err.message;
   error.hidden = false;
   submit.disabled = false;
   submit.textContent = 'Continuar al pago seguro';
   floating.textContent = submit.textContent;
   scheduleFloating();
  }
 });
})();
