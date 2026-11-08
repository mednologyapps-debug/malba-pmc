'use strict';
async function renderConsultationAgenda(){
 const editor=document.querySelector('#editor');editor.replaceChildren();
 document.querySelector('#page-title').textContent='Agenda de consultorías';
 document.querySelector('#page-description').textContent='Publica la disponibilidad de Miguel y responde las solicitudes de tus clientes.';
 document.querySelector('.actions').hidden=true;document.querySelector('.status-row').hidden=true;
 const intro=el('p',{class:'notice',text:'Los horarios usan la hora de Perú (UTC−5). Cada solicitud aparta su horario hasta que MALBA confirme o rechace la reserva. El enlace de reunión se envía por separado.'});
 const settingsForm=el('form',{class:'cms-settings-form cb-admin-settings'}),email=el('input',{type:'email',required:'',maxlength:'254',autocomplete:'email','aria-label':'Correo de Miguel para consultorías'}),enabled=el('input',{type:'checkbox'}),save=el('button',{type:'submit',class:'button primary',text:'Guardar agenda',disabled:''}),settingsStatus=el('p',{role:'status'});
 let settingsRevision,settingsReady=false;
 settingsForm.append(el('h2',{text:'Disponibilidad y avisos'}),el('label',{text:'Correo de Miguel para recibir y confirmar solicitudes'},[email]),el('label',{class:'lms-check-row'},[enabled,el('span',{text:'Activar la agenda pública'})]),save,settingsStatus);
 const addForm=el('form',{class:'cms-settings-form'}),day=el('input',{type:'date',required:'','aria-label':'Fecha de disponibilidad'}),from=el('input',{type:'time',required:'',value:'09:00','aria-label':'Hora inicial'}),to=el('input',{type:'time',required:'',value:'12:00','aria-label':'Hora final'}),duration=el('select',{'aria-label':'Duración de cada sesión'});
 for(const minutes of [30,45,60,90,120]){const option=el('option',{value:minutes,text:minutes+' minutos'});option.selected=minutes===60;duration.append(option);}
 const add=el('button',{type:'submit',class:'button primary',text:'Publicar horarios',disabled:''}),addStatus=el('p',{role:'status'});
 addForm.append(el('h2',{text:'Publicar disponibilidad'}),el('p',{class:'field-hint',text:'Se crearán sesiones consecutivas dentro del rango que elijas. Solo se publican al presionar el botón.'}),el('div',{class:'cb-admin-row'},[el('label',{text:'Fecha'},[day]),el('label',{text:'Desde'},[from]),el('label',{text:'Hasta'},[to]),el('label',{text:'Duración de cada sesión'},[duration])]),add,addStatus);
 const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),get=type=>dateParts.find(p=>p.type===type).value;
 const today=get('year')+'-'+get('month')+'-'+get('day');day.min=today;
 const month=el('input',{type:'month',value:today.slice(0,7),'aria-label':'Mes de la agenda'}),list=el('div',{class:'cb-admin-slots'}),listStatus=el('p',{role:'status'}),mailStatus=el('p',{class:'field-hint'}),refresh=el('button',{type:'button',class:'button secondary',text:'Actualizar agenda'});
 editor.append(intro,settingsForm,addForm,el('div',{class:'cb-admin-row'},[el('label',{class:'cb-admin-month',text:'Ver mes'},[month]),refresh]),listStatus,mailStatus,list);
 const endpoint='/api/consultations/admin/';
 function stillHere(){return editor.contains(settingsForm);}
 try{const current=await request(endpoint+'settings');if(!stillHere())return;settingsRevision=current.revision;email.value=current.consultant_email;enabled.checked=current.enabled;settingsReady=true;save.disabled=false;add.disabled=!current.enabled||!current.consultant_email;settingsStatus.textContent=current.mailConfigured?'':'Configura SMTP en Hostinger antes de activar la agenda.';}catch(error){settingsStatus.textContent=error.message;}
 settingsForm.addEventListener('submit',async event=>{
  event.preventDefault();if(!settingsReady)return;save.disabled=true;settingsStatus.textContent='Guardando…';
  try{const result=await request(endpoint+'settings',{consultant_email:email.value,enabled:enabled.checked,revision:settingsRevision});settingsRevision=result.revision;settingsStatus.textContent='Agenda actualizada.';add.disabled=!enabled.checked;}
  catch(error){settingsStatus.textContent=error.message;}finally{save.disabled=false;}
 });
 addForm.addEventListener('submit',async event=>{
  event.preventDefault();if(add.disabled)return;
  const start=Date.parse(day.value+'T'+from.value+':00-05:00'),end=Date.parse(day.value+'T'+to.value+':00-05:00'),minutes=Number(duration.value);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>16*3600000){addStatus.textContent='Revisa la fecha y el rango horario.';return;}
  const slots=[];for(let time=start;time+minutes*60000<=end;time+=minutes*60000)slots.push({starts_at:new Date(time).toISOString(),ends_at:new Date(time+minutes*60000).toISOString()});
  if(!slots.length||slots.length>32){addStatus.textContent='El rango debe contener entre 1 y 32 sesiones completas.';return;}
  add.disabled=true;addStatus.textContent='Publicando…';
  try{const result=await request(endpoint+'slots',{slots});addStatus.textContent=result.count+' horarios publicados.';month.value=day.value.slice(0,7);await loadSlots();}
  catch(error){addStatus.textContent=error.message;}finally{add.disabled=!enabled.checked;}
 });
 async function loadSlots(){
  const selectedMonth=month.value;listStatus.textContent='Consultando agenda…';list.replaceChildren();
  try{
   const data=await request(endpoint+'slots?month='+encodeURIComponent(selectedMonth));if(!stillHere()||month.value!==selectedMonth)return;
   listStatus.textContent=data.slots.length?'Horarios y solicitudes de este mes':'Todavía no has publicado horarios para este mes.';
   for(const slot of data.slots){
    const start=new Date(slot.starts_at),end=new Date(slot.ends_at),date=new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',weekday:'long',day:'numeric',month:'long'}).format(start),time=value=>new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'numeric',minute:'2-digit'}).format(value);
    const booking=slot.consultation_bookings.find(b=>b.status==='pending'||b.status==='confirmed');
    const state=booking?.status==='pending'?'Pendiente':booking?.status==='confirmed'?'Confirmada':slot.enabled?'Disponible':'Oculto';
    const card=el('article',{class:'cb-admin-slot'}),actions=el('div',{class:'cb-confirm-actions'});
    card.append(el('h3',{text:date+' · '+time(start)+' – '+time(end)},[el('span',{class:'cb-admin-badge',text:state})]));
    if(booking){
     card.append(el('strong',{text:booking.name}),el('p',{text:booking.email+(booking.company?' · '+booking.company:'')}),el('p',{text:booking.service}),el('p',{text:booking.message}));
     for(const [label,status] of booking.status==='pending'?[['Confirmar','confirmed'],['Rechazar horario','declined']]:[['Cancelar reserva','declined']]){
      const button=el('button',{type:'button',class:'button '+(status==='confirmed'?'primary':'secondary'),text:label});button.disabled=start<=Date.now();
      button.addEventListener('click',async()=>{actions.querySelectorAll('button').forEach(b=>b.disabled=true);try{await request(endpoint+'decision',{id:booking.id,status});await loadSlots();}catch(error){listStatus.textContent=error.message;actions.querySelectorAll('button').forEach(b=>b.disabled=false);}});actions.append(button);
     }
    }else if(slot.enabled&&start>Date.now()){
     const hide=el('button',{type:'button',class:'button secondary',text:'Ocultar horario'});hide.addEventListener('click',async()=>{hide.disabled=true;try{await request(endpoint+'slot',{id:slot.id});await loadSlots();}catch(error){listStatus.textContent=error.message;hide.disabled=false;}});actions.append(hide);
    }
    card.append(actions);list.append(card);
   }
   const notices=await request(endpoint+'mail');if(stillHere())mailStatus.textContent=notices.failed||notices.sending?'Avisos por revisar: '+notices.failed+' fallidos, '+notices.sending+' en envío.':'Sin avisos de correo pendientes de revisión.';
  }catch(error){if(stillHere())listStatus.textContent=error.message;}
 }
 month.addEventListener('change',()=>void loadSlots());refresh.addEventListener('click',()=>void loadSlots());await loadSlots();
}
