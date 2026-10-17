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
function fixture({ serviceFails = null } = {}) {
  const calls = []; const logs = []; let options; const requests = [];
  const noop = async () => {};
  const db = createFakeDb(seed());
  const bucket = createFakeBucket();
  const authFake = createFakeAuth({ self: {}, single: {}, shared: {}, c1: {}, owner: {}, o2: {} });
  const realRef = db.ref;
  const guardedDb = { ref: key => realRef(key) };
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
    '../admin': { admin: { database: { ServerValue: { TIMESTAMP: 'TS' } }, auth: () => ({ updateUser: async () => {} }) }, auth, db: guardedDb },
    '../services/kmsService': {},
    '../services/auditService': { writeAuditLog: async (orgId, entry) => logs.push({ orgId, ...entry }) },
    '../services/accountCleanupService': { getAccountCleanup: () => svc },
    '../services/deletionService': { getDeletionService: () => ({
      requestAccountDeletion: async args => { requests.push(args); if (serviceFails) throw serviceFails; return { success: true, purge_after: 42 }; },
      stampEmailCodeVerified: async uid => calls.push(`stamp:${uid}`),
    }) },
    '../middleware/appCheckMiddleware': { verifyAppCheck: noop,
      requireAuth: request => { if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in'); },
      requireRole: (request, roles) => {
        if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in');
        if (!roles.includes(request.auth.token.role)) throw new HttpsError('permission-denied', 'role');
      } },
    '../services/emailService': {}, '../services/emailOtpService': { createEmailOtpService: () => ({ checkCode: async () => ({ outcome: 'ok' }) }), generateCode: () => '' }, '../services/notificationService': {},
    '../services/stripeService': { deleteStripeCustomer: async () => calls.push('stripe-delete') },
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
  return { exports: module.exports, calls, logs, errorLogs, requests, db, bucket, options: () => options,
    self: (request = { auth: { uid: 'self', token: {} } }) => module.exports.deleteMyAccount(request),
    admin: targetUid => module.exports.deleteUserGlobally({ auth: { uid: 'owner', token: { role: 'admin', orgId: 'org' } }, data: { targetUid } }) };
}
test('deleteMyAccount is an enrollment-class request that hands the sign-in time and organisation to the deletion service', async () => {
  const f = fixture(); assert.equal(f.options().enrollment, true);
  assert.deepEqual([...f.options().secrets], ['SENDGRID_API_KEY']);
  const out = await f.self({ auth: { uid: 'self', token: { auth_time: 7, orgId: 'org' } }, rawRequest: { ip: '1.1.1.1' } });
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests)), [{ uid: 'self', claimOrgId: 'org', authTime: 7, ip: '1.1.1.1' }]);
  // older builds only look for success and then sign out
  assert.equal(out.success, true);
  assert.deepEqual(f.calls, [], 'nothing is deleted at request time');
  assert.deepEqual(f.db.dump().users.self.stripe_customer_id, 'cus_self');
});
test('no deletion path references the Stripe delete helper', () => {
  for (const file of ['authFunctions.js', 'orgFunctions.js', 'tripFunctions.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../groups', file), 'utf8');
    assert.ok(!/deleteStripeCustomer/.test(source), `${file} still deletes Stripe customers`);
  }
});
test('an unexpected failure becomes an actionable error, a deliberate one passes through unchanged', async () => {
  const f = fixture({ serviceFails: new Error('RTDB unavailable') });
  await assert.rejects(f.self(), error => error.code === 'internal' && error.message.includes('Please try again'));
  assert.equal(f.errorLogs[0][0], 'Account deletion failed');
  const blocked = Object.assign(new HttpsError('failed-precondition', 'You own an organisation.'), { details: { reason: 'owns-organization' } });
  const g = fixture({ serviceFails: blocked });
  await assert.rejects(g.self(), error => error === blocked);
});
test('unauthenticated calls cannot delete an account', async () => {
  const f = fixture();
  await assert.rejects(f.self({}), { code: 'unauthenticated' });
  assert.deepEqual(f.requests, []);
});
test('a verified email code stamps the re-confirmation only when asked for the delete purpose', async () => {
  const f = fixture();
  const verify = data => f.exports.verifyCustomEmailOTP({ auth: { uid: 'self', token: { email: 'p@example.test' } }, data });
  await verify({ otp: '123456' });
  assert.deepEqual(f.calls, []);
  await verify({ otp: '123456', purpose: 'delete_account' });
  assert.deepEqual(f.calls, ['stamp:self']);
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
