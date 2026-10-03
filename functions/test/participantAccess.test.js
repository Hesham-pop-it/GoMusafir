const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(overrides = {}) {
  const now = Date.now();
  const data = {
    users: { p: { joined_trips: { t: { org_id: 'o' } } } },
    orgs: { o: { trips: { t: { status: 'active', end_date: now + 60000 } }, staff: {} } },
    trips_participants: { t: { p: true } }, trips_orgs: { t: 'o' },
    app_access: { p: { expires_at: now + 60000, revoked_before: 0 } },
    ...overrides,
  };
  let beforeTransaction;
  const revocations = [];
  const record = { customClaims: {}, tokensValidAfterTime: new Date(0).toISOString() };
  const read = key => key.split('/').reduce((node, part) => node?.[part], data);
  const write = (key, value) => {
    const parts = key.split('/');const leaf = parts.pop();
    const parent = parts.reduce((node, part) => node[part] ||= {}, data);
    parent[leaf] = value;
  };
  const adminMock = {
    auth: { getUser: async () => record, revokeRefreshTokens: async uid => revocations.push(uid) },
    db: { ref: key => ({ get: async () => ({ val: () => read(key), exists: () => read(key) != null }),
      on: (_event, callback) => callback(), off() {},
      set: async value => write(key, value), remove: async () => write(key, null),
      transaction: async callback => {
        if (beforeTransaction) { const hook = beforeTransaction; beforeTransaction = null; hook(); }
        const value = callback(read(key) ?? null);
        if (value !== undefined) write(key, value);
        return { committed: value !== undefined, snapshot: { val: () => read(key) } };
      } }) },
    admin: {},
  };
  class HttpsError extends Error { constructor(code, message) { super(message);this.code = code; } }
  const sandbox = { module: { exports: {} }, require: name => {
    if (name === '../admin') return adminMock;
    if (name === './guardedTransaction') return require('../services/guardedTransaction');
    if (name === 'firebase-functions/v2/https') return { HttpsError };
    throw new Error(`Unexpected import ${name}`);
  }, Date, Math, Number, Object };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/participantAccessService.js'), 'utf8'), sandbox);
  return { api: sandbox.module.exports, data, record, revocations,
    beforeTransaction: callback => { beforeTransaction = callback; },
    request: { auth: { uid: 'p', token: { auth_time: Math.floor(now / 1000) } } } };
}

test('validity requires active status and a finite future end timestamp', () => {
  const { api } = fixture();
  for (const trip of [null, {}, { status: 'active' }, { status: 'active', end_date: '200' },
    { status: 'active', end_date: 100 }, { status: 'closed', end_date: 200 },
    { status: 'ended', end_date: 200 }, { status: 'cancelled', end_date: 200 }]) {
    assert.equal(api.tripExpiry(trip, 100), 0);
  }
  assert.equal(api.tripExpiry({ status: 'active', end_date: 101 }, 100), 101);
});
test('active membership admits app and trip access', async () => {
  const f = fixture();
  assert.ok((await f.api.requireAppAccess(f.request)).expires_at > Date.now());
  assert.equal((await f.api.requireTripAccess(f.request, 't')).orgId, 'o');
});
test('cached authenticated session is rejected immediately at time expiry, before cron runs', async () => {
  const f = fixture();f.data.orgs.o.trips.t.end_date = Date.now() - 1;
  await assert.rejects(f.api.requireAppAccess(f.request), { code: 'permission-denied' });
  await assert.rejects(f.api.requireTripAccess(f.request, 't'), { code: 'permission-denied' });
});
test('closing last trip revokes once, publishes deny, and preserves account and profile', async () => {
  const f = fixture();const user = f.data.users.p;f.data.orgs.o.trips.t.status = 'closed';
  const value = await f.api.refreshAccess('p');
  assert.equal(value.expires_at, 0);
  assert.equal(f.data.users.p, user);
  assert.equal(f.revocations.length, 1);
  assert.equal(f.data.app_access.p.expires_at, 0);
  await f.api.refreshAccess('p');
  assert.equal(f.revocations.length, 1);
  await assert.rejects(f.api.requireFreshIdentity(f.request), { code: 'unauthenticated' });
});
test('another valid trip preserves access and session; expired alternatives do not', async () => {
  const f = fixture();f.data.orgs.o.trips.t.status = 'closed';
  f.data.orgs.o.trips.next = { status: 'active', end_date: Date.now() + 60000 };
  f.data.users.p.joined_trips.next = { org_id: 'o' };f.data.trips_participants.next = { p: true };
  assert.ok((await f.api.refreshAccess('p')).expires_at > Date.now());
  assert.equal(f.revocations.length, 0);
  f.data.orgs.o.trips.next.end_date = Date.now() - 1;
  assert.equal((await f.api.refreshAccess('p')).expires_at, 0);
  assert.equal(f.revocations.length, 1);
});
test('joining a future valid trip reuses the account but does not resurrect old sessions', async () => {
  const f = fixture();f.data.orgs.o.trips.t.status = 'ended';
  await f.api.refreshAccess('p');
  f.data.orgs.o.trips.t = { status: 'active', end_date: Date.now() + 60000 };
  const access = await f.api.refreshAccess('p');
  await assert.rejects(f.api.requireAppAccess(f.request), { code: 'unauthenticated' });
  f.request.auth.token.auth_time = access.revoked_before;
  assert.ok((await f.api.requireAppAccess(f.request)).expires_at > 0);
});
test('forged profile staff flags and joined lists without membership do not grant access', async () => {
  const f = fixture();f.data.users.p.staff_org_id = 'o';delete f.data.trips_participants.t.p;
  await assert.rejects(f.api.requireAppAccess(f.request), { code: 'permission-denied' });
});
test('staff exemption requires trusted claims and real staff membership', async () => {
  const f = fixture();f.data.users.p.joined_trips = {};
  f.record.customClaims = { role: 'admin', orgId: 'o' };
  await assert.rejects(f.api.requireAppAccess(f.request), { code: 'permission-denied' });
  f.data.orgs.o.staff.p = 'admin';
  assert.equal((await f.api.requireAppAccess(f.request)).staff, true);
});
test('explicit session revocation is enforced even while trip remains valid', async () => {
  const f = fixture();f.record.tokensValidAfterTime = new Date(Date.now() + 10000).toISOString();
  await assert.rejects(f.api.requireAppAccess(f.request), { code: 'unauthenticated' });
});

