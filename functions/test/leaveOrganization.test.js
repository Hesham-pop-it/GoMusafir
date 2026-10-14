const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function fixture({ staffRole = 'co-host', claims = { role: 'co-host', orgId: 'org', locale: 'nl' } } = {}) {
  const calls = []; const logs = []; let claimsSet; let updates;
  const noop = async () => {};
  const dependencies = {
    'firebase-functions/v2/https': { HttpsError },
    '../middleware/participantAccessMiddleware': { onCall: (opts, handler) => handler },
    '../admin': {
      admin: { database: { ServerValue: { TIMESTAMP: 0 } } },
      db: { ref: () => ({
        get: async () => ({ exists: () => staffRole != null, val: () => staffRole }),
        update: async value => { calls.push('db-update'); updates = value; },
      }) },
      auth: {
        getUser: async () => ({ customClaims: { ...claims } }),
        setCustomUserClaims: async (uid, value) => { calls.push('claims'); claimsSet = value; },
        revokeRefreshTokens: async uid => calls.push(`revoke:${uid}`),
        deleteUser: async () => calls.push('auth-delete'),
      },
    },
    '../services/kmsService': {}, '../services/accountCleanupService': { getAccountCleanup: () => ({ markOrganizationDeleted: async () => {} }) },
    '../services/auditService': { writeAuditLog: async (orgId, entry) => logs.push({ orgId, ...entry }) },
    '../middleware/appCheckMiddleware': {
      verifyAppCheck: noop,
      requireAuth: request => { if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in'); },
      requireRole: noop,
    },
    '../middleware/validateSchema': { validate: noop, schemas: {} },
    uuid: { v4: () => 'id' }, crypto: require('node:crypto'),
    '../services/emailService': {}, '../services/notificationService': {}, '../services/stripeService': {},
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../groups/orgFunctions.js'), 'utf8'), {
    module, exports: module.exports, console,
    require: key => { if (!(key in dependencies)) throw Error(`Unexpected dependency ${key}`); return dependencies[key]; },
  });
  return {
    run: request => module.exports.leaveOrganization(request),
    calls, logs, updates: () => JSON.parse(JSON.stringify(updates)), claims: () => JSON.parse(JSON.stringify(claimsSet)),
  };
}
const asStaff = role => ({ auth: { uid: 'u1', token: { role, orgId: 'org' } } });

test('a co-host leaves: staff record, staff_org_id and claims go, tokens are revoked, audit is written', async () => {
  const f = fixture();
  assert.equal((await f.run(asStaff('co-host'))).success, true);
  assert.deepEqual(f.updates(), { 'orgs/org/staff/u1': null, 'users/u1/staff_org_id': null });
  assert.deepEqual(f.claims(), { locale: 'nl' });
  assert.deepEqual(f.calls, ['db-update', 'claims', 'revoke:u1']);
  assert.equal(f.logs.length, 1);
  assert.equal(f.logs[0].action, 'STAFF_LEFT');
  assert.equal(f.logs[0].byUid, 'u1');
  assert.equal(f.logs[0].targetId, 'u1');
  assert.ok(!f.calls.includes('auth-delete'), 'the account must be kept');
});
test('a manager can leave too', async () => {
  const f = fixture({ staffRole: 'manager', claims: { role: 'manager', orgId: 'org' } });
  await f.run(asStaff('manager'));
  assert.deepEqual(f.claims(), {});
});
test('the owner cannot leave and nothing is changed', async () => {
  const f = fixture({ staffRole: 'admin' });
  await assert.rejects(f.run(asStaff('admin')), error => error.code === 'failed-precondition' && /owner cannot leave/.test(error.message));
  assert.deepEqual(f.calls, []);
  assert.equal(f.logs.length, 0);
});
test('a stale co-host token whose staff record says admin is still refused', async () => {
  const f = fixture({ staffRole: 'admin' });
  await assert.rejects(f.run(asStaff('co-host')), { code: 'failed-precondition' });
  assert.deepEqual(f.calls, []);
});
test('someone without an organization or a staff record cannot call it', async () => {
  await assert.rejects(fixture().run({ auth: { uid: 'u1', token: {} } }), { code: 'failed-precondition' });
  await assert.rejects(fixture({ staffRole: null }).run(asStaff('co-host')), { code: 'failed-precondition' });
});
test('unauthenticated calls are rejected', async () => {
  await assert.rejects(fixture().run({}), { code: 'unauthenticated' });
});
