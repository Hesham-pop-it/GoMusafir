const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createAccountCleanup } = require('../services/accountCleanupService');
const { createFakeDb, createFakeBucket, createFakeAuth } = require('./support/fakeDb');
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const seed = () => ({
  orgs: {
    org: { staff: { owner: 'admin', c1: 'co-host' }, payments: { p: { amount: 1 } }, metadata: { stripe_customer_id: 'cus_org' },
      trips: { trip: { title: 'T' } } },
    other: { staff: { o2: 'admin' }, trips: { otherTrip: { title: 'O' } } },
  },
  trips_orgs: { trip: 'org', otherTrip: 'other' },
  trips_participants: { trip: { self: true, single: true, shared: true }, otherTrip: { shared: true } },
  app_access: { self: { x: 1 }, single: { x: 1 } },
  users: {
    self: { joined_trips: { trip: { org_id: 'org' } }, stripe_customer_id: 'cus_self' },
    single: { joined_trips: { trip: { org_id: 'org' } } },
    shared: { joined_trips: { trip: { org_id: 'org' }, otherTrip: { org_id: 'other' } } },
    c1: { staff_org_id: 'org' },
    owner: { staff_org_id: 'org' },
    o2: { staff_org_id: 'other' },
  },
  trips_active: {
    org: { trip: {
      locations: { self: { lat: 1 }, single: { lat: 1 } },
      chat: { m1: { sender_id: 'single', sender_name: 'Single', avatar: 'a', text: 'hi' } },
    } },
  },
});
function fixture({ cleanupFails = false, purgeFails = false } = {}) {
  const calls = []; const logs = []; const purged = []; let options;
  const noop = async () => {};
  const db = createFakeDb(seed());
  const bucket = createFakeBucket();
  const authFake = createFakeAuth({ self: {}, single: {}, shared: {}, c1: {}, owner: {}, o2: {} });
  const realRef = db.ref;
  const guardedDb = { ref: key => {
    const r = realRef(key);
    if (cleanupFails) r.update = async () => { calls.push('profile'); throw new Error('RTDB unavailable'); };
    return r;
  } };
  const svc = createAccountCleanup({ db: guardedDb, bucket, auth: authFake, now: () => 1 });
  const auth = { deleteUser: async uid => { calls.push(`auth:${uid}`); }, };
  const dependencies = {
    '../services/participantAccessService': {},
    'firebase-functions/v2': {},
    'firebase-functions/v2/https': { HttpsError },
    '../middleware/participantAccessMiddleware': { onCall: (opts, handler) => {
      if (handler.toString().includes('Account deletion failed')) options = opts;
      return handler;
    } },
    'firebase-functions/v2/identity': { beforeUserCreated: noop, beforeUserSignedIn: noop },
    '../admin': { admin: { database: { ServerValue: { TIMESTAMP: 'TS' } } }, auth, db: guardedDb },
    '../services/kmsService': {},
    '../services/auditService': { writeAuditLog: async (orgId, entry) => logs.push({ orgId, ...entry }) },
    '../services/accountCleanupService': { getAccountCleanup: () => svc },
    '../middleware/appCheckMiddleware': { verifyAppCheck: noop,
      requireAuth: request => { if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in'); },
      requireRole: (request, roles) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in');
        if (!roles.includes(request.auth.token.role)) throw new HttpsError('permission-denied', 'role');
      } },
    '../services/emailService': {}, '../services/emailOtpService': { createEmailOtpService: () => ({}), generateCode: () => '' }, '../services/notificationService': {},
    '../services/stripeService': { deleteStripeCustomer: async () => calls.push('stripe-delete') },
    '../services/passport/passportRetention': { purgePerson: async (uid, joined) => {
      purged.push([uid, Object.keys(joined)]); if (purgeFails) throw new Error('storage unavailable');
    } },
    crypto: require('node:crypto'),
  };
  const module = { exports: {} };
  const errorLogs = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../groups/authFunctions.js'), 'utf8'), {
    module, exports: module.exports, require: key => {
      if (!(key in dependencies)) throw Error(`Unexpected dependency ${key}`);
      return dependencies[key];
    }, console: { error: (...args) => errorLogs.push(args), warn: (...args) => errorLogs.push(args) },
  });
  return { exports: module.exports, calls, logs, errorLogs, purged, db, bucket, options: () => options,
    self: (request = { auth: { uid: 'self', token: {} } }) => module.exports.deleteMyAccount(request),
    admin: targetUid => module.exports.deleteUserGlobally({ auth: { uid: 'owner', token: { role: 'admin', orgId: 'org' } }, data: { targetUid } }) };
}
test('self deletion uses the fresh identity gate without requiring a current trip', async () => {
  const f = fixture(); assert.equal(f.options().enrollment, true);
  await f.self();
  assert.deepEqual(f.calls, ['auth:self']);
  const d = f.db.dump();
  assert.equal(d.users.self, undefined);
  assert.equal(d.app_access.self, undefined);
  assert.equal(d.trips_active.org.trip.locations.self, undefined);
  assert.equal(d.trips_participants.trip.self, undefined);
  assert.ok(!f.calls.includes('stripe-delete'));
  assert.equal(d.orgs.org.payments.p.amount, 1);
  assert.equal(d.orgs.org.metadata.stripe_customer_id, 'cus_org');
});
test('self deletion takes the passport data with the account', async () => {
  const f = fixture();
  await f.self();
  assert.deepEqual(f.purged, [['self', ['trip']]]);
});
test('a failed passport purge is logged and never blocks the account deletion', async () => {
  const f = fixture({ purgeFails: true });
  assert.equal((await f.self()).success, true);
  assert.ok(f.calls.includes('auth:self'));
  assert.equal(f.errorLogs[0][0], 'Passport purge failed during account deletion');
});
test('admin removal of a shared user purges only this organisation\'s passport data', async () => {
  const f = fixture();
  await f.admin('shared');
  assert.deepEqual(f.purged, [['shared', ['trip']]]);
});
test('no deletion path references the Stripe delete helper', () => {
  for (const file of ['authFunctions.js', 'orgFunctions.js', 'tripFunctions.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../groups', file), 'utf8');
    assert.ok(!/deleteStripeCustomer/.test(source), `${file} still deletes Stripe customers`);
  }
});
test('RTDB cleanup failure stops Auth deletion and produces an actionable error', async () => {
  const f = fixture({ cleanupFails: true });
  await assert.rejects(f.self(), error => error.code === 'internal' && error.message.includes('Please try again'));
  assert.ok(!f.calls.includes('auth:self'));
  assert.equal(f.errorLogs[0][1].stage, 'profile-cleanup');
});
test('unauthenticated calls cannot delete an account', async () => {
  const f = fixture();
  await assert.rejects(f.self({}), { code: 'unauthenticated' });
  assert.deepEqual(f.calls, []);
});
test('an owner deleting their account soft-deletes the organisation and keeps its payment data', async () => {
  const f = fixture();
  await f.self({ auth: { uid: 'owner', token: { role: 'admin', orgId: 'org' } } });
  const d = f.db.dump();
  assert.equal(d.orgs.org.metadata.deleted_at, 'TS');
  assert.equal(d.orgs.org.staff.owner, undefined);
  assert.equal(d.orgs.org.payments.p.amount, 1);
  assert.deepEqual(f.logs.map(l => l.action), ['ORG_DELETED_BY_OWNER']);
  assert.ok(f.calls.includes('auth:owner'));
});
test('admin removal of a single-org user wipes the account and anonymises chat', async () => {
  const f = fixture();
  const result = await f.admin('single');
  assert.equal(result.scope, 'account');
  assert.ok(f.calls.includes('auth:single'));
  const d = f.db.dump();
  assert.equal(d.users.single, undefined);
  assert.equal(d.trips_active.org.trip.chat.m1.sender_name, 'Deleted user');
  assert.equal(d.trips_active.org.trip.chat.m1.avatar, undefined);
  assert.equal(f.logs[0].action, 'USER_DELETED_GLOBALLY');
});
test('admin removal of a user who also belongs to another org only removes this org and keeps the account', async () => {
  const f = fixture();
  const result = await f.admin('shared');
  assert.equal(result.scope, 'org_only');
  assert.ok(!f.calls.includes('auth:shared'));
  const d = f.db.dump();
  assert.ok(d.users.shared);
  assert.equal(d.users.shared.joined_trips.trip, undefined);
  assert.ok(d.users.shared.joined_trips.otherTrip);
  assert.ok(d.trips_participants.otherTrip.shared);
  assert.equal(f.logs[0].action, 'USER_REMOVED_FROM_ORG');
});
test('admin removal of a co-host who has no other memberships deletes the account and staff record', async () => {
  const f = fixture();
  await f.admin('c1');
  const d = f.db.dump();
  assert.equal(d.orgs.org.staff.c1, undefined);
  assert.equal(d.users.c1, undefined);
  assert.ok(f.calls.includes('auth:c1'));
});
test('admin cannot remove users of another org, themselves, or the owner', async () => {
  const f = fixture();
  await assert.rejects(f.admin('o2'), { code: 'permission-denied' });
  await assert.rejects(f.admin('owner'), { code: 'failed-precondition' });
  await assert.rejects(f.exports.deleteUserGlobally({ auth: { uid: 'c1', token: { role: 'admin', orgId: 'org' } }, data: { targetUid: 'owner' } }),
    error => error.code === 'failed-precondition' && /owner/.test(error.message));
  await assert.rejects(f.admin(''), { code: 'invalid-argument' });
  assert.deepEqual(f.calls, []);
  assert.equal(f.logs.length, 0);
});
test('non admins cannot call deleteUserGlobally and it no longer crashes on requireRole', async () => {
  const f = fixture();
  await assert.rejects(f.exports.deleteUserGlobally({ auth: { uid: 'c1', token: { role: 'co-host', orgId: 'org' } }, data: { targetUid: 'single' } }),
    { code: 'permission-denied' });
});
