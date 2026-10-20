const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const TOKEN = 'a'.repeat(64);
function load(service) {
  const noop = async () => {};
  const registered = {};
  const deps = {
    '../middleware/participantAccessMiddleware': { onCall: (opts, handler) => { registered.lastCall = { opts, handler }; return handler; } },
    'firebase-functions/v2/https': { onRequest: (opts, handler) => { registered[handler.name || 'req'] = opts; return handler; }, HttpsError },
    'firebase-functions/v2/scheduler': { onSchedule: (opts, handler) => handler },
    '../admin': { db: { ref: () => ({ get: async () => ({ val: () => 'staffOrg' }) }) } },
    '../middleware/appCheckMiddleware': { verifyAppCheck: noop, requireAuth: r => { if (!r.auth) throw new HttpsError('unauthenticated', 'x'); } },
    '../services/deletionService': { getDeletionService: () => service },
    '../services/deletionTexts': require('../services/deletionTexts'),
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../groups/deletionFunctions.js'), 'utf8'), {
    module, exports: module.exports, console, require: k => { if (!(k in deps)) throw Error(`Unexpected dependency ${k}`); return deps[k]; },
  });
  return module.exports;
}
const response = () => { const r = { headers: {}, set(h) { Object.assign(r.headers, h); return r; }, status(c) { r.code = c; return r; }, send(b) { r.body = b; return r; } }; return r; };
const service = (over = {}) => {
  const calls = [];
  return { calls, svc: {
    isAccountLinkValid: async (u, t) => t === TOKEN, cancelAccountDeletion: async a => { calls.push(['cancel', a]); },
    isOrganizationLinkValid: async (o, t) => t === TOKEN, restoreOrganization: async a => { calls.push(['restore', a]); return { success: true }; },
    organizationDeletionStatus: async a => ({ organization: a }), ...over } };
};
const req = (method, query) => ({ method, query, ip: '8.8.8.8' });

test('a GET on a valid cancel link only shows the confirm page and changes nothing', async () => {
  const { svc, calls } = service(); const fns = load(svc); const res = response();
  await fns._handlers.cancelAccountDeletionHandler(req('GET', { uid: 'u1', token: TOKEN }), res);
  assert.equal(res.code, 200);
  assert.match(res.body, /Keep my account/);
  assert.ok(res.body.includes(`action="?uid=u1&amp;token=${TOKEN}"`));
  assert.deepEqual(calls, []);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
});
test('a POST on the cancel link cancels once with the caller address', async () => {
  const { svc, calls } = service(); const fns = load(svc); const res = response();
  await fns._handlers.cancelAccountDeletionHandler(req('POST', { uid: 'u1', token: TOKEN }), res);
  assert.equal(res.code, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['cancel', { uid: 'u1', token: TOKEN, ip: '8.8.8.8' }]]);
});
test('an invalid or used link shows the same neutral page, other methods are refused', async () => {
  const { svc } = service({ cancelAccountDeletion: async () => { throw new HttpsError('not-found', 'gone'); } });
  const fns = load(svc);
  const bad = response();
  await fns._handlers.cancelAccountDeletionHandler(req('GET', { uid: 'u1', token: 'wrong' }), bad);
  assert.equal(bad.code, 404);
  assert.match(bad.body, /Link not valid/);
  const used = response();
  await fns._handlers.cancelAccountDeletionHandler(req('POST', { uid: 'u1', token: TOKEN }), used);
  assert.equal(used.code, 404);
  const put = response();
  await fns._handlers.cancelAccountDeletionHandler(req('PUT', { uid: 'u1', token: TOKEN }), put);
  assert.equal(put.code, 405);
  const missing = response();
  await fns._handlers.cancelAccountDeletionHandler(req('GET', {}), missing);
  assert.equal(missing.code, 404);
});
test('the organisation restore link works the same way', async () => {
  const { svc, calls } = service(); const fns = load(svc);
  const get = response(); await fns._handlers.restoreOrganizationLinkHandler(req('GET', { org: 'o1', token: TOKEN }), get);
  assert.match(get.body, /Restore the organisation/);
  assert.deepEqual(calls, []);
  const post = response(); await fns._handlers.restoreOrganizationLinkHandler(req('POST', { org: 'o1', token: TOKEN }), post);
  assert.equal(calls[0][0], 'restore');
  assert.equal(calls[0][1].orgId, 'o1');
});
test('the restore callable is enrollment-class and uses the caller and their organisation', async () => {
  const { svc, calls } = service(); const fns = load(svc);
  await fns.restoreOrganization({ auth: { uid: 'owner', token: {} }, rawRequest: { ip: '1.1.1.1' } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['restore', { orgId: 'staffOrg', uid: 'owner', ip: '1.1.1.1' }]]);
  await assert.rejects(fns.restoreOrganization({}), { code: 'unauthenticated' });
  assert.deepEqual(JSON.parse(JSON.stringify(await fns.getDeletionStatus({ auth: { uid: 'owner', token: { orgId: 'o9' } } }))), { organization: { uid: 'owner', orgId: 'o9' } });
});
