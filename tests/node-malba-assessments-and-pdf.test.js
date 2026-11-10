'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { config, evaluate } = require('../lms-system/assessments');
const createPayments = require('../event-system/payments');

test('mixed quiz separates automatic points from teacher assessment', () => {
 const lesson = { quiz: { questions: [
  { question: '¿A o B?', options: ['A', 'B'], correct: 1 },
  { question: 'Explica tu decisión.', type: 'open' }
 ] } };
 const result = evaluate(lesson, [1, '  Una explicación  ']);
 assert.deepEqual([result.objectiveCorrect, result.objectiveTotal, result.manualTotal], [1, 1, 1]);
 assert.deepEqual(result.responses[1], { question: 'Explica tu decisión.', answer: 'Una explicación', manual: true });
 assert.throws(() => evaluate(lesson, [1, '   ']), /respuesta abierta/);
 assert.throws(() => evaluate(lesson, [2, 'Respuesta']), /Selecciona una opción/);
});

test('assignment deadlines are saved in UTC from Peru local time', () => {
 const assignment = { type: 'assignment', body: 'Adjunta tu informe.', assignment: { dueAt: '2026-11-30T23:59' } };
 const saved = config(assignment);
 assert.equal(saved.dueAt, '2026-12-01T04:59:00.000Z');
 assert.deepEqual(config({ ...assignment, assignment: saved }), saved);
 assert.throws(() => config({ ...assignment, body: '' }), /instrucciones/);
});

test('an issued invoice is attached for buyer and accounting without a second issuance', async () => {
 const orderId = '12345678-1234-1234-1234-123456789abc';
 const session = { id: 'session', status: 'paid', mode: 'PRODUCTION', email: 'buyer@example.com', billing: { type: 'boleta' } };
 const job = { id: 'job', session_id: session.id, status: 'issued', delivery_copy_status: null, delivery_copy_attempts: 0, receipt: { serie: 'BBV1', numero: 3 } };
 const db = { from(table) {
  const row = table === 'book_payment_sessions' ? session : job;
  let update = null, single = false;
  const filters = [];
  const query = {
   select() { return this; },
   update(values) { update = values; return this; },
   eq(key, value) { if (key !== 'order_id') filters.push(() => row[key] === value); return this; },
   is(key, value) { return this.eq(key, value); },
   maybeSingle() { single = true; return this; },
   then(resolve) {
    const found = filters.every(match => match());
    if (found && update) Object.assign(row, update);
    return resolve({ data: single ? (found ? row : null) : (found ? [row] : []) });
   }
  };
  return query;
 } };
 const origin = 'https://malba-pmc.com';
 const pdf = Buffer.from('%PDF-1.7\nfixture');
 const messages = [];
 const env = { PUBLIC_ORIGIN: origin, STAGING_ORIGIN: origin, C2U_RUC: '20123456789', C2U_USER: 'fixture@example.com', C2U_PASSWORD: 'fixture', SMTP_HOST: 'example.com', SMTP_USER: 'mailer@example.com', SMTP_PASSWORD: 'fixture' };
 const api = createPayments({ db, env, requireAdmin: () => ({}), csrfOk: () => true,
  json: (res, status, body) => Object.assign(res, { status, body }),
  fetcher: async url => {
   if (url.endsWith('/token')) return { ok: true, json: async () => ({ c2uToken: 'fixture' }) };
   assert.match(url, /\/consultarPdf\//);
   return { ok: true, text: async () => JSON.stringify(pdf.toString('base64')) };
  },
  nodemailer: { createTransport: () => ({
   async sendMail(message) {
    messages.push(message);
    return { accepted: [message.to, message.cc] };
   },
   close() {}
  }) }
 });
 const url = new URL('/api/events/admin/payments/send-issued-invoice', origin);
 async function send() {
  const req = { method: 'POST', headers: { origin, 'content-type': 'application/json' },
   async *[Symbol.asyncIterator]() { yield JSON.stringify({ orderId }); } };
  return api.handler(req, {}, url);
 }
 assert.equal((await send()).status, 200);
 assert.equal((await send()).status, 400);
 assert.equal(messages.length, 1);
 assert.equal(messages[0].to, session.email);
 assert.equal(messages[0].cc, 'contabilidad@malba-pmc.com');
 assert.deepEqual(messages[0].attachments, [{ filename: 'Boleta-BBV1-3.pdf', content: pdf, contentType: 'application/pdf' }]);
 assert.equal(job.delivery_copy_status, 'sent');
});
