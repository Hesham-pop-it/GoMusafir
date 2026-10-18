const test = require('node:test');
const assert = require('node:assert/strict');
const { createModel, buildRequest, parseReply, MODEL, ENDPOINT } = require('../services/deen/deenModel');

const ok = json => async () => ({ ok: true, json: async () => json });

test('the model is off in the emulator and without a key, and never calls fetch', () => {
  const never = () => { throw new Error('network'); };
  assert.equal(createModel({ apiKey: 'sk-ant-x', isEmulator: true, fetchImpl: never }), null);
  assert.equal(createModel({ apiKey: '', isEmulator: false, fetchImpl: never }), null);
  assert.equal(createModel({ apiKey: undefined, isEmulator: false, fetchImpl: never }), null);
});

test('the request has the Messages API shape and only the typed text, step, language and date', () => {
  const body = buildRequest({ step: 'dates', text: 'we leave 18 Feb', lang: 'en', today: '2026-10-16' });
  assert.equal(body.model, 'claude-sonnet-5-5'); assert.equal(MODEL, body.model);
  assert.equal(body.messages.length, 1); assert.equal(body.messages[0].role, 'user');
  assert.match(body.messages[0].content, /<message>we leave 18 Feb<\/message>/);
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'system']);
});

test('a reply is read from the first text block and sanitised', () => {
  const out = parseReply({ content: [{ type: 'text', text: 'Here: {"days":["2027-02-18","2027-03-03"],"participants":110,"yes_no":"maybe","reply":"Mooi!"}' }] });
  assert.deepEqual(out, { title: undefined, destination: undefined, days: ['2027-02-18', '2027-03-03'], participants: 110, yes_no: undefined, reply: 'Mooi!' });
  assert.equal(parseReply({ content: [{ type: 'text', text: 'no json' }] }), null);
  assert.equal(parseReply({ content: [] }), null);
  assert.equal(parseReply(null), null);
});

test('the call posts to the Messages endpoint with the key and version headers', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"participants":40}' }] }) }; };
  const model = createModel({ apiKey: 'sk-ant-test', isEmulator: false, fetchImpl });
  const out = await model({ step: 'participants', text: '40 people', lang: 'en', today: '2026-10-16' });
  assert.equal(out.participants, 40);
  assert.equal(seen.url, ENDPOINT);
  assert.equal(seen.init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(seen.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(JSON.parse(seen.init.body).model, 'claude-sonnet-5-5');
});

test('http errors, thrown errors and bad bodies fall back to null', async () => {
  const input = { step: 'name', text: 'x', lang: 'en', today: '2026-10-16' };
  assert.equal(await createModel({ apiKey: 'k', isEmulator: false, fetchImpl: async () => ({ ok: false }) })(input), null);
  assert.equal(await createModel({ apiKey: 'k', isEmulator: false, fetchImpl: async () => { throw new Error('boom'); } })(input), null);
  assert.equal(await createModel({ apiKey: 'k', isEmulator: false, fetchImpl: ok({ content: [{ type: 'text', text: 'plain' }] }) })(input), null);
});
