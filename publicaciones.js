'use strict';
(()=>{
 const form=document.querySelector('#book-checkout-form');if(!form)return;
 const config=JSON.parse(form.dataset.config),byId=id=>document.getElementById(id),mobile=matchMedia('(max-width:760px)');
 const sticky=form.closest('.book-purchase'),fit=()=>sticky.style.setProperty('--book-sticky-top',Math.min(108,innerHeight-sticky.offsetHeight-18)+'px');
 if(window.ResizeObserver)new ResizeObserver(fit).observe(sticky);window.addEventListener('resize',fit);fit();
 const money=value=>value==null?'—':new Intl.NumberFormat('es-PE',{style:'currency',currency:config.currency}).format(value);
 const steps=[...form.querySelectorAll('[data-step]')],back=form.querySelector('.book-step-back'),next=form.querySelector('.book-step-next'),submit=form.querySelector('[type=submit]');let step=1;
 const drawStep=(focus=false)=>{form.dataset.wizard=String(mobile.matches);form.dataset.activeStep=step;steps.forEach(section=>section.hidden=mobile.matches&&Number(section.dataset.step)!==step);form.querySelectorAll('[data-progress]').forEach(item=>{if(Number(item.dataset.progress)===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');item.classList.toggle('completed',Number(item.dataset.progress)<step);});back.hidden=step===1;next.hidden=step===3;submit.hidden=mobile.matches&&step!==3;form.querySelector('.book-checkout-note').hidden=mobile.matches&&step!==3;byId('book-checkout-error').hidden=true;if(focus&&mobile.matches){form.scrollIntoView({block:'start',behavior:'auto'});steps[step-1].querySelector('legend,h3').focus({preventScroll:true});}fit();};
 const validStep=n=>{for(const input of steps[n-1].querySelectorAll('input,select'))if(!input.disabled&&!input.checkValidity()){input.reportValidity();return false;}return true;};
 next.addEventListener('click',()=>{if(validStep(step)){step++;drawStep(true);}});back.addEventListener('click',()=>{step=Math.max(1,step-1);drawStep(true);});mobile.addEventListener('change',()=>drawStep());drawStep();
 const receipt=()=>{const invoice=form.elements.receipt_type.value==='factura';byId('book-invoice-fields').hidden=!invoice;byId('book-boleta-fields').hidden=invoice;byId('book-invoice-fields').querySelectorAll('input').forEach(input=>input.disabled=!invoice);byId('book-boleta-fields').querySelectorAll('input').forEach(input=>input.disabled=invoice);fit();};form.elements.receipt_type.addEventListener('change',receipt);receipt();
 const update=()=>{const digital=form.elements.book_format.value==='digital',price=digital?config.digitalPrice:config.physicalPrice,shipping=digital?0:config.physicalShipping;
 byId('book-selected-label').textContent=digital?'Libro digital (PDF)':'Libro físico';byId('book-unit-price').textContent=money(price);byId('book-shipping').textContent=digital?'No aplica':shipping==null?'Se calcula al pagar':money(shipping);byId('book-total').textContent=money(price==null?null:price+(shipping||0));byId('book-total-hint').textContent=!digital&&shipping==null?'Sin envío':'';byId('book-summary-footnote').textContent=digital?'Recibirás las indicaciones de acceso después del pago.':shipping==null?'El costo de envío depende del destino.':'El importe incluye el envío configurado.';byId('book-checkout-error').hidden=true;
 };
 form.querySelectorAll('[name=book_format]').forEach(input=>input.addEventListener('change',update));update();
 form.addEventListener('submit',event=>{event.preventDefault();if(mobile.matches&&step<3){if(validStep(step)){step++;drawStep(true);}return;}for(let n=1;n<=3;n++)if(!validStep(n)){if(mobile.matches){step=n;drawStep();}return;}
 const digital=form.elements.book_format.value==='digital',target=digital?config.digitalCheckoutUrl:config.physicalCheckoutUrl,price=digital?config.digitalPrice:config.physicalPrice;
 if(!target||price==null){byId('book-checkout-error').textContent='No pudimos iniciar el pago. Inténtalo de nuevo más tarde.';byId('book-checkout-error').hidden=false;return;}
 let url;try{url=new URL(target);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{byId('book-checkout-error').textContent='No pudimos iniciar el pago. Inténtalo de nuevo más tarde.';byId('book-checkout-error').hidden=false;return;}
 // Contact and receipt data travel in a POST body, never a URL or browser storage.
 form.action=url.href;submit.disabled=true;submit.textContent='Continuando al pago…';HTMLFormElement.prototype.submit.call(form);
 });
})();
