const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(env) {
  const pushed = [], sent = [];
  const db = { ref: () => ({ push: () => ({ key: 'm1', set: async value => pushed.push(value) }) }) };
  const deps = {
    '@sendgrid/mail': { setApiKey: () => {}, send: async msg => { sent.push(msg); return [{}]; } },
    'firebase-functions/params': { defineSecret: () => ({ value: () => 'SG.test' }) },
    '../admin': { db },
  };
  const module = { exports: {} };
  const file = path.join(__dirname, '../services/emailService.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require: id => deps[id] || assert.fail(id), process: { env }, console, Date, Error, JSON }, { filename: file });
  return { sendEmail: module.exports.sendEmail, pushed, sent };
}
test('the emulator parks the mail in dev_outbox and never reaches SendGrid', async () => {
  const f = load({ FUNCTIONS_EMULATOR: 'true', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:19610' });
  const result = await f.sendEmail({ to: 'a@b.test', subject: 'S', html: '<p>x</p>', customArgs: { trip_id: 't' } });
  assert.equal(f.sent.length, 0);
  assert.equal(f.pushed.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify({ ...f.pushed[0], created_at: typeof f.pushed[0].created_at })), {
    to: 'a@b.test', subject: 'S', html: '<p>x</p>', template: 'd-eff261607ce94c2ab816abce9c740ef2', created_at: 'number', custom_args: { trip_id: 't' } });
  assert.equal(result.devOutboxId, 'm1');
});
test('outside the emulator the SendGrid path is unchanged and carries the custom args', async () => {
  const f = load({});
  await f.sendEmail({ to: 'a@b.test', subject: 'S', html: 'h', customArgs: { org_id: 'o' } });
  await f.sendEmail({ to: 'c@d.test', subject: 'S', html: 'h' });
  assert.equal(f.pushed.length, 0);
  assert.equal(f.sent.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(f.sent[0].customArgs)), { org_id: 'o' });
  assert.equal('customArgs' in f.sent[1], false);
  assert.deepEqual(JSON.parse(JSON.stringify(f.sent[1].dynamicTemplateData)), { subject: 'S', html: 'h' });
});
test('the emulator without the database emulator sends nothing: no outbox, no SendGrid', async () => {
  const f = load({ FUNCTIONS_EMULATOR: 'true' });
  await assert.rejects(f.sendEmail({ to: 'a@b.test', subject: 'S', html: 'h' }), /database emulator/);
  assert.equal(f.pushed.length, 0);
  assert.equal(f.sent.length, 0);
});
