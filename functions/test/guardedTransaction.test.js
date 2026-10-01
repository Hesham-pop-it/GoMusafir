const test = require('node:test');
const assert = require('node:assert/strict');
const { guardedTransaction } = require('../services/guardedTransaction');
const { answer } = require('../services/voiceInactivityState');

test('a host response reads the pending prompt on a cold transaction cache', async () => {
  let listening = false;
  let value = { status: 'pending', id: 'question', roomSid: 'room' };
  const reference = {
    on(event, callback) { listening = true; callback(); },
    off() { listening = false; },
    async transaction(change) {
      const next = change(listening ? value : null);
      if (next !== undefined) value = next;
      return { committed: next !== undefined };
    },
  };
  const result = await guardedTransaction(reference, current => answer(current, 'question', false, 1000, true, 'host'));
  assert.equal(result.committed, true);
  assert.equal(value.status, 'ending');
  assert.equal(listening, false);
});

test('retry callback errors reject the request without escaping the SDK event loop', async () => {
  let detached = false;
  const expected = new Error('Timer not due yet');
  const reference = {
    on(event, callback) { callback(); },
    off() { detached = true; },
    async transaction(change) {
      change(null);
      await new Promise(resolve => setImmediate(resolve));
      assert.doesNotThrow(() => assert.equal(change({ status: 'timing' }), undefined));
      return { committed: false };
    },
  };
  await assert.rejects(guardedTransaction(reference, current => {
    if (current) throw expected;
    return {};
  }), error => error === expected);
  assert.equal(detached, true);
});
