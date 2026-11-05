'use strict';
(() => {
 const form = document.querySelector('#book-checkout-form');
 if (!form) return;
 const mobile = matchMedia('(max-width:760px)');
 const steps = [...form.querySelectorAll('[data-step]')];
 const back = form.querySelector('.book-step-back');
 const next = form.querySelector('.book-step-next');
 const submit = form.querySelector('[type=submit]');
 const error = document.querySelector('#book-checkout-error');
 const invoice = document.querySelector('#book-invoice-fields');
 const boleta = document.querySelector('#book-boleta-fields');
 const fields = form.elements;
 let step = 1;

 function drawStep(focus = false) {
  form.dataset.wizard = 'true';
  form.dataset.activeStep = step;
  steps.forEach((section, index) => { section.hidden = index !== step - 1; });
  form.querySelectorAll('[data-progress]').forEach(item => {
   if (Number(item.dataset.progress) === step) item.setAttribute('aria-current', 'step');
   else item.removeAttribute('aria-current');
   item.classList.toggle('completed', Number(item.dataset.progress) < step);
  });
  back.hidden = step === 1;
  next.hidden = step === steps.length;
  submit.hidden = step !== steps.length;
  form.querySelector('.book-checkout-note').hidden = submit.hidden;
  if (focus) {
   form.scrollIntoView({block:'start'});
   steps[step - 1].querySelector('legend,h3').focus({preventScroll:true});
  }
 }
 function selectReceipt() {
  const isInvoice = fields.receipt_type.value === 'factura';
  invoice.hidden = !isInvoice;
  boleta.hidden = isInvoice;
  for (const input of invoice.querySelectorAll('input')) input.disabled = !isInvoice;
  for (const input of boleta.querySelectorAll('input')) input.disabled = isInvoice;
 }
 next.addEventListener('click', () => { step = 2; drawStep(true); });
 back.addEventListener('click', () => { step = 1; drawStep(true); });
 mobile.addEventListener('change', () => drawStep());
 fields.receipt_type.addEventListener('change', selectReceipt);
 selectReceipt();
 drawStep();
 submit.disabled = true;
 next.disabled = true;
 const money=value=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(value);
 async function loadPrice(){
  try{
   const response=await fetch('/api/events/config',{cache:'no-store',headers:{Accept:'application/json'}});
   const cfg=await response.json();
   if(!response.ok)throw Error('No se pudo confirmar el precio vigente.');
   const current=Number(cfg.price),regular=Number(cfg.regularPrice);
   if(!Number.isFinite(current)||current<=0||cfg.paymentMode!=='production'||cfg.bookAvailable!==true)
     throw Error('La compra no está disponible en este momento.');
   form.dataset.price=String(current);
   const price=form.querySelector('.book-price-value'),label=form.querySelector('.book-price-label');
   if(price)price.textContent=money(current);
   const promo=Number.isFinite(regular)&&regular>current;
   if(label)label.textContent=promo?'Precio de lanzamiento':'Precio regular';
   const notice=form.querySelector('.book-launch-notice');if(notice)notice.hidden=!promo;
   const original=form.querySelector('.book-original-price');
   if(original){original.hidden=!promo;if(promo)original.querySelector('.book-regular-value').textContent=money(regular);}
   error.hidden=true;submit.disabled=false;next.disabled=false;
  }catch(err){error.textContent=err.message||'No se pudo comprobar el precio. Recarga la página.';error.hidden=false;submit.disabled=true;next.disabled=true;}
 }
 loadPrice();

 form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  if (step === 1) { step = 2; drawStep(true); return; }
  if (!form.reportValidity()) return;
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Preparando el pago…';
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
  }
 });
})();
