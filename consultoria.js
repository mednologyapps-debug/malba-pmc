'use strict';
(()=>{
 const form=document.querySelector('[data-consult-contact]');if(!form)return;
 form.querySelector('[type=submit]').disabled=false;
 const when=document.querySelector('.consult-when'),small=matchMedia('(max-width:500px)');if(when){when.open=!small.matches;small.addEventListener('change',()=>when.open=!small.matches);}
 document.querySelectorAll('.consult-service').forEach(item=>item.addEventListener('toggle',()=>{if(item.open)document.querySelectorAll('.consult-service').forEach(other=>{if(other!==item)other.open=false;});}));
 document.querySelectorAll('[data-consult-topic]').forEach(link=>link.addEventListener('click',()=>{const topic=link.dataset.consultTopic;const input=form.elements.context;if(!input.value.trim())input.value='Me interesa '+topic.toLowerCase()+'. ';else if(!input.value.includes(topic))input.value+='\nServicio de interés: '+topic+'.';}));
 // Build a draft only. WhatsApp still requires the visitor to press Send.
 form.addEventListener('submit',event=>{event.preventDefault();for(const input of form.querySelectorAll('[required]')){if(!input.value.trim()){input.setCustomValidity('Completa este campo.');input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});}}if(!form.reportValidity())return;
 const fields=new FormData(form),target=new URL(form.dataset.contactUrl);if(target.protocol!=='https:'||target.hostname!=='wa.me')return;
 const text=[form.dataset.contactGreeting||'Hola, MALBA PMC. Quisiera conversar sobre una consultoría.','Especialidad: '+fields.get('service'),'Nombre: '+fields.get('name').trim(),fields.get('company').trim()?'Empresa: '+fields.get('company').trim():'','Correo: '+fields.get('email').trim(),'Contexto: '+fields.get('context').trim()].filter(Boolean).join('\n');target.searchParams.set('text',text);
 const popup=window.open(target.href,'_blank');if(popup)popup.opener=null;else window.location.assign(target.href);
 });
})();
