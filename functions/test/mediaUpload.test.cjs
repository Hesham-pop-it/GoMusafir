const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
function fixture() {
  const data = {
    users: { user: { joined_trips: { trip: { org_id: 'org' } } } },
    orgs: { org: { trips: { trip: { status: 'active', end_date: Date.now() + 60000 } }, staff: {} } },
    trips_orgs: { trip: 'org' }, trips_participants: { trip: { user: true, target: true } }, app_access: {},
  };
  const record = { customClaims: {}, tokensValidAfterTime: new Date(0).toISOString() };
  const files = new Map(), signed = [];
  const db = { ref: key => ({ get: async () => {
    const value = key.split('/').reduce((node, part) => node?.[part], data);
    return { val: () => value, exists: () => value != null };
  } }) };
  const adminModule = { db, auth: { getUser: async () => record }, admin: { storage: () => ({ bucket: () => ({ file: name => ({
    name,
    getSignedUrl: async config => { signed.push({ name, config }); return ['https://upload.example/signed']; },
    getMetadata: async () => { if (!files.has(name)) throw new HttpsError('not-found', 'Missing file'); return [files.get(name)]; },
    setMetadata: async metadata => Object.assign(files.get(name), metadata),
  }) }) }) } };
  const accessModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/participantAccessService.js'), 'utf8'), {
    module: accessModule, require: name => {
      if (name === '../admin') return adminModule;
      if (name === './guardedTransaction') return {};
      if (name === 'firebase-functions/v2/https') return { HttpsError };
      throw Error(name);
    },
  });
  const exports = {};
  const dependencies = {
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError },
    'firebase-admin/storage': { getDownloadURL: async file => 'https://download.example/' + file.name },
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' },
    '../admin': adminModule, '../services/participantAccessService': accessModule.exports,
    '../middleware/appCheckMiddleware': { verifyAppCheck() {}, requireRole: (request, roles) => {
      if (!roles.includes(request.auth?.token.role)) throw new HttpsError('permission-denied', 'Staff required');
    } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../groups/mediaFunctions.js'), 'utf8'), {
    exports, require: name => { assert.ok(dependencies[name], name); return dependencies[name]; },
  });
  const request = { auth: { uid: 'user', token: { auth_time: Math.floor(Date.now() / 1000) } },
    data: { tripId: 'trip', purpose: 'chat', contentType: 'image/jpeg', size: 42 } };
  return { api: exports, request, data, record, signed, files };
}
test('upload URL is caller/trip scoped, size/type bound, create-only, and short-lived', async () => {
  const f = fixture(); const before = Date.now();
  const result = await f.api.prepareMediaUpload(f.request);
  const { name, config } = f.signed[0];
  assert.equal(name, `chat_media/trip/user/${result.uploadId}`);
  assert.equal(config.version, 'v4'); assert.equal(config.action, 'write');
  assert.equal(config.contentType, 'image/jpeg');
  assert.equal(config.extensionHeaders['content-length'], '42');
  assert.equal(config.extensionHeaders['x-goog-if-generation-match'], '0');
  assert.ok(config.expires >= before + 300000 && config.expires <= Date.now() + 300000);
  assert.equal(result.headers['Content-Length'], '42');
  assert.equal(result.headers['x-goog-if-generation-match'], '0');
});
for (const scenario of ['anonymous', 'expired', 'closed', 'revoked', 'nonmember', 'foreign-staff']) {
  test(`RTDB denies upload and publication for ${scenario}`, async () => {
    const f = fixture();
    if (scenario === 'anonymous') f.request.auth = null;
    if (scenario === 'expired') f.data.orgs.org.trips.trip.end_date = Date.now() - 1;
    if (scenario === 'closed') f.data.orgs.org.trips.trip.status = 'closed';
    if (scenario === 'revoked') f.data.app_access.user = { revoked_before: Date.now() / 1000 + 10 };
    if (scenario === 'nonmember') delete f.data.trips_participants.trip.user;
    if (scenario === 'foreign-staff') {
      delete f.data.trips_participants.trip.user;
      f.record.customClaims = { role: 'admin', orgId: 'other' };
      f.data.orgs.other = { staff: { user: 'admin' } };
    }
    await assert.rejects(f.api.prepareMediaUpload(f.request));
    await assert.rejects(f.api.completeMediaUpload(f.request));
    assert.equal(f.signed.length, 0);
  });
}
test('rejects path injection, unsupported types, and oversized/empty uploads', async () => {
  for (const change of [{ tripId: '../trip' }, { purpose: 'other' }, { contentType: 'text/html' }, { contentType: '__proto__' }, { size: 0 }, { size: 1.5 }, { size: 100 * 1024 * 1024 }]) {
    const f = fixture(); Object.assign(f.request.data, change);
    await assert.rejects(f.api.prepareMediaUpload(f.request), { code: 'invalid-argument' });
    assert.equal(f.signed.length, 0);
  }
});
test('avatar edits require staff from the trip organization and an associated target', async () => {
  const f = fixture(); Object.assign(f.request.data, { purpose: 'avatar', targetUid: 'target' });
  await assert.rejects(f.api.prepareMediaUpload(f.request), { code: 'permission-denied' });
  f.record.customClaims = { role: 'admin', orgId: 'org' };
  Object.assign(f.request.auth.token, f.record.customClaims);
  f.data.orgs.org.staff.user = 'admin';
  const result = await f.api.prepareMediaUpload(f.request);
  assert.ok(f.signed[0].name.startsWith('participant_avatars/trip/user/'));
  f.request.data.targetUid = 'outsider';
  await assert.rejects(f.api.prepareMediaUpload(f.request), { code: 'permission-denied' });
  f.request.data.targetUid = 'target'; f.request.data.contentType = 'video/mp4';
  await assert.rejects(f.api.prepareMediaUpload(f.request), { code: 'invalid-argument' });
  assert.ok(result.uploadId);
});
test('publication checks file metadata, caller ownership, and renewed trip access', async () => {
  const f = fixture(); const { uploadId } = await f.api.prepareMediaUpload(f.request);
  f.request.data.uploadId = uploadId;
  const name = `chat_media/trip/user/${uploadId}`;
  f.files.set(name, { size: '42', contentType: 'image/jpeg' });
  assert.equal((await f.api.completeMediaUpload(f.request)).url, 'https://download.example/' + name);
  assert.ok(f.files.get(name).metadata.firebaseStorageDownloadTokens);
  f.files.get(name).contentType = 'text/html';
  await assert.rejects(f.api.completeMediaUpload(f.request), { code: 'invalid-argument' });
  f.files.get(name).contentType = 'image/jpeg';
  f.request.data.uploadId = '../user/file.jpg';
  await assert.rejects(f.api.completeMediaUpload(f.request), { code: 'invalid-argument' });
  f.request.data.uploadId = uploadId;
  f.data.orgs.org.trips.trip.end_date = Date.now() - 1;
  await assert.rejects(f.api.completeMediaUpload(f.request), { code: 'permission-denied' });
  f.data.orgs.org.trips.trip.end_date = Date.now() + 60000;
  f.request.auth.uid = 'other';
  f.data.users.other = f.data.users.user; f.data.trips_participants.trip.other = true;
  await assert.rejects(f.api.completeMediaUpload(f.request), { code: 'not-found' });
});
