const test = require('node:test');
const assert = require('node:assert/strict');
const { signalChat, signalVoice, signalNotifications } = require('../services/tripSignals');

function fakeDb() {
  const writes = [];
  return { writes, ref: path => ({ set: async value => writes.push([path, value]) }) };
}

test('a new chat message moves the trip chat signal to that message id', async () => {
  const db = fakeDb();
  await signalChat(db, 'o', 't', 'm1');
  await signalChat(db, 'o', 't', 'm2');
  assert.deepEqual(db.writes, [['trips_active/o/t/chat_signal', 'm1'], ['trips_active/o/t/chat_signal', 'm2']]);
});

test('voice and notification signals carry only an event id, notifications per person', async () => {
  const db = fakeDb();
  await signalVoice(db, 'o', 't', 'e1');
  await signalNotifications(db, 'o', 't', 'u1', 'e2');
  assert.deepEqual(db.writes, [['trips_active/o/t/voice_signal', 'e1'], ['trips_active/o/t/notification_signal/u1', 'e2']]);
});
