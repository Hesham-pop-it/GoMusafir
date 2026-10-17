const test = require('node:test');
const assert = require('node:assert/strict');
const { pruneExpiredNotifications, BATCH } = require('../services/notificationPrune');

function fakeDb(index) {
  const updates = [];
  return { updates, ref: path => path === undefined
    ? { update: async value => { updates.push(value); for (const k of Object.keys(value)) if (k.startsWith('notification_expiry/')) delete index[k.split('/')[1]]; } }
    : { orderByChild(field) { assert.equal(field, 'at'); return this; }, endAt(v) { this.max = v; return this; }, limitToFirst(n) { this.n = n; return this; },
        get: async function () {
          const keys = Object.keys(index).filter(k => index[k].at <= this.max).slice(0, this.n);
          return { forEach: fn => keys.forEach(key => fn({ key, val: () => index[key] })) };
        } } };
}

test('expired records and their index entries are removed, live ones stay', async () => {
  const index = { a: { at: 10, path: 'trips_active/o/t/notifications/u/a' }, b: { at: 20, path: 'users/u/notifications/b' }, c: { at: 999, path: 'users/u/notifications/c' } };
  const db = fakeDb(index);
  assert.equal(await pruneExpiredNotifications(db, 100), 2);
  assert.deepEqual(db.updates, [{ 'notification_expiry/a': null, 'trips_active/o/t/notifications/u/a': null, 'notification_expiry/b': null, 'users/u/notifications/b': null }]);
  assert.deepEqual(Object.keys(index), ['c']);
});

test('an index entry with an odd path is dropped without deleting anything else', async () => {
  const db = fakeDb({ a: { at: 1, path: 'orgs/x' } });
  await pruneExpiredNotifications(db, 100);
  assert.deepEqual(db.updates, [{ 'notification_expiry/a': null }]);
});

test('large backlogs go in batches', async () => {
  const index = {};
  for (let i = 0; i < BATCH + 5; i++) index[`k${i}`] = { at: 1, path: `users/u/notifications/k${i}` };
  const db = fakeDb(index);
  assert.equal(await pruneExpiredNotifications(db, 100), BATCH + 5);
  assert.equal(db.updates.length, 2);
});
