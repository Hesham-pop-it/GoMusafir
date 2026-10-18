const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpsError } = require('firebase-functions/v2/https');
const { resolveSos } = require('../services/sosService');
const { resetTermsCache } = require('../services/notificationTerms');

function fixture() {
  const state = {
    'orgs/o/staff': { s1: 'admin', s2: 'manager', s3: 'co-host', guide: 'other' },
    'trips_active/o/t/notifications/s1': { n1: { type: 'emergency', senderUid: 'p', timestamp: 5 }, x: { type: 'alert' } },
    'trips_active/o/t/notifications/s2': { n2: { type: 'emergency', senderUid: 'p', timestamp: 5 }, other: { type: 'emergency', senderUid: 'q', timestamp: 9 } },
    'trips_active/o/t/notifications/s3': { n3: { type: 'emergency', senderUid: 'p', timestamp: 5 } },
  };
  const updates = [];
  const db = { updates, ref: path => path === undefined ? { update: async v => updates.push(v) } : {
    get: async () => ({ val: () => { const hit = Object.entries(state).find(([k]) => path === k); if (hit) return hit[1];
      const parent = path.split('/').slice(0, -1).join('/'); return state[parent]?.[path.split('/').pop()] ?? null; }, forEach: fn => Object.entries(state[path] || {}).forEach(([key, v]) => fn({ key, val: () => v })) }),
    orderByChild() { return { equalTo: () => ({ get: async () => ({ forEach: fn => Object.entries(state[path] || {}).filter(([, v]) => v.type === 'emergency').forEach(([key, v]) => fn({ key, val: () => v })) }) }) }; },
  } };
  return { db, updates };
}
const call = (f, uid, staff, data = { tripId: 't', notificationId: 'n1' }) =>
  resolveSos({ auth: { uid }, data }, { db: f.db, access: async () => ({ orgId: 'o', staff }) });

test('staff resolve every copy of the same SOS and each stays 24 hours', async () => {
  resetTermsCache();
  const f = fixture();
  const result = await call(f, 's1', true);
  assert.equal(f.updates.length, 1);
  const u = f.updates[0];
  const base = 'trips_active/o/t/notifications';
  assert.equal(u[`${base}/s1/n1/resolved_by`], 's1');
  assert.equal(u[`${base}/s2/n2/resolved_at`], result.resolvedAt);
  assert.equal(u[`${base}/s3/n3/visible_until`], result.resolvedAt + 86400000);
  assert.equal(u[`${base}/s2/other/resolved_at`], undefined);
  assert.deepEqual(u['notification_expiry/n2'], { at: result.visibleUntil, path: `${base}/s2/n2` });
});

test('a pilgrim cannot resolve an SOS, and only emergencies can be resolved', async () => {
  const f = fixture();
  await assert.rejects(call(f, 'p', false), e => e.code === 'permission-denied');
  await assert.rejects(call(f, 's1', true, { tripId: 't', notificationId: 'x' }), e => e.code === 'not-found');
  await assert.rejects(call(f, 's1', true, { tripId: 't', notificationId: '../x' }), e => e.code === 'invalid-argument');
  assert.equal(f.updates.length, 0);
});
