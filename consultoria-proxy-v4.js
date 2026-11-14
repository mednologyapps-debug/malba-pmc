'use strict';
(() => {
 const form = document.querySelector('[data-consult-contact]');
 if (form) {
  setupBooking(form);
  return;
 }
 const triggers = [...document.querySelectorAll('[data-open-consultation]')];
 let loading = false;
 async function openSharedBooking(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const opener = event.currentTarget;
  event.preventDefault();
  if (loading) return;
  loading = true;
  opener.setAttribute('aria-busy', 'true');
  try {
   const response = await fetch(opener.href);
   if (!response.ok) throw Error('Agenda no disponible');
   const page = new DOMParser().parseFromString(await response.text(), 'text/html');
   const booking = page.querySelector('[data-consult-contact]');
   if (!booking) throw Error('Agenda no disponible');
   const host = document.createElement('div');
   host.hidden = true;
   host.append(booking);
   document.body.append(host);
   setupBooking(booking, opener);
   triggers.forEach(link => link.removeEventListener('click', openSharedBooking));
  } catch {
   location.assign(opener.href);
  } finally {
   loading = false;
   opener.removeAttribute('aria-busy');
  }
 }
 triggers.forEach(link => link.addEventListener('click', openSharedBooking));
})();

function setupBooking(form, initialOpener) {
 const when = document.querySelector('.consult-when'), small = matchMedia('(max-width:500px)');
 if (when) { when.open = !small.matches; small.addEventListener('change', () => { when.open = !small.matches; }); }
 document.querySelectorAll('.consult-service').forEach(item => item.addEventListener('toggle', () => {
  if (item.open) document.querySelectorAll('.consult-service').forEach(other => { if (other !== item) other.open = false; });
 }));
 const dateKey = value => {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const get = type => parts.find(p => p.type === type).value;
  return get('year') + '-' + get('month') + '-' + get('day');
 };
 const time = value => new Intl.DateTimeFormat('es-PE', {timeZone:'America/Lima',hour:'numeric',minute:'2-digit'}).format(new Date(value));
 const fullDate = value => new Intl.DateTimeFormat('es-PE', {timeZone:'America/Lima',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(value));
 const today = dateKey(Date.now()), firstMonth = today.slice(0,7);
 let month = firstMonth, slots = [], selectedDay = '', selectedSlot, loading = false, generation = 0, requestId = crypto.randomUUID();
 const root = document.createElement('div');
 root.className = 'cb-booking';
 root.innerHTML = '<div class="cb-calendar-pane"><div class="cb-person"><img src="/assets/people/miguel-alba.webp" alt="Miguel Alba" width="52" height="52"><div><strong>Miguel Alba</strong><span>Sesiones de 60 min · Hora de Perú (UTC−5)</span></div></div><div class="cb-month-nav"><button type="button" data-month="-1" aria-label="Mes anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><h3 aria-live="polite"></h3><button type="button" data-month="1" aria-label="Mes siguiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button></div><div class="cb-weekdays" aria-hidden="true"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div><div class="cb-days" role="group" aria-label="Selecciona un día disponible"></div></div><div class="cb-times-pane"><h3 data-day-title>Horarios disponibles</h3><p data-availability role="status">Consultando la agenda…</p><div class="cb-times" role="group" aria-label="Horarios de consultoría"></div></div>';
 form.before(root);
 form.classList.add('cb-details');
 form.hidden = true;
 const intro = root.parentElement.firstElementChild;
 if (intro && intro !== root) {
  intro.classList.add('cb-intro');
  const title = intro.querySelector('h2');
  if (title) title.textContent = 'Reserva una consultoría con Miguel Alba';
  const description = intro.querySelector('p');
  if (description) description.textContent = 'Elige una fecha y hora disponible y cuéntanos sobre tu proyecto. Te avisaremos por correo cuando MALBA PMC confirme tu solicitud.';
  const steps = intro.querySelector('ol');
  if (steps) steps.hidden = true;
 }
 root.parentElement.classList.add('cb-contact-layout');
 const detailsTitle = form.querySelector('h3');
 detailsTitle.textContent = 'Completa tus datos';
 detailsTitle.tabIndex = -1;
 const appointment = document.createElement('p');
 appointment.className = 'cb-appointment';
 detailsTitle.after(appointment);
 const submit = form.querySelector('[type=submit]');
 submit.textContent = 'Solicitar reserva de consultoría';
 form.elements.name.minLength = 3;
 form.elements.context.minLength = 10;
 const note = form.querySelector('.consult-form-note');
 note.textContent = 'Recibirás un correo con tu solicitud. La cita se confirma cuando MALBA PMC la apruebe. El correo de confirmación incluirá el enlace de la sesión.';
 const consent = document.createElement('label');
 consent.className = 'cb-consent';
 consent.innerHTML = '<input type="checkbox" name="booking_consent" required><span>He leído la <a href="/consultoria/privacidad/" target="_blank" rel="noopener">política de privacidad</a> y autorizo el uso de mis datos para gestionar esta consultoría.</span>';
 submit.before(consent);
 const honeypot = document.createElement('input');
 Object.assign(honeypot, {type:'text',name:'website',tabIndex:-1,autocomplete:'off'});
 honeypot.className = 'cb-honeypot';honeypot.setAttribute('aria-hidden','true');form.append(honeypot);
 const status = document.createElement('p');
 status.className = 'cb-form-status';status.setAttribute('role','status');submit.after(status);
 const calendar = root.querySelector('.cb-days'), times = root.querySelector('.cb-times'), availability = root.querySelector('[data-availability]');
 const monthLabel = root.querySelector('.cb-month-nav h3');
 const navigation = [...root.querySelectorAll('[data-month]')];
 document.querySelectorAll('[data-consult-topic]').forEach(link => link.addEventListener('click', () => {
  const input = form.elements.context, topic = link.dataset.consultTopic;
  if (!input.value.trim()) input.value = 'Me interesa ' + topic.toLowerCase() + '. ';
 }));
 function drawDays() {
  const [year, number] = month.split('-').map(Number);
  monthLabel.textContent = new Intl.DateTimeFormat('es-PE',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(Date.UTC(year, number-1, 1)));
  calendar.replaceChildren();
  const offset = (new Date(Date.UTC(year,number-1,1)).getUTCDay()+6)%7;
  const count = new Date(Date.UTC(year,number,0)).getUTCDate();
  const availableDates = new Set(slots.map(slot => dateKey(slot.starts_at)));
  for (let i=0;i<offset;i++) calendar.append(document.createElement('span'));
  for (let day=1;day<=count;day++) {
   const key = month + '-' + String(day).padStart(2,'0');
   const button = document.createElement('button');
   button.type='button';button.textContent=day;
   button.disabled=loading||!availableDates.has(key);
   button.classList.toggle('is-available',availableDates.has(key));
   button.setAttribute('aria-label',fullDate(key+'T12:00:00-05:00'));
   button.setAttribute('aria-pressed',String(key===selectedDay));
   if (key===today) button.setAttribute('aria-current','date');
   button.addEventListener('click',()=>{selectedDay=key;selectedSlot=null;requestId=crypto.randomUUID();drawDays();drawTimes();});
   calendar.append(button);
  }
  navigation[0].disabled=loading||month===firstMonth;
  const lastMonth = new Date(firstMonth+'-01T12:00:00Z');lastMonth.setUTCMonth(lastMonth.getUTCMonth()+5);
  navigation[1].disabled=loading||month>=lastMonth.toISOString().slice(0,7);
 }
 function drawTimes() {
  times.replaceChildren();next.disabled=!selectedSlot;
  root.querySelector('[data-day-title]').textContent=selectedDay?fullDate(selectedDay+'T12:00:00-05:00'):'Horarios disponibles';
  if (loading) {availability.textContent='Consultando la agenda…';return;}
  if (!slots.length) {availability.textContent='No quedan horarios libres para este mes. Puedes consultar otro mes.';return;}
  if (!selectedDay) {availability.textContent='Selecciona una fecha para ver sus horarios.';return;}
  availability.textContent='Selecciona el horario que mejor te acomode.';
  for (const slot of slots.filter(s=>dateKey(s.starts_at)===selectedDay)) {
   const button=document.createElement('button');button.type='button';
   button.textContent=time(slot.starts_at)+' – '+time(slot.ends_at);
   button.setAttribute('aria-pressed',String(selectedSlot?.id===slot.id));
   button.addEventListener('click',()=>{
    if(selectedSlot?.id!==slot.id)requestId=crypto.randomUUID();
    selectedSlot=slot;
    times.querySelector('[aria-pressed=true]')?.setAttribute('aria-pressed','false');
    button.setAttribute('aria-pressed','true');
    next.disabled=false;
   });
   times.append(button);
  }
 }
 async function loadMonth() {
  const version=++generation;loading=true;slots=[];selectedSlot=null;selectedDay='';drawDays();drawTimes();
  try {
   const response=await fetch('https://olivedrab-mouse-758184.hostingersite.com/api/consultations/availability?month='+month,{cache:'no-store'});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'No pudimos consultar la agenda.');
   if(version!==generation)return;
   slots=data.slots;loading=false;drawDays();drawTimes();
  } catch(error) {
   if(version!==generation)return;
   loading=false;drawDays();availability.textContent=error.message+' Usa las flechas del calendario para reintentar.';
  }
 }
 navigation.forEach(button=>button.addEventListener('click',()=>{
  const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+Number(button.dataset.month));month=date.toISOString().slice(0,7);void loadMonth();
 }));
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(form.hidden||!selectedSlot||submit.disabled||!form.reportValidity())return;
  back.disabled=true;submit.disabled=true;status.textContent='Enviando tu solicitud…';
  const fields=new FormData(form);
  try {
   const response=await fetch('https://olivedrab-mouse-758184.hostingersite.com/api/consultations/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId,slotId:selectedSlot.id,name:fields.get('name'),email:fields.get('email'),company:fields.get('company'),service:fields.get('service'),message:fields.get('context'),consent:fields.get('booking_consent')==='on',website:fields.get('website')})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'No pudimos registrar la solicitud.');
   const result=document.createElement('section');result.className='cb-result';result.tabIndex=-1;
   const title=document.createElement('h3');title.textContent=data.status==='confirmed'?'Consultoría confirmada':data.status==='declined'?'Esta solicitud ya fue respondida':'Solicitud recibida';
   const detail=document.createElement('p');detail.textContent=fullDate(selectedSlot.starts_at)+' · '+time(selectedSlot.starts_at)+' – '+time(selectedSlot.ends_at)+' (hora de Perú).';
   const message=document.createElement('p');message.textContent=data.status==='confirmed'?'MALBA PMC confirmó tu consultoría. Revisa tu correo para ver el enlace de la sesión.':data.status==='declined'?'Revisa tu correo o selecciona un nuevo horario.':'Tu horario está apartado mientras MALBA PMC confirma la consultoría. Recibirás un correo con la solicitud y otro cuando se confirme. El correo de confirmación incluirá el enlace de la sesión.';
   result.append(title,detail,message);flow.replaceChildren(result);focusStep(result);
  } catch(error) {status.textContent=error.message;}
  finally {back.disabled=false;submit.disabled=false;}
 });
 const flow=document.createElement('div');
 flow.className='cb-flow';
 const toolbar=document.createElement('div');
 toolbar.className='cb-toolbar';
 toolbar.innerHTML=`
  <ol class="cb-progress" aria-label="Pasos de la reserva">
   <li aria-current="step"><span>1</span> Fecha y hora</li>
   <li><span>2</span> Tus datos</li>
  </ol>
  <button class="cb-step-action" type="button" data-next disabled>Siguiente</button>
  <button class="cb-step-action" type="button" data-back hidden>Volver</button>
 `;
 const [dateStep, detailsStep]=toolbar.querySelectorAll('li');
 const next=toolbar.querySelector('[data-next]'), back=toolbar.querySelector('[data-back]');
 root.before(flow);
 flow.append(toolbar,root,form);
 const placeholder=document.createComment('Agenda en la sección');flow.before(placeholder);
 const dialog=document.createElement('dialog');dialog.className='cb-dialog';
 dialog.setAttribute('aria-labelledby','cb-dialog-title');
 dialog.innerHTML='<header class="cb-dialog-header"><h2 id="cb-dialog-title">Reserva tu consultoría</h2><button type="button" class="cb-dialog-close" aria-label="Cerrar reserva"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="cb-dialog-content"></div>';
 document.body.append(dialog);
 function focusStep(element) {
  if (dialog.open) dialog.scrollTop=0;
  else flow.scrollIntoView({block:'start'});
  element.focus({preventScroll:true});
 }
 next.addEventListener('click',()=>{
  if(!selectedSlot)return;
  appointment.textContent=fullDate(selectedSlot.starts_at)+' · '+time(selectedSlot.starts_at)+' – '+time(selectedSlot.ends_at)+' (hora de Perú)';
  dateStep.removeAttribute('aria-current');
  detailsStep.setAttribute('aria-current','step');
  root.hidden=true;
  form.hidden=false;
  submit.disabled=false;
  next.hidden=true;
  back.hidden=false;
  focusStep(detailsTitle);
 });
 back.addEventListener('click',()=>{
  detailsStep.removeAttribute('aria-current');
  dateStep.setAttribute('aria-current','step');
  form.hidden=true;
  submit.disabled=true;
  root.hidden=false;
  back.hidden=true;
  next.hidden=false;
  focusStep(next);
 });
 let opener;
 const close=()=>dialog.close();
 dialog.querySelector('.cb-dialog-close').addEventListener('click',close);
 dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close();}});
 dialog.addEventListener('close',()=>{placeholder.after(flow);opener?.focus({preventScroll:true});});
 function openBooking(link) {
  const menu = link.closest('.main-navigation') && matchMedia('(max-width:1130px)').matches;
  opener = menu ? document.querySelector('.menu-toggle') : link;
  dialog.querySelector('.cb-dialog-content').append(flow);
  dialog.showModal();
  dialog.scrollTop=0;
 }
 const links = [...document.querySelectorAll('a[href]')].filter(link => {
  if (link.hasAttribute('data-open-consultation')) return true;
  const url = new URL(link.href, location.href);
  return url.origin === location.origin && url.pathname === location.pathname && url.hash === '#consulta';
 });
 for (const link of links) {
  link.setAttribute('aria-haspopup','dialog');
  link.addEventListener('click', event => {
   if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
   event.preventDefault();
   openBooking(link);
  });
 }
 if (initialOpener) openBooking(initialOpener);
 void loadMonth();
}
