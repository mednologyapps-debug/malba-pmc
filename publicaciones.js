'use strict';
(()=>{
 const form=document.querySelector('#book-checkout-form');if(!form)return;
 const config=JSON.parse(form.dataset.config),byId=id=>document.getElementById(id);
 const sticky=form.closest('.book-purchase'),fit=()=>sticky.style.setProperty('--book-sticky-top',Math.min(108,innerHeight-sticky.offsetHeight-18)+'px');
 if(window.ResizeObserver)new ResizeObserver(fit).observe(sticky);window.addEventListener('resize',fit);fit();
 const money=value=>value==null?'—':new Intl.NumberFormat('es-PE',{style:'currency',currency:config.currency}).format(value);
 const update=()=>{const digital=form.elements.book_format.value==='digital',price=digital?config.digitalPrice:config.physicalPrice,shipping=digital?0:config.physicalShipping;
 byId('book-selected-label').textContent=digital?'Libro digital (PDF)':'Libro físico';byId('book-unit-price').textContent=money(price);byId('book-shipping').textContent=digital?'No aplica':shipping==null?'Se calcula al pagar':money(shipping);byId('book-total').textContent=money(price==null?null:price+(shipping||0));byId('book-total-hint').textContent=!digital&&shipping==null?'Sin envío':'';byId('book-summary-footnote').textContent=digital?'Recibirás las indicaciones de acceso después del pago.':'El costo de envío depende del destino.';byId('book-checkout-error').hidden=true;
 };
 form.querySelectorAll('[name=book_format]').forEach(input=>input.addEventListener('change',update));update();
 form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;const digital=form.elements.book_format.value==='digital',target=digital?config.digitalCheckoutUrl:config.physicalCheckoutUrl,price=digital?config.digitalPrice:config.physicalPrice;
 if(!target||price==null){byId('book-checkout-error').textContent='No pudimos iniciar el pago. Inténtalo de nuevo más tarde.';byId('book-checkout-error').hidden=false;return;}
 let url;try{url=new URL(target);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{byId('book-checkout-error').textContent='No pudimos iniciar el pago. Inténtalo de nuevo más tarde.';byId('book-checkout-error').hidden=false;return;}
 // Contact data travels in a POST body, never a URL or browser storage.
 form.action=url.href;form.querySelector('[type=submit]').disabled=true;form.querySelector('[type=submit]').textContent='Continuando al pago…';HTMLFormElement.prototype.submit.call(form);
 });
})();
