const test = require('node:test');
const assert = require('node:assert/strict');
const { isDue, queueEntry, selectDue, chatMessageFor, alertNotificationFor, broadcastTargets, queueKey, tripEnded, CHAT_KEY } = require('../services/scheduledAnnouncementService');

const now = 1_800_000_000_000;
const item = (over = {}) => ({ text: 'Bus leaves at 8', send_at: now - 1, created_by: 'u1', created_at: now - 9, mode: 'time', status: 'pending', ...over });

test('only pending items whose send time has arrived are due', () => {
  assert.equal(isDue(item(), now), true);
  assert.equal(isDue(item({ send_at: now }), now), true);
  assert.equal(isDue(item({ send_at: now + 1 }), now), false);
  assert.equal(isDue(item({ status: 'sent' }), now), false);
  assert.equal(isDue(item({ status: 'cancelled' }), now), false);
});

test('malformed items are never due', () => {
  for (const bad of [null, undefined, {}, item({ send_at: 'soon' }), item({ text: '   ' }), item({ text: 5 })]) {
    assert.equal(isDue(bad, now), false);
  }
});

test('queue entries exist only for pending items with a numeric send time', () => {
  assert.deepEqual(queueEntry('o', 't', item({ send_at: 5 }), 'i1'), { org_id: 'o', trip_id: 't', item_id: 'i1', send_at: 5 });
  assert.equal(queueEntry('o', 't', item({ status: 'sent' })), null);
  assert.equal(queueEntry('o', 't', item({ status: 'cancelled' })), null);
  assert.equal(queueEntry('o', 't', null), null);
  assert.equal(queueEntry('o', 't', item({ send_at: undefined })), null);
});

test('selectDue returns due entries oldest first and honours the limit', () => {
  const queue = {
    o_t_c: { org_id: 'o', trip_id: 't', item_id: 'c', send_at: now - 1 },
    o_t_a: { org_id: 'o', trip_id: 't', item_id: 'a', send_at: now - 30 },
    o2_t2_b: { org_id: 'o2', trip_id: 't2', item_id: 'b', send_at: now - 10 },
    o_t_later: { org_id: 'o', trip_id: 't', item_id: 'later', send_at: now + 1 },
    broken: { send_at: now - 5 },
    noitem: { org_id: 'o', trip_id: 't', send_at: now - 5 },
  };
  assert.deepEqual(selectDue(queue, now).map(d => d.id), ['a', 'b', 'c']);
  assert.deepEqual(selectDue(queue, now, 2).map(d => d.id), ['a', 'b']);
  assert.deepEqual(selectDue(queue, now)[1], { id: 'b', orgId: 'o2', tripId: 't2' });
  assert.deepEqual(selectDue(null, now), []);
});

test('the chat message has the shape of a staff template message in the app', () => {
  assert.deepEqual(chatMessageFor(item(), 'Saif', 'TS'), {
    type: 'text', text: 'Bus leaves at 8', sender_id: 'u1', sender_name: 'Saif', timestamp: 'TS',
  });
  assert.equal(chatMessageFor(item(), undefined, 1).sender_name, 'Admin');
});

test('queue keys include org, trip and item so the same item id in two trips never collides', () => {
  assert.equal(queueKey('o', 't', 'i'), 'o_t_i');
  assert.notEqual(queueKey('o', 't1', 'i'), queueKey('o', 't2', 'i'));
});

test('a trip is ended once its end date has arrived, whatever the date format', () => {
  assert.equal(tripEnded({ end_date: now }, now), true);
  assert.equal(tripEnded({ end_date: now - 1 }, now), true);
  assert.equal(tripEnded({ end_date: now + 1 }, now), false);
  assert.equal(tripEnded({ end_date: new Date(now - 1000).toISOString() }, now), true);
  assert.equal(tripEnded({ end_date: new Date(now + 1000).toISOString() }, now), false);
  for (const bad of [null, {}, { end_date: '' }, { end_date: 'soon' }]) assert.equal(tripEnded(bad, now), false);
});

test('only well-formed chat keys are reused', () => {
  for (const ok of ['-Nabc_123', 'fixedkey']) assert.equal(CHAT_KEY.test(ok), true);
  for (const bad of ['', 'a/b', 'a.b', '../x', 'x'.repeat(65), 'a b']) assert.equal(CHAT_KEY.test(bad), false);
});

test('the alert notification has the shape of a staff broadcast in the app', () => {
  assert.deepEqual(alertNotificationFor(item(), 'Saif', 5), { name: 'Saif', message: 'Bus leaves at 8', timestamp: 5, type: 'alert', senderUid: 'u1' });
  assert.equal(alertNotificationFor(item(), undefined, 5).name, 'Admin');
});

test('broadcast targets are unique string participants without the sender, from a map or an array', () => {
  assert.deepEqual(broadcastTargets({ u1: true, u2: true, u3: true }, 'u1'), ['u2', 'u3']);
  assert.deepEqual(broadcastTargets(['u2', null, 'u2', 'u1', 7], 'u1'), ['u2']);
  assert.deepEqual(broadcastTargets(null, 'u1'), []);
});
