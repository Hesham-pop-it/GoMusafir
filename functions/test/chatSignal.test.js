const test = require('node:test');
const assert = require('node:assert/strict');
const { signalChat } = require('../services/chatSignal');

test('a new chat message moves the trip chat signal to that message id', async () => {
  const writes = [];
  const db = { ref: path => ({ set: async value => writes.push([path, value]) }) };
  await signalChat(db, 'o', 't', 'm1');
  await signalChat(db, 'o', 't', 'm2');
  assert.deepEqual(writes, [['trips_active/o/t/chat_signal', 'm1'], ['trips_active/o/t/chat_signal', 'm2']]);
});
