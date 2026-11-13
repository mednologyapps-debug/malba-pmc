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
 const pdf = Buffer.from('%PDF-1.7\nfixture'),xml=Buffer.from('<?xml version="1.0"?><Invoice/>');
 const messages = [];
 const env = { PUBLIC_ORIGIN: origin, STAGING_ORIGIN: origin, C2U_RUC: '20123456789', C2U_USER: 'fixture@example.com', C2U_PASSWORD: 'fixture', SMTP_HOST: 'example.com', SMTP_USER: 'mailer@example.com', SMTP_PASSWORD: 'fixture' };
 const api = createPayments({ db, env, requireAdmin: () => ({}), csrfOk: () => true,
  json: (res, status, body) => Object.assign(res, { status, body }),
  fetcher: async url => {
   if (url.endsWith('/token')) return { ok: true, json: async () => ({ c2uToken: 'fixture' }) };
   if(url.includes('/consultarPdf/'))return { ok: true, text: async () => JSON.stringify(pdf.toString('base64')) };
   if(url.includes('/consultarXml/'))return { ok: true, text: async () => JSON.stringify({xmlFirma:xml.toString('base64')}) };
   throw Error('Unexpected CLOSE2U endpoint: '+url);
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
 assert.deepEqual(messages[0].attachments, [
  { filename: 'Boleta-BBV1-3.pdf', content: pdf, contentType: 'application/pdf' },
  { filename: 'Boleta-BBV1-3.xml', content: xml, contentType: 'application/xml' }
 ]);
 assert.equal(job.delivery_copy_status, 'sent');
});

test('submitted mixed quiz and uploaded task give 100% progress before academic approval', () => {
 const { courseProgress } = require('../lms-system/assessments');
 const lessons = [{id:'quiz',type:'quiz',required:true},{id:'task',type:'assignment',required:true}];
 const taskDone = {lesson_id:'task'};
 const quizSubmission = {lesson_id:'quiz',kind:'quiz',manual_total:1};
 const pending = courseProgress(lessons,[taskDone],[quizSubmission]);
 assert.deepEqual(pending.progress,{done:['quiz','task'],completed:2,total:2,percent:100});
 assert.equal(pending.certifiable,false);
 assert.equal(courseProgress(lessons,[taskDone,{lesson_id:'quiz'}],[quizSubmission]).certifiable,true);
 assert.equal(courseProgress(lessons,[taskDone],[{...quizSubmission,manual_total:0}]).progress.percent,50);
});

test('task grade publishes zero and uses a compare-and-set guard against concurrent grading', async () => {
 const { create } = require('../lms-system/assessments');
 const filters = [];
 let patch;
 const query = {
  update(values) { patch=values; return this; },
  eq(key,value) { filters.push([key,value]); return this; },
  is(key,value) { filters.push([key,value]); return this; },
  select() { return this; },
  async maybeSingle() { return {data:{score:0}}; }
 };
 const api=create({db:{from:()=>query},json:(_res,status,body)=>({status,body})});
 const path=new URL('https://malba-pmc.com/api/lms/admin/assessments/grade');
 const id='12345678-1234-1234-1234-123456789abc';
 const request={method:'POST'};
 await assert.rejects(api.admin(request,{},path,{id,kind:'assignment',points:101}),/entre 0 y 100/);
 assert.deepEqual(await api.admin(request,{},path,{id,kind:'assignment',points:0,feedback:'Revisar cálculos.'}),{status:200,body:{score:0}});
 assert.equal(patch.score,0);
 assert.equal(patch.feedback,'Revisar cálculos.');
 assert.deepEqual(filters,[['id',id],['kind','assignment'],['graded_at',null]]);
});
