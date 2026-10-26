'use strict';
(async()=>{
  if(document.querySelector('[data-malba-whatsapp]'))return;
  let settings={whatsappEnabled:true,whatsappNumber:'51999999999',whatsappMessage:'Hola, deseo recibir información sobre los servicios de MALBA PMC.'};
  try{
    const response=await fetch('/api/public-settings',{headers:{Accept:'application/json'}});
    if(response.ok)settings={...settings,...await response.json()};
  }catch(_){/* El acceso sigue disponible con la configuración de respaldo. */}
  const digits=String(settings.whatsappNumber||'').replace(/\D/g,'');
  if(!settings.whatsappEnabled||!/^[0-9]{9,15}$/.test(digits))return;
  const link=document.createElement('a');
  link.className='floating-whatsapp';link.dataset.malbaWhatsapp='';link.href='https://wa.me/'+digits+'?text='+encodeURIComponent(settings.whatsappMessage||'');link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Contactar a MALBA PMC por WhatsApp');
  link.innerHTML='<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16.04 2.67A13.25 13.25 0 0 0 4.58 22.56L2.8 29.06l6.65-1.74A13.23 13.23 0 1 0 16.04 2.67Zm0 2.24a10.99 10.99 0 0 1 9.53 16.48 11 11 0 0 1-15.76 3.75l-.48-.29-3.95 1.04 1.05-3.85-.31-.5A11 11 0 0 1 16.04 4.91Zm-3.37 5.1c-.21 0-.55.08-.84.4-.29.32-1.1 1.08-1.1 2.63s1.13 3.05 1.29 3.26c.16.21 2.22 3.39 5.38 4.75 2.65 1.14 3.19.92 3.77.86.58-.05 1.87-.76 2.13-1.5.26-.74.26-1.37.18-1.5-.08-.13-.29-.21-.61-.37-.32-.16-1.87-.92-2.16-1.03-.29-.11-.5-.16-.71.16-.21.32-.82 1.03-1 1.24-.18.21-.37.24-.68.08-.32-.16-1.34-.49-2.55-1.58-.94-.84-1.58-1.88-1.76-2.2-.18-.32-.02-.49.14-.65.14-.14.32-.37.47-.55.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.25-.62-.51-.53-.71-.54h-.6Z"/></svg><span>WhatsApp</span>';
  document.body.append(link);
})();
