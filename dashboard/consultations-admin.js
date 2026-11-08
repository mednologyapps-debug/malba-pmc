'use strict';
async function renderConsultationAgenda(){
 const editor=document.querySelector('#editor');editor.replaceChildren();
 document.querySelector('#page-title').textContent='Agenda de consultorías';
 document.querySelector('#page-description').textContent='Bloquea o libera horarios y responde las solicitudes de tus clientes.';
 document.querySelector('.actions').hidden=true;document.querySelector('.status-row').hidden=true;
 const intro=el('p',{class:'notice',text:'Todos los días tienen sesiones de 60 minutos disponibles por defecto. Bloquea los horarios en que Miguel no puede atender. Las solicitudes quedan pendientes de confirmación. Hora de Perú (UTC−5).'});
 const settingsForm=el('form',{class:'cms-settings-form cb-admin-settings'}),email=el('input',{type:'email',required:'',maxlength:'254',autocomplete:'email','aria-label':'Correo de Miguel para consultorías'}),save=el('button',{type:'submit',class:'button primary',text:'Guardar agenda',disabled:''}),settingsStatus=el('p',{role:'status'});
 let settingsRevision,settingsReady=false;
 settingsForm.append(el('h2',{text:'Disponibilidad y avisos'}),el('label',{text:'Correo de Miguel para recibir y confirmar solicitudes'},[email]),save,settingsStatus);
 const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),get=type=>dateParts.find(p=>p.type===type).value;
 const today=get('year')+'-'+get('month')+'-'+get('day');
 const day=el('input',{type:'date',value:today,'aria-label':'Día de la agenda'}),list=el('div',{class:'cb-admin-slots'}),listStatus=el('p',{role:'status'}),mailStatus=el('p',{class:'field-hint'}),refresh=el('button',{type:'button',class:'button secondary',text:'Actualizar agenda'});
 editor.append(intro,settingsForm,el('div',{class:'cb-admin-row'},[el('label',{class:'cb-admin-month',text:'Ver día'},[day]),refresh]),listStatus,mailStatus,list);
 const endpoint='/api/consultations/admin/';
 function stillHere(){return editor.contains(settingsForm);}
 try{const current=await request(endpoint+'settings');if(!stillHere())return;settingsRevision=current.revision;email.value=current.consultant_email;settingsReady=true;save.disabled=false;settingsStatus.textContent=!current.consultant_email?'Indica el correo de Miguel para enviarle los avisos de las reservas.':current.mailConfigured?'':'Configura SMTP en Hostinger para enviar los avisos.';}catch(error){settingsStatus.textContent=error.message;}
 settingsForm.addEventListener('submit',async event=>{
  event.preventDefault();if(!settingsReady)return;save.disabled=true;settingsStatus.textContent='Guardando…';
  try{const result=await request(endpoint+'settings',{consultant_email:email.value,enabled:true,revision:settingsRevision});settingsRevision=result.revision;settingsStatus.textContent='Agenda actualizada.';}
  catch(error){settingsStatus.textContent=error.message;}finally{save.disabled=false;}
 });
 async function loadSlots(){
  const selectedDay=day.value;listStatus.textContent='Consultando agenda…';list.replaceChildren();
  try{
   const data=await request(endpoint+'slots?month='+encodeURIComponent(selectedDay.slice(0,7))+'&date='+encodeURIComponent(selectedDay));if(!stillHere()||day.value!==selectedDay)return;
   listStatus.textContent=data.slots.length?'Horarios y solicitudes del día':'No hay horarios futuros para esta fecha.';
   for(const slot of data.slots){
    const start=new Date(slot.starts_at),end=new Date(slot.ends_at),date=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',day:'numeric',month:'long'}).format(start),time=value=>new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit'}).format(value);
    const booking=slot.consultation_bookings.find(b=>b.status==='pending'||b.status==='confirmed');
    const state=booking?.status==='pending'?'Pendiente':booking?.status==='confirmed'?'Confirmada':slot.enabled?'Disponible':'Bloqueado';
    const card=el('article',{class:'cb-admin-slot'}),actions=el('div',{class:'cb-confirm-actions'});
    card.append(el('h3',{text:date+' · '+time(start)+' – '+time(end)},[el('span',{class:'cb-admin-badge',text:state})]));
    if(booking){
     card.append(el('strong',{text:booking.name}),el('p',{text:booking.email+(booking.company?' · '+booking.company:'')}),el('p',{text:booking.service}),el('p',{text:booking.message}));
     for(const [label,status] of booking.status==='pending'?[['Confirmar','confirmed'],['Rechazar horario','declined']]:[['Cancelar reserva','declined']]){
      const button=el('button',{type:'button',class:'button '+(status==='confirmed'?'primary':'secondary'),text:label});button.disabled=start<=Date.now();
      button.addEventListener('click',async()=>{actions.querySelectorAll('button').forEach(b=>b.disabled=true);try{await request(endpoint+'decision',{id:booking.id,status});await loadSlots();}catch(error){listStatus.textContent=error.message;actions.querySelectorAll('button').forEach(b=>b.disabled=false);}});actions.append(button);
     }
    }else if(start>Date.now()){
     const toggle=el('button',{type:'button',class:'button secondary',text:slot.enabled?'Bloquear horario':'Liberar horario'});
     toggle.addEventListener('click',async()=>{toggle.disabled=true;try{await request(endpoint+'slot',{id:slot.id,enabled:!slot.enabled});await loadSlots();}catch(error){listStatus.textContent=error.message;toggle.disabled=false;}});actions.append(toggle);
    }
    card.append(actions);list.append(card);
   }
   const notices=await request(endpoint+'mail');if(stillHere())mailStatus.textContent=notices.awaitingRecipient?'Configura el correo de Miguel para enviarle '+notices.awaitingRecipient+' solicitudes pendientes.':notices.failed||notices.sending?'Avisos por revisar: '+notices.failed+' fallidos, '+notices.sending+' en envío.':'Sin avisos de correo pendientes de revisión.';
  }catch(error){if(stillHere())listStatus.textContent=error.message;}
 }
 day.addEventListener('change',()=>void loadSlots());refresh.addEventListener('click',()=>void loadSlots());await loadSlots();
}
