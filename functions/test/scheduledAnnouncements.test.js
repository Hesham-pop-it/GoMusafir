const test = require('node:test');
const assert = require('node:assert/strict');
const { isDue, queueEntry, selectDue, chatMessageFor } = require('../services/scheduledAnnouncementService');

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
  assert.deepEqual(queueEntry('o', 't', item({ send_at: 5 })), { org_id: 'o', trip_id: 't', send_at: 5 });
  assert.equal(queueEntry('o', 't', item({ status: 'sent' })), null);
  assert.equal(queueEntry('o', 't', item({ status: 'cancelled' })), null);
  assert.equal(queueEntry('o', 't', null), null);
  assert.equal(queueEntry('o', 't', item({ send_at: undefined })), null);
});

test('selectDue returns due entries oldest first and honours the limit', () => {
  const queue = {
    c: { org_id: 'o', trip_id: 't', send_at: now - 1 },
    a: { org_id: 'o', trip_id: 't', send_at: now - 30 },
    b: { org_id: 'o2', trip_id: 't2', send_at: now - 10 },
    later: { org_id: 'o', trip_id: 't', send_at: now + 1 },
    broken: { send_at: now - 5 },
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
