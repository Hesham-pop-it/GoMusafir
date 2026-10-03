const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../groups/profilePhotoFunctions.js', 'utf8');
const decoder = fs.readFileSync(__dirname + '/../services/tripPhotoService.js', 'utf8');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
function setup() {
  const saved = [];
  const decoded = { exports: {} };
  vm.runInNewContext(decoder, { module: decoded, Buffer, require: () => ({ HttpsError }) });
  const modules = {
    'firebase-functions/v2/https': { onCall: (_, handler) => handler, HttpsError },
    'firebase-admin/storage': { getDownloadURL: async () => 'https://storage.example/photo.jpg' },
    crypto: { randomUUID: () => 'random-id' },
    '../admin': { admin: { storage: () => ({ bucket: () => ({ file: path => ({ save: async (bytes, options) => saved.push({ path, bytes, options }) }) }) }) } },
    '../services/participantAccessService': { requireFreshIdentity: async request => {
      if (!request.auth || request.revoked) throw new HttpsError('unauthenticated', 'Sign in again');
    } },
    '../services/tripPhotoService': decoded.exports,
    '../middleware/appCheckMiddleware': { verifyAppCheck() {} },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => {
    assert.ok(modules[name], `Unexpected dependency: ${name}`);
    return modules[name];
  } });
  return { upload: exports.uploadProfilePhoto, saved };
}
const request = () => ({ auth: { uid: 'owner', token: { email_verified: true } }, data: { userId: 'someone-else', dataUrl: 'data:image/jpeg;base64,/9j/AA==' } });
test('stores validated JPEG under authenticated owner and returns Storage URL', async () => {
  const { upload, saved } = setup();
  assert.equal((await upload(request())).url, 'https://storage.example/photo.jpg');
  assert.equal(saved[0].path, 'users/owner/photos/random-id.jpg');
  assert.equal(saved[0].options.metadata.contentType, 'image/jpeg');
  assert.deepEqual([...saved[0].bytes], [255, 216, 255, 0]);
});
test('rejects anonymous, revoked, unverified, and invalid-image requests without writing', async () => {
  const { upload, saved } = setup();
  for (const override of [{ auth: null }, { revoked: true }, { auth: { uid: 'owner', token: {} } }, { data: { dataUrl: 'data:image/jpeg;base64,aGVsbG8=' } }, { data: {} }]) {
    await assert.rejects(upload({ ...request(), ...override }));
  }
  assert.equal(saved.length, 0);
});
