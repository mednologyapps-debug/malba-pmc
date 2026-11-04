'use strict';
(()=>{
 const form=document.querySelector('[data-consult-contact]');if(!form)return;
 form.querySelector('[type=submit]').disabled=false;
 const when=document.querySelector('.consult-when'),small=matchMedia('(max-width:500px)');if(when){when.open=!small.matches;small.addEventListener('change',()=>when.open=!small.matches);}
 document.querySelectorAll('.consult-service').forEach(item=>item.addEventListener('toggle',()=>{if(item.open)document.querySelectorAll('.consult-service').forEach(other=>{if(other!==item)other.open=false;});}));
 document.querySelectorAll('[data-consult-topic]').forEach(link=>link.addEventListener('click',()=>{const topic=link.dataset.consultTopic;const input=form.elements.context;if(!input.value.trim())input.value='Me interesa '+topic.toLowerCase()+'. ';else if(!input.value.includes(topic))input.value+='\nServicio de interés: '+topic+'.';}));
 // Contact requests are delivered via SMTP; WhatsApp remains available in the assistant.
 const submit=form.querySelector('[type=submit]');if(submit)submit.textContent='Enviar consulta por correo';
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const fields=new FormData(form),button=form.querySelector('[type=submit]'),initial=button.textContent;
  const status=document.createElement('p');status.setAttribute('role','status');status.className='consult-submit-status';
  form.querySelector('.consult-submit-status')?.remove();
  button.disabled=true;button.textContent='Enviando…';
  try{
   const r=await fetch('/api/public-contact',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({name:fields.get('name'),email:fields.get('email'),company:fields.get('company'),service:fields.get('service'),message:fields.get('context'),source:'consultoria'})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo enviar.');
   status.textContent=data.message||'Consulta enviada por correo.';form.reset();
  }catch(error){status.textContent=error.message;status.setAttribute('role','alert');}
  finally{button.disabled=false;button.textContent=initial;button.after(status);}
 });
})();
