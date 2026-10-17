const test = require('node:test');
const assert = require('node:assert/strict');
const { createPushGate } = require('../services/pushGate');
const { createFakeDb } = require('./support/fakeDb');

const gate = (data, clock = { t: 0 }) => {
  const db = createFakeDb(data); let reads = 0;
  const counting = { ref: p => { const r = db.ref(p); const get = r.get; r.get = async () => { reads++; return get(); }; return r; } };
  return { g: createPushGate({ db: counting, now: () => clock.t }), reads: () => reads, db, clock };
};
test('pushes to an account scheduled for deletion are dropped, others pass', async () => {
  const { g } = gate({ account_deletions: { gone: { purge_after: 1 } } });
  assert.equal(await g.blocked('gone'), true);
  assert.equal(await g.blocked('fine'), false);
});
test('pushes about a deleted organisation are dropped, by org id or by trip', async () => {
  const { g } = gate({ orgs: { dead: { metadata: { deleted_at: 5 } }, live: { metadata: { name: 'x' } } }, trips_orgs: { t1: 'dead', t2: 'live' } });
  assert.equal(await g.blocked('u', { orgId: 'dead' }), true);
  assert.equal(await g.blocked('u', { tripId: 't1' }), true);
  assert.equal(await g.blocked('u', { orgId: 'live' }), false);
  assert.equal(await g.blocked('u', { tripId: 't2' }), false);
  assert.equal(await g.blocked('u', {}), false);
});
test('answers are cached for a minute and then re-read, so a restore takes effect', async () => {
  const { g, reads, db, clock } = gate({ orgs: { o: { metadata: { deleted_at: 5 } } } });
  assert.equal(await g.blocked('u', { orgId: 'o' }), true);
  const first = reads();
  await g.blocked('u', { orgId: 'o' });
  assert.equal(reads(), first);
  await db.ref('orgs/o/metadata/deleted_at').remove();
  clock.t += 61000;
  assert.equal(await g.blocked('u', { orgId: 'o' }), false);
});
