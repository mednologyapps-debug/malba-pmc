'use strict';
(async()=>{
 const token=location.hash.slice(1),status=document.querySelector('#confirmation-status'),details=document.querySelector('#confirmation-details'),actions=document.querySelector('.cb-confirm-actions');
 history.replaceState(null,'',location.pathname);
 async function api(body){const response=await fetch('/api/consultations/confirmation',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',referrerPolicy:'no-referrer'});const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo consultar la solicitud.');return data;}
 function drawStatus(value){status.textContent=value==='confirmed'?'Consultoría confirmada. El aviso al cliente está en proceso de envío.':value==='declined'?'La solicitud fue rechazada y el aviso al cliente está en proceso de envío.':'Pendiente de tu confirmación.';actions.hidden=value!=='pending';}
 try{
  if(!/^[a-f0-9-]{36}\.[a-f0-9]{64}$/i.test(token))throw Error('Abre esta página desde el botón del correo de solicitud.');
  const data=await api(),slot=data.consultation_slots;
  const date=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(slot.starts_at));
  const hour=value=>new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit'}).format(new Date(value));
  for(const [name,value] of [['Cliente',data.name],['Correo',data.email],['Empresa',data.company],['Servicio',data.service],['Fecha',date],['Horario',hour(slot.starts_at)+' – '+hour(slot.ends_at)+' (Perú)'],['Consulta',data.message]]){
   if(!value)continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;details.append(dt,dd);
  }
  drawStatus(data.status);
  actions.querySelectorAll('button').forEach(button=>button.addEventListener('click',async()=>{
   actions.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Guardando tu respuesta…';
   try{drawStatus((await api({status:button.dataset.decision})).status);}catch(error){status.textContent=error.message;}
   finally{actions.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }));
 }catch(error){status.textContent=error.message;actions.hidden=true;}
})();
