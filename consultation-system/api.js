'use strict';
const crypto = require('node:crypto');
const {allowedBrowserOrigin, publicOrigin} = require('../event-system/public-origin');
const {sender} = require('../mail-sender');
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const clean = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format = (value, options) => new Intl.DateTimeFormat('es-PE', {timeZone:'America/Lima', ...options}).format(new Date(value));

module.exports = function createConsultationApi({db, json, requireAdmin, csrfOk, sign, nodemailer, getDocument, env = process.env}) {
 const attempts = new Map();
 let dispatching = false;
 const tokenFor = request => request + '.' + sign('consultation-confirm:' + request);
 const mailReady = () => !!(env.SMTP_HOST && env.SMTP_USER && (env.SMTP_PASSWORD || env.SMTP_PASS));
 async function query(operation) {
  const result = await operation;
  if (result.error) throw Error(result.error.message);
  return result.data;
 }
 async function settings() {
  return query(db.from('consultation_settings').select('*').eq('id', true).single());
 }
 async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
   size += chunk.length;
   if (size > 16000) throw Error('La solicitud es demasiado grande.');
   chunks.push(chunk);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Solicitud inválida.');
  return value;
 }
 function rate(req, suffix, max) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  const key = String(req.socket.remoteAddress || '') + ':' + suffix;
  if (attempts.size >= 10000 && !attempts.has(key)) return false;
  const value = attempts.get(key) || {until:now + 600000, count:0};
  value.count++;
  attempts.set(key, value);
  return value.count <= max;
 }
 function bearer(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!/^[a-f0-9-]{36}\.[a-f0-9]{64}$/i.test(token)) throw Error('El enlace de confirmación no es válido.');
  return hash(token);
 }
 function monthRange(url) {
  const month = url.searchParams.get('month') || format(new Date(), {year:'numeric', month:'2-digit'}).split('/').reverse().join('-');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Selecciona un mes válido.');
  const from = new Date(month + '-01T00:00:00-05:00');
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  if (from.getTime() > Date.now() + 190 * 86400000 || next.getTime() < Date.now() - 86400000) throw Error('Selecciona un mes próximo.');
  return {from:from.toISOString(), to:next.toISOString()};
 }
 function mailContent(job, booking) {
  const slot = booking.consultation_slots;
  const date = format(slot.starts_at, {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const time = format(slot.starts_at, {hour:'numeric', minute:'2-digit'}) + ' – ' + format(slot.ends_at, {hour:'numeric', minute:'2-digit'}) + ' (hora de Perú)';
  const consultant = job.kind === 'requested_consultant';
  let title, description;
  if (consultant) {
   title = 'Solicitud de consultoría pendiente de confirmación';
   description = booking.name + ' solicita una consultoría. Revisa los datos y confirma la fecha y hora.';
  } else if (job.kind === 'confirmed_client') {
   title = 'Tu consultoría ha sido confirmada';
   description = 'MALBA PMC confirmó tu consultoría con Miguel Alba. El equipo te enviará el enlace de la reunión por separado.';
  } else if (job.kind === 'declined_client') {
   title = 'Actualización de tu solicitud de consultoría';
   description = 'MALBA PMC no podrá atenderte en el horario solicitado. Puedes elegir otra fecha en nuestra web.';
  } else {
   title = 'Recibimos tu solicitud de consultoría';
   description = 'Tu horario está apartado mientras MALBA PMC revisa la solicitud. Espera el correo de confirmación antes de considerar la reunión confirmada.';
  }
  const link = consultant ? publicOrigin(env) + '/consultoria/confirmar/#' + tokenFor(booking.request_id) : publicOrigin(env) + '/consultoria/#consulta';
  const detail = consultant ? '<p><strong>Cliente</strong><br>' + escape(booking.name) + '<br>' + escape(booking.email) + '</p><p>' + escape(booking.company) + '</p><p><strong>Consulta</strong><br>' + escape(booking.message).replace(/\n/g, '<br>') + '</p>' : '';
  const cta = consultant ? 'Revisar y confirmar consultoría' : job.kind === 'declined_client' ? 'Ver otros horarios' : '';
  const html = '<div style="font:16px/1.6 Arial,sans-serif;color:#163b61;max-width:620px;margin:auto;padding:24px"><img src="' + publicOrigin(env) + '/assets/malba-pmc-logo.png" alt="MALBA PMC" width="166"><h1 style="font-size:25px">' + escape(title) + '</h1><p>' + escape(description) + '</p><p><strong>' + escape(booking.service) + '</strong></p><p>' + escape(date) + '<br>' + escape(time) + '</p>' + detail + (cta ? '<p><a style="display:inline-block;background:#5d4594;color:white;text-decoration:none;padding:12px 18px;border-radius:8px" href="' + escape(link) + '">' + cta + '</a></p>' : '') + '</div>';
  return {to:consultant ? booking.consultant_email : booking.email, subject:title + ' | MALBA PMC', html, text:[title, description, booking.service, date, time, consultant ? booking.name + '\n' + booking.email + '\n' + booking.company + '\n' + booking.message : '', cta ? cta + '\n' + link : ''].join('\n\n')};
 }
 async function flushMail() {
  if (dispatching || !db || !mailReady()) return;
  dispatching = true;
  let transport;
  try {
   const jobs = await query(db.from('consultation_mail_outbox').select('*').in('status', ['pending','failed']).lt('attempts', 3).lte('next_attempt_at', new Date().toISOString()).order('created_at').limit(10));
   if (!jobs.length) return;
   const port = Number(env.SMTP_PORT || 465);
   transport = nodemailer.createTransport({host:env.SMTP_HOST, port, secure:env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465, auth:{user:env.SMTP_USER, pass:env.SMTP_PASSWORD || env.SMTP_PASS}, connectionTimeout:10000, socketTimeout:20000, tls:{rejectUnauthorized:true}});
   for (const job of jobs) {
    const claims = await query(db.from('consultation_mail_outbox').update({status:'sending', attempts:job.attempts + 1, updated_at:new Date().toISOString()}).eq('id', job.id).eq('status', job.status).eq('attempts', job.attempts).select('id'));
    if (!claims.length) continue;
    try {
     const booking = await query(db.from('consultation_bookings').select('*,consultation_slots(starts_at,ends_at)').eq('id', job.booking_id).single());
     if (job.kind.startsWith('requested_') && booking.status !== 'pending') {
      await query(db.from('consultation_mail_outbox').update({status:'cancelled', updated_at:new Date().toISOString()}).eq('id', job.id));
      continue;
     }
     const mail = mailContent(job, booking);
     const receipt = await transport.sendMail({...mail, from:sender(env), messageId:'<malba-consultation-' + job.id + '@malba-pmc.com>'});
     if (!receipt.accepted?.length) throw Error('SMTP no aceptó el destinatario.');
     await query(db.from('consultation_mail_outbox').update({status:'sent', last_error:null, updated_at:new Date().toISOString()}).eq('id', job.id));
    } catch (error) {
     console.error('Consultation mail failed:', error.code || 'SMTP');
     await query(db.from('consultation_mail_outbox').update({status:'failed', last_error:'Revisar entrega SMTP antes de reintentar.', next_attempt_at:new Date(Date.now() + 120000 * (job.attempts + 1)).toISOString(), updated_at:new Date().toISOString()}).eq('id', job.id));
    }
   }
  } catch (error) {
   console.error('Consultation outbox unavailable:', error.code || 'database');
  } finally {
   transport?.close();
   dispatching = false;
  }
 }
 function sendQueued() { void flushMail(); }
 if (db) {
  const timer = setInterval(sendQueued, 60000);
  timer.unref();
 }
 return async function consultationApi(req, res, url) {
  const route = url.pathname.replace(/\/$/, '');
  const adminRoute = route.startsWith('/api/consultations/admin');
  if (adminRoute) {
   const admin = requireAdmin(req, res);
   if (!admin) return;
   if (!csrfOk(req, admin)) return json(res, 403, {error:'Recarga el administrador para renovar tu sesión.'});
  }
  if (!db) return json(res, 503, {error:'La agenda todavía no está disponible.'});
  try {
   if (!adminRoute && !rate(req, 'requests', 180)) return json(res, 429, {error:'Espera un momento antes de reintentar.'});
   if (req.method === 'POST') {
    if (!adminRoute && !allowedBrowserOrigin(req.headers.origin, env)) return json(res, 403, {error:'Origen no permitido.'});
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, {error:'Formato no permitido.'});
   }
   if (route === '/api/consultations/availability' && req.method === 'GET') {
    const current = await settings();
    if (!current.enabled || !current.consultant_email || !mailReady()) return json(res, 200, {slots:[], timezone:'America/Lima', enabled:false});
    const range = monthRange(url);
    const slots = await query(db.from('consultation_slots').select('id,starts_at,ends_at').eq('enabled', true).gte('starts_at', new Date(Math.max(Date.parse(range.from), Date.now() + 3600000)).toISOString()).lt('starts_at', range.to).order('starts_at').limit(1000));
    const booked = slots.length ? await query(db.from('consultation_bookings').select('slot_id').in('slot_id', slots.map(s => s.id)).in('status', ['pending','confirmed'])) : [];
    const taken = new Set(booked.map(b => b.slot_id));
    return json(res, 200, {slots:slots.filter(s => !taken.has(s.id)), timezone:'America/Lima', enabled:true});
   }
   if (route === '/api/consultations/request' && req.method === 'POST') {
    if (!mailReady()) return json(res, 503, {error:'La agenda todavía no está disponible.'});
    const value = await body(req);
    const name = clean(value.name,120), email = clean(value.email,254).toLowerCase(), company = clean(value.company,150), service = clean(value.service,160), message = clean(value.message,1500);
    if (!UUID.test(value.requestId || '') || !UUID.test(value.slotId || '') || name.length < 3 || !EMAIL.test(email) || message.length < 10 || value.consent !== true || value.website) return json(res, 400, {error:'Completa tus datos y acepta la política de privacidad.'});
    const site = await getDocument();
    const services = site.published?.consulting?.services || require('../content/consultoria.json').services;
    if (!services.some(item => item.name === service)) return json(res, 400, {error:'Selecciona una especialidad válida.'});
    if (!rate(req, 'email:' + email, 5)) return json(res, 429, {error:'Espera unos minutos antes de enviar otra solicitud.'});
    const result = await query(db.rpc('consultation_reserve', {p_request:value.requestId, p_slot:value.slotId, p_name:name, p_email:email, p_company:company, p_service:service, p_message:message, p_token_hash:hash(tokenFor(value.requestId))}));
    sendQueued();
    return json(res, 201, result);
   }
   if (route === '/api/consultations/confirmation') {
    const token = bearer(req);
    if (req.method === 'GET') {
     const booking = await query(db.from('consultation_bookings').select('name,email,company,service,message,status,consultation_slots(starts_at,ends_at)').eq('token_hash',token).maybeSingle());
     if (!booking || Date.parse(booking.consultation_slots.starts_at) <= Date.now()) return json(res, 404, {error:'El enlace no está disponible o la fecha ya pasó.'});
     return json(res, 200, booking);
    }
    if (req.method === 'POST') {
     const value = await body(req);
     if (!['confirmed','declined'].includes(value.status)) return json(res, 400, {error:'Selecciona una respuesta válida.'});
     const result = await query(db.rpc('consultation_decide', {p_id:null, p_token_hash:token, p_status:value.status}));
     sendQueued();
     return json(res, 200, result);
    }
   }
   if (route === '/api/consultations/admin/settings') {
    const current = await settings();
    if (req.method === 'GET') return json(res, 200, {...current, mailConfigured:mailReady()});
    if (req.method === 'POST') {
     const value = await body(req), email = clean(value.consultant_email,254).toLowerCase();
     if (!EMAIL.test(email) || typeof value.enabled !== 'boolean') return json(res, 400, {error:'Indica el correo de Miguel y el estado de la agenda.'});
     if (value.enabled && !mailReady()) return json(res, 409, {error:'Configura el envío de correos antes de activar la agenda.'});
     const rows = await query(db.from('consultation_settings').update({consultant_email:email, enabled:value.enabled, revision:current.revision + 1, updated_at:new Date().toISOString()}).eq('id', true).eq('revision', value.revision).select('revision'));
     if (!rows.length) return json(res, 409, {error:'Otra sesión cambió la agenda. Actualiza la vista.'});
     return json(res, 200, {revision:rows[0].revision});
    }
   }
   if (route === '/api/consultations/admin/slots') {
    if (req.method === 'GET') {
     const range = monthRange(url);
     const slots = await query(db.from('consultation_slots').select('id,starts_at,ends_at,enabled,consultation_bookings(id,name,email,company,service,message,status,created_at)').gte('starts_at',range.from).lt('starts_at',range.to).order('starts_at').limit(1000));
     return json(res, 200, {slots});
    }
    if (req.method === 'POST') {
     const value = await body(req);
     if (!Array.isArray(value.slots) || !value.slots.length || value.slots.length > 32) return json(res, 400, {error:'Selecciona los horarios que deseas publicar.'});
     const count = await query(db.rpc('consultation_add_slots',{p_slots:value.slots}));
     return json(res, 201, {count});
    }
   }
   if (route === '/api/consultations/admin/slot' && req.method === 'POST') {
    const value = await body(req);
    if (!UUID.test(value.id || '')) return json(res, 400, {error:'Horario inválido.'});
    await query(db.from('consultation_slots').update({enabled:false}).eq('id',value.id));
    return json(res, 200, {hidden:true});
   }
   if (route === '/api/consultations/admin/decision' && req.method === 'POST') {
    const value = await body(req);
    if (!UUID.test(value.id || '')) return json(res, 400, {error:'Solicitud inválida.'});
    const result = await query(db.rpc('consultation_decide',{p_id:value.id,p_token_hash:null,p_status:value.status}));
    sendQueued();
    return json(res, 200, result);
   }
   if (route === '/api/consultations/admin/mail' && req.method === 'GET') {
    const rows = await query(db.from('consultation_mail_outbox').select('status').in('status',['failed','sending']));
    return json(res, 200, {failed:rows.filter(r => r.status === 'failed').length, sending:rows.filter(r => r.status === 'sending').length});
   }
   return json(res, 404, {error:'Ruta no encontrada.'});
  } catch (error) {
   console.error('Consultation API:', error.code || 'request');
   const expected = /horario|agenda|solicitud|fecha|duración|coincide|correo|confirmación|enlace|rechazada|mes/i.test(error.message);
   return json(res, 400, {error:expected ? error.message : 'No pudimos completar la solicitud. Inténtalo nuevamente.'});
  }
 };
};
