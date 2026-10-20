const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
function fixture() {
  const requests = []; let options;
  const noop = async () => {};
  const deps = {
    'firebase-functions/v2/https': { HttpsError },
    '../middleware/participantAccessMiddleware': { onCall: (opts, handler) => { if (handler.toString().includes('requestOrganizationDeletion')) options = opts; return handler; } },
    '../admin': { admin: {}, db: {}, auth: {} },
    '../services/kmsService': {}, '../services/auditService': {},
    '../services/deletionService': { getDeletionService: () => ({ requestOrganizationDeletion: async a => { requests.push(a); return { success: true, purge_after: 9 }; } }) },
    '../middleware/appCheckMiddleware': { verifyAppCheck: noop,
      requireAuth: noop,
      requireRole: (r, roles) => { if (!roles.includes(r.auth.token.role)) throw new HttpsError('permission-denied', 'role'); } },
    '../middleware/validateSchema': { validate: noop, schemas: {} },
    uuid: { v4: () => 'id' }, crypto: require('node:crypto'),
    '../services/emailService': {}, '../services/notificationService': {}, '../services/stripeService': {},
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../groups/orgFunctions.js'), 'utf8'), {
    module, exports: module.exports, console, require: k => { if (!(k in deps)) throw Error(`Unexpected dependency ${k}`); return deps[k]; },
  });
  return { run: r => module.exports.deleteOrganization(r), requests, options: () => options };
}
test('deleteOrganization passes the caller, the typed name and the sign-in time to the deletion service', async () => {
  const f = fixture();
  const out = await f.run({ auth: { uid: 'o', token: { role: 'admin', orgId: 'org', auth_time: 5 } }, data: { confirmName: 'Al Noor' }, rawRequest: { ip: '2.2.2.2' } });
  assert.equal(out.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests)), [{ uid: 'o', orgId: 'org', confirmName: 'Al Noor', authTime: 5, ip: '2.2.2.2' }]);
  assert.deepEqual([...f.options().secrets], ['SENDGRID_API_KEY']);
});
test('an older build without the name reaches the service, which refuses it; other roles never get there', async () => {
  const f = fixture();
  await f.run({ auth: { uid: 'o', token: { role: 'admin', orgId: 'org', auth_time: 5 } }, data: undefined });
  assert.equal(f.requests[0].confirmName, undefined);
  await assert.rejects(f.run({ auth: { uid: 'c', token: { role: 'co-host', orgId: 'org' } }, data: {} }), { code: 'permission-denied' });
  assert.equal(f.requests.length, 1);
});
