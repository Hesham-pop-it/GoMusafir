const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
// The database handle is never touched, so the admin module is replaced.
const original = Module._load;
Module._load = function (request, ...rest) {
  if (request === '../../admin') return { db: {}, auth: {}, admin: {} };
  return original.call(this, request, ...rest);
};
const { assertEncryptionKey, encryptStep, decryptStep } = require('../services/passport/passportStore');
Module._load = original;

const KEY = 'ab'.repeat(32);
test('outside the emulator a missing or malformed key is refused without leaking the key', () => {
  for (const key of [undefined, '', 'abc', 'zz'.repeat(32), 'ab'.repeat(31), 'ab'.repeat(33)]) {
    assert.throws(() => assertEncryptionKey({ ENCRYPTION_KEY: key }), e => e.code === 'failed-precondition' && !String(e.message).includes('ab') && !String(e.message).includes(String(key || 'x'.repeat(9))));
  }
  assert.throws(() => assertEncryptionKey({ FUNCTIONS_EMULATOR: 'false' }), e => e.code === 'failed-precondition');
});
test('a well-formed key passes, and the emulator may run without one', () => {
  assert.doesNotThrow(() => assertEncryptionKey({ ENCRYPTION_KEY: KEY }));
  assert.doesNotThrow(() => assertEncryptionKey({ FUNCTIONS_EMULATOR: 'true' }));
});
test('encrypting and decrypting refuse to run on the built-in fallback key', () => {
  const saved = { e: process.env.FUNCTIONS_EMULATOR, k: process.env.ENCRYPTION_KEY };
  delete process.env.FUNCTIONS_EMULATOR; delete process.env.ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptStep({ a: 1 }), e => e.code === 'failed-precondition');
    assert.throws(() => decryptStep('x.y.z'), e => e.code === 'failed-precondition');
    process.env.FUNCTIONS_EMULATOR = 'true';
    assert.deepEqual(decryptStep(encryptStep({ a: 1 })), { a: 1 });
  } finally {
    if (saved.e === undefined) delete process.env.FUNCTIONS_EMULATOR; else process.env.FUNCTIONS_EMULATOR = saved.e;
    if (saved.k !== undefined) process.env.ENCRYPTION_KEY = saved.k;
  }
});
