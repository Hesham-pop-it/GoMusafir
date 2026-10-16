const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifySignature, createWebhookHandler } = require('../services/invitations/sendgridWebhook');

// A generated key pair stands in for SendGrid's: the public key is the base64 DER (SPKI) form the SendGrid settings show.
const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const sign = (timestamp, body, key = pair.privateKey) => {
  const signer = crypto.createSign('sha256'); signer.update(timestamp + body); return signer.sign(key).toString('base64');
};

test('a correctly signed body verifies', () => {
  const body = '[{"event":"bounce"}]', timestamp = '1760000000';
  assert.equal(verifySignature({ publicKey, signature: sign(timestamp, body), timestamp, rawBody: Buffer.from(body) }), true);
});
test('a changed body, timestamp, signature or key does not verify', () => {
  const body = '[{"event":"bounce"}]', timestamp = '1760000000', signature = sign(timestamp, body);
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  assert.equal(verifySignature({ publicKey, signature, timestamp, rawBody: body + ' ' }), false);
  assert.equal(verifySignature({ publicKey, signature, timestamp: '1760000001', rawBody: body }), false);
  assert.equal(verifySignature({ publicKey, signature: sign(timestamp, body, other.privateKey), timestamp, rawBody: body }), false);
  assert.equal(verifySignature({ publicKey, signature: 'not-a-signature', timestamp, rawBody: body }), false);
  assert.equal(verifySignature({ publicKey: 'garbage', signature, timestamp, rawBody: body }), false);
  assert.equal(verifySignature({ publicKey: '', signature, timestamp, rawBody: body }), false);
  assert.equal(verifySignature({ publicKey, signature: '', timestamp, rawBody: body }), false);
});

function response() {
  const r = { code: null, body: null };
  r.status = code => { r.code = code; return r; };
  r.send = body => { r.body = body; return r; };
  r.json = body => { r.body = body; return r; };
  return r;
}
const request = (method, body, headers) => ({ method, rawBody: Buffer.from(body), get: name => headers[name.toLowerCase()] });

test('the handler refuses other methods, a missing key and bad signatures before reading anything', async () => {
  const handler = createWebhookHandler({ getPublicKey: () => publicKey });
  const body = '[]', timestamp = '1';
  let res = response(); await handler(request('GET', body, {}), res); assert.equal(res.code, 405);
  res = response(); await handler(request('POST', body, {}), res); assert.equal(res.code, 401);
  res = response();
  await handler(request('POST', body, { 'x-twilio-email-event-webhook-signature': sign(timestamp, 'other'), 'x-twilio-email-event-webhook-timestamp': timestamp }), res);
  assert.equal(res.code, 401);
  res = response(); await createWebhookHandler({ getPublicKey: () => '' })(request('POST', body, {}), res); assert.equal(res.code, 500);
});
test('a signed body that is not JSON is a bad request', async () => {
  const handler = createWebhookHandler({ getPublicKey: () => publicKey });
  const body = 'nope', timestamp = '5', res = response();
  await handler(request('POST', body, { 'x-twilio-email-event-webhook-signature': sign(timestamp, body), 'x-twilio-email-event-webhook-timestamp': timestamp }), res);
  assert.equal(res.code, 400);
});