test('legacy participant with no access record is revoked on first reconciliation', async () => {
  const f = fixture({ app_access: {} });f.data.orgs.o.trips.t.status = 'closed';
  await f.api.refreshAccess('p');
  assert.equal(f.revocations.length, 1);
  assert.equal(f.data.app_access.p.participant, true);
});
test('a pending revocation is completed on reconciliation', async () => {
  const f = fixture();f.data.orgs.o.trips.t.status = 'closed';
  f.data.app_access.p.revocation_pending = true;
  const result = await f.api.refreshAccess('p');
  assert.equal(result.revocation_pending, false);
  assert.equal(f.revocations.length, 1);
});
test('a concurrent refresh forces recalculation instead of restoring revoked access', async () => {
  const f = fixture();
  f.beforeTransaction(() => {
    f.data.orgs.o.trips.t.status = 'closed';
    f.data.app_access.p = { version: 100, participant: true, expires_at: 0, revoked_before: 9999999999 };
  });
  const value = await f.api.refreshAccess('p');
  assert.equal(value.version, 101);
  assert.equal(value.expires_at, 0);
  assert.equal(value.revoked_before, 9999999999);
});

test('first access refresh creates the RTDB record using only Realtime Database', async () => {
  const f = fixture({ app_access: {} });
  const value = await f.api.refreshAccess('p');
  assert.equal(value.version, 1);
  assert.ok(value.trips.t > Date.now());
  assert.equal(f.data.app_access.p, value);
});

for (const role of ['admin', 'co-host', 'manager']) {
  for (const status of ['active', 'ended', 'closed', 'cancelled']) {
    test(`${role} retains app access and session with only a ${status} expired trip`, async () => {
      const f = fixture();
      f.record.customClaims = {role, orgId:'o'};
      f.data.orgs.o.staff.p = role;
      f.data.orgs.o.trips.t = {status, end_date: Date.now()-1000};
      f.data.app_access.p.revocation_pending = true;
      assert.equal((await f.api.requireAppAccess(f.request)).staff, true);
      const result = await f.api.refreshAccess('p');
      assert.equal(result.staff, true);
      assert.equal(result.revocation_pending, false);
      assert.equal(f.revocations.length, 0);
      assert.ok(f.data.users.p);
    });
  }
  test(`${role} needs no joined trips to use the app`, async () => {
    const f=fixture(); f.data.users.p.joined_trips={};
    f.record.customClaims={role,orgId:'o'};f.data.orgs.o.staff.p=role;
    assert.equal((await f.api.requireAppAccess(f.request)).staff,true);
    assert.equal((await f.api.refreshAccess('p')).staff,true);
    assert.equal(f.revocations.length,0);
  });
}
