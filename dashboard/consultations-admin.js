'use strict';

async function renderConsultationAgenda() {
 const editor = document.querySelector('#editor');
 editor.replaceChildren();
 document.querySelector('#page-title').textContent = 'Agenda de consultorías';
 document.querySelector('#page-description').textContent = 'Selecciona un día o una hora para gestionar la agenda de Miguel.';
 document.querySelector('.actions').hidden = true;
 document.querySelector('.status-row').hidden = true;

 const endpoint = '/api/consultations/admin/';
 const button = (text, style = 'secondary') => el('button', {type:'button', class:'button ' + style, text});
 const lima = 'America/Lima';
 const dayKey = value => new Intl.DateTimeFormat('en-CA', {timeZone:lima, year:'numeric', month:'2-digit', day:'2-digit'}).format(value);
 const dateAt = key => new Date(key + 'T12:00:00-05:00');
 const addDays = (key, count) => new Date(+dateAt(key) + count * 86400000).toISOString().slice(0,10);
 const dateText = (value, options) => new Intl.DateTimeFormat('es-PE', {timeZone:lima, ...options}).format(value);
 const time = value => dateText(new Date(value), {hour:'numeric', minute:'2-digit'});
 const interval = slot => time(slot.starts_at) + ' – ' + time(slot.ends_at);
 const hourAt = new Intl.DateTimeFormat('en-GB', {timeZone:lima, hour:'2-digit', hourCycle:'h23'});
 const today = dayKey(new Date());
 const firstWeek = addDays(today, -(dateAt(today).getUTCDay() + 6) % 7);
 const lastDay = addDays(today, 179);
 let week = firstWeek;
 let generation = 0;
 let scrollToMorning = true;
 let settingsRevision;
 let saving = false;
 let opener;

 const weekTitle = el('h2');
 const prev = button('‹');
 prev.setAttribute('aria-label', 'Semana anterior');
 const next = button('›');
 next.setAttribute('aria-label', 'Semana siguiente');
 const currentWeek = button('Hoy');
 const refresh = button('Actualizar');
 const toolbar = el('div', {class:'cb-week-toolbar'}, [
  el('div', {class:'cb-week-navigation'}, [prev, next, currentWeek]),
  weekTitle,
  refresh
 ]);
 const calendarStatus = el('p', {class:'cb-week-status', role:'status'});
 const calendar = el('div', {class:'cb-week-scroll', tabindex:'0', role:'region', 'aria-label':'Calendario semanal de consultorías'});
 const legend = el('div', {class:'cb-week-legend'}, [
  el('span', {class:'is-available', text:'Disponible'}),
  el('span', {class:'is-blocked', text:'Bloqueado'}),
  el('span', {class:'is-pending', text:'Pendiente'}),
  el('span', {class:'is-confirmed', text:'Confirmada'}),
  el('span', {class:'cb-week-timezone', text:'Hora de Perú (UTC−5)'})
 ]);

 const mailSettings = el('details', {class:'cb-week-settings'}, [el('summary', {text:'Configuración de avisos'})]);
 const email = el('input', {type:'email', required:'', maxlength:'254', autocomplete:'email'});
 const save = el('button', {type:'submit', class:'button primary', text:'Guardar correo', disabled:''});
 const settingsStatus = el('p', {role:'status'});
 const mailStatus = el('p', {class:'field-hint'});
 const settingsForm = el('form', {class:'cms-settings-form'}, [
  el('label', {text:'Correo de Miguel para recibir solicitudes'}, [email]), save, settingsStatus, mailStatus
 ]);
 mailSettings.append(settingsForm);

 const dialogTitle = el('h2', {id:'cb-admin-day-title'});
 const close = button('×');
 close.setAttribute('aria-label', 'Cerrar horarios');
 const dialogBody = el('div', {class:'cb-week-dialog-body'});
 const dialog = el('dialog', {class:'cb-week-dialog', 'aria-labelledby':dialogTitle.id}, [
  el('header', {}, [dialogTitle, close]), dialogBody
 ]);
 editor.append(toolbar, legend, calendar, calendarStatus, mailSettings, dialog);
 const stillHere = () => editor.contains(calendar);
 close.addEventListener('click', () => dialog.close());
 dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
 dialog.addEventListener('close', () => {
  if (opener?.isConnected) opener.focus();
  else if (stillHere()) refresh.focus({preventScroll:true});
 });
 const activeBooking = slot => slot.consultation_bookings.find(b => b.status === 'pending' || b.status === 'confirmed');
 const state = slot => activeBooking(slot)?.status || (slot.enabled ? 'available' : 'blocked');
 const labels = {available:'Disponible', blocked:'Bloqueado', pending:'Pendiente', confirmed:'Confirmada'};

 async function loadSettings() {
  try {
   const [settings, notices] = await Promise.all([request(endpoint+'settings'), request(endpoint+'mail')]);
   if (!stillHere()) return;
   settingsRevision = settings.revision;
   email.value = settings.consultant_email;
   save.disabled = false;
   settingsStatus.textContent = !settings.consultant_email ? 'Indica el correo de Miguel para enviarle los avisos.' : settings.mailConfigured ? '' : 'Configura SMTP en Hostinger para enviar los avisos.';
   mailStatus.textContent = notices.awaitingRecipient ? 'Hay avisos a la espera del correo de Miguel.' : notices.failed || notices.sending ? 'Avisos por revisar: '+notices.failed+' fallidos, '+notices.sending+' en envío.' : '';
   if (settingsStatus.textContent || mailStatus.textContent) mailSettings.open = true;
  } catch (error) { settingsStatus.textContent = error.message; mailSettings.open = true; }
 }
 settingsForm.addEventListener('submit', async event => {
  event.preventDefault();
  save.disabled = true;
  settingsStatus.textContent = 'Guardando…';
  try {
   const result = await request(endpoint+'settings', {consultant_email:email.value, enabled:true, revision:settingsRevision});
   settingsRevision = result.revision;
   settingsStatus.textContent = 'Correo actualizado.';
  } catch (error) { settingsStatus.textContent = error.message; }
  finally { save.disabled = false; }
 });

 function openDay(key, slots, preferred, trigger) {
  opener = trigger;
  dialogTitle.textContent = dateText(dateAt(key), {weekday:'long', day:'numeric', month:'long'});
  const options = slots.filter(slot => Date.parse(slot.starts_at) > Date.now() || activeBooking(slot));
  const picker = el('select', {'aria-label':'Horario'});
  for (const slot of options) {
   picker.append(el('option', {value:slot.id, text:interval(slot)+' · '+labels[state(slot)]}));
  }
  if (preferred) picker.value = preferred;
  const detail = el('div', {class:'cb-week-detail'});
  const actions = el('div', {class:'cb-week-actions'});
  const status = el('p', {class:'cb-week-dialog-status', role:'status'});
  dialogBody.replaceChildren(el('label', {text:'Horario (hora de Perú)'}, [picker]), detail, actions, status);

  function action(label, route, payload, success, style) {
   const control = button(label, style);
   control.addEventListener('click', async () => {
    if (saving) return;
    saving = true;
    close.disabled = picker.disabled = true;
    actions.querySelectorAll('button').forEach(item => { item.disabled = true; });
    status.textContent = 'Guardando…';
    try {
     await request(endpoint+route, payload);
     dialog.close();
     await loadWeek(success);
    } catch (error) {
     status.textContent = error.message;
     actions.querySelectorAll('button').forEach(item => { item.disabled = false; });
    } finally {
     saving = false;
     close.disabled = picker.disabled = false;
    }
   });
   actions.append(control);
  }

  function showSlot() {
   detail.replaceChildren();
   actions.replaceChildren();
   status.textContent = '';
   const slot = options.find(item => item.id === picker.value);
   if (!slot) return;
   const booking = activeBooking(slot);
   if (booking) {
    detail.append(el('strong', {text:booking.name}), el('p', {text:[booking.email,booking.company].filter(Boolean).join(' · ')}),
     el('p', {text:booking.service}), el('p', {text:booking.message}));
    if (Date.parse(slot.starts_at) <= Date.now()) return;
    if (booking.status === 'pending') {
     action('Confirmar', 'decision', {id:booking.id, status:'confirmed'}, 'Reserva confirmada.', 'primary');
     action('Rechazar horario', 'decision', {id:booking.id, status:'declined'}, 'Solicitud rechazada.');
    } else {
     action('Cancelar reserva', 'decision', {id:booking.id, status:'declined'}, 'Reserva cancelada.');
    }
    return;
   }
   action(slot.enabled ? 'Bloquear horario' : 'Liberar horario', 'slot', {id:slot.id, enabled:!slot.enabled},
    slot.enabled ? 'Horario bloqueado.' : 'Horario liberado.', 'primary');
  }
  picker.addEventListener('change', showSlot);
  showSlot();
  dialog.showModal();
 }

 function drawWeek(days, slots) {
  const byDay = new Map(days.map(key => [key, []]));
  const byHour = new Map();
  for (const slot of slots) {
   const start = new Date(slot.starts_at);
   const key = dayKey(start);
   if (!byDay.has(key)) continue;
   byDay.get(key).push(slot);
   const bucket = key + '-' + Number(hourAt.format(start));
   if (!byHour.has(bucket)) byHour.set(bucket, []);
   byHour.get(bucket).push(slot);
  }

  const header = el('tr', {}, [el('th', {scope:'col', text:'Hora'})]);
  for (const key of days) {
   const date = dateAt(key);
   const day = el('button', {type:'button', class:'cb-week-day'}, [
    el('span', {text:dateText(date, {weekday:'short'})}), el('strong', {text:dateText(date, {day:'numeric'})})
   ]);
   day.setAttribute('aria-label', dateText(date, {weekday:'long', day:'numeric', month:'long'}));
   if (key === today) day.setAttribute('aria-current','date');
   day.disabled = !byDay.get(key).some(slot => Date.parse(slot.starts_at) > Date.now() || activeBooking(slot));
   day.addEventListener('click', () => openDay(key, byDay.get(key), null, day));
   header.append(el('th', {scope:'col'}, [day]));
  }
  const body = el('tbody');
  for (let hour = 0; hour < 24; hour++) {
   const row = el('tr', {'data-hour':String(hour)}, [el('th', {scope:'row', text:String(hour).padStart(2,'0')+':00'})]);
   for (const key of days) {
    const cell = el('td');
    for (const slot of byHour.get(key+'-'+hour) || []) {
     const status = state(slot);
     const booking = activeBooking(slot);
     const control = el('button', {type:'button', class:'cb-week-cell is-'+status, text:status === 'available' ? '＋' : labels[status]});
     control.setAttribute('aria-label', interval(slot)+' · '+labels[status]);
     control.disabled = Date.parse(slot.starts_at) <= Date.now() && !booking;
     control.addEventListener('click', () => openDay(key, byDay.get(key), slot.id, control));
     cell.append(control);
    }
    row.append(cell);
   }
   body.append(row);
  }
  calendar.replaceChildren(el('table', {class:'cb-week-table', 'aria-label':'Semana de consultorías'}, [el('thead', {}, [header]), body]));
  if (scrollToMorning) {
   calendar.scrollTop = body.querySelector('[data-hour="8"]').offsetTop - header.offsetHeight;
   scrollToMorning = false;
  }
 }

 async function loadWeek(success = '') {
  const selected = week;
  const version = ++generation;
  const days = Array.from({length:7}, (_,index) => addDays(selected,index));
  const start = dateAt(days[0]);
  const end = dateAt(days[6]);
  const left = dateText(start, {day:'numeric', month:'short'});
  const right = dateText(end, {day:'numeric', month:'short', year:'numeric'});
  weekTitle.textContent = left+' – '+right;
  prev.disabled = selected <= firstWeek;
  next.disabled = addDays(selected,7) > lastDay;
  calendarStatus.textContent = 'Consultando agenda…';
  calendar.setAttribute('aria-busy','true');
  try {
   const data = await request(endpoint+'slots?week='+encodeURIComponent(selected));
   if (!stillHere() || version !== generation) return;
   drawWeek(days, data.slots);
   calendarStatus.textContent = success || (data.slots.length ? '' : 'No hay horarios para esta semana.');
  } catch (error) {
   if (!stillHere() || version !== generation) return;
   calendar.replaceChildren();
   calendarStatus.textContent = error.message;
  } finally {
   if (version === generation) calendar.removeAttribute('aria-busy');
  }
 }
 function goTo(key) {
  if (week !== key) {
   week = key;
   calendar.replaceChildren();
   scrollToMorning = true;
  }
  void loadWeek();
 }
 prev.addEventListener('click', () => goTo(addDays(week,-7)));
 next.addEventListener('click', () => goTo(addDays(week,7)));
 currentWeek.addEventListener('click', () => goTo(firstWeek));
 refresh.addEventListener('click', () => void loadWeek());
 void loadSettings();
 await loadWeek();
}
