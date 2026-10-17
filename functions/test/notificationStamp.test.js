const test = require('node:test');
const assert = require('node:assert/strict');
const { stampNotification, onlyStamped } = require('../services/notificationStamp');
const { resetTermsCache } = require('../services/notificationTerms');

function fakeDb(values = {}) {
  const updates = [];
  return { updates, ref: path => path === undefined
    ? { update: async value => updates.push(value) }
    : { get: async () => ({ val: () => values[path] ?? null }) } };
}
const DAY = 86400000;

test('a new record gets its end date and an index entry', async () => {
  resetTermsCache();
  const db = fakeDb();
  const until = await stampNotification(db, { orgId: 'o', tripId: 't', uid: 'u', notifId: 'n', record: { type: 'seat_update', timestamp: 100 } });
  assert.equal(until, 100 + 30 * DAY);
  const path = 'trips_active/o/t/notifications/u/n';
  assert.deepEqual(db.updates, [{ [`${path}/visible_until`]: until, 'notification_expiry/n': { at: until, path } }]);
});

test('an announcement ends with the trip when that is sooner', async () => {
  resetTermsCache();
  const db = fakeDb({ 'orgs/o/trips/t/end_date': 500 });
  const until = await stampNotification(db, { orgId: 'o', tripId: 't', uid: 'u', notifId: 'n', record: { type: 'alert', timestamp: 100 } });
  assert.equal(until, 500);
});

test('an open SOS is not stamped', async () => {
  resetTermsCache();
  const db = fakeDb();
  assert.equal(await stampNotification(db, { orgId: 'o', tripId: 't', uid: 'u', notifId: 'n', record: { type: 'emergency', timestamp: 1 } }), null);
  assert.deepEqual(db.updates, []);
});

test('onlyStamped recognises the stamp-only update', () => {
  assert.equal(onlyStamped({ a: 1 }, { a: 1, visible_until: 5 }), true);
  assert.equal(onlyStamped({ a: 1, read: false }, { a: 1, read: true, visible_until: 5 }), false);
  assert.equal(onlyStamped({ a: 1, visible_until: 4 }, { a: 1, visible_until: 5 }), false);
  assert.equal(onlyStamped({ a: 1 }, { a: 2 }), false);
});
