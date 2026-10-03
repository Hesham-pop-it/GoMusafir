const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function fixture({ cleanupFails = false } = {}) {
  const calls = []; const logs = []; let options; let updates;
  const noop = async () => {};
  const dependencies = {
    '../services/participantAccessService': {},
    'firebase-functions/v2': {},
    'firebase-functions/v2/https': { HttpsError },
    '../middleware/participantAccessMiddleware': { onCall: (opts, handler) => {
      if (handler.toString().includes('Account deletion failed')) options = opts;
      return handler;
    } },
    'firebase-functions/v2/identity': { beforeUserCreated: noop, beforeUserSignedIn: noop },
    '../admin': {
      admin: { database: { ServerValue: { TIMESTAMP: 0 } } },
      auth: { deleteUser: async uid => calls.push(`auth:${uid}`) },
      db: { ref: key => ({
        get: async () => ({ exists: () => key.endsWith('joined_trips'), val: () => ({ trip: { org_id: 'org' }, legacy: null }) }),
        update: async value => { calls.push('profile'); if (cleanupFails) throw new Error('RTDB unavailable'); updates = value; },
        set: noop,
      }) },
    },
    '../services/kmsService': {}, '../services/auditService': { writeAuditLog: noop },
    '../middleware/appCheckMiddleware': { verifyAppCheck: noop, requireAuth: request => {
      if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in');
    } },
    '../services/emailService': {}, '../services/notificationService': {},
    '../services/stripeService': { deleteStripeCustomer: noop },
    crypto: require('node:crypto'),
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../groups/authFunctions.js'), 'utf8'), {
    module, exports: module.exports, require: key => {
      if (!(key in dependencies)) throw Error(`Unexpected dependency ${key}`);
      return dependencies[key];
    }, console: { error: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  return { run: (request = { auth: { uid: 'self', token: {} } }) => module.exports.deleteMyAccount(request),
    calls, logs, options, updates: () => updates };
}
test('self deletion uses the fresh identity gate without requiring a current trip', async () => {
  const f = fixture(); assert.equal(f.options.enrollment, true);
  await f.run();
  assert.deepEqual(f.calls, ['profile', 'auth:self']);
  assert.equal(f.updates()['users/self'], null);
  assert.equal(f.updates()['app_access/self'], null);
  assert.equal(f.updates()['trips_active/org/trip/locations/self'], null);
});
test('RTDB cleanup failure stops Auth deletion and produces an actionable error', async () => {
  const f = fixture({ cleanupFails: true });
  await assert.rejects(f.run(), error => error.code === 'internal' && error.message.includes('Please try again'));
  assert.deepEqual(f.calls, ['profile']);
  assert.equal(f.logs[0][1].stage, 'profile-cleanup');
});
test('unauthenticated calls cannot delete an account', async () => {
  const f = fixture();
  await assert.rejects(f.run({}), { code: 'unauthenticated' });
  assert.deepEqual(f.calls, []);
});

