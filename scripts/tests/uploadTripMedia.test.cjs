const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function fixture({ status = 200, missing = false, switchUser = false } = {}) {
  const calls = [], auth = { currentUser: { uid: 'user' } };
  const context = {
    auth, functions: {},
    FileSystem: {
      FileSystemUploadType: { BINARY_CONTENT: 0 },
      getInfoAsync: async () => ({ exists: !missing, size: 42 }),
      uploadAsync: async (url, uri, options) => {
        calls.push('upload'); assert.equal(url, 'https://upload.example'); assert.equal(uri, 'file://media');
        assert.equal(options.httpMethod, 'PUT'); assert.equal(options.headers['Content-Length'], '42');
        if (switchUser) auth.currentUser = { uid: 'different' };
        return { status };
      },
    },
    httpsCallable: (_, name) => async data => {
      calls.push(name); assert.equal(data.tripId, 'trip'); assert.equal(data.purpose, 'chat');
      if (name === 'prepareMediaUpload') {
        assert.equal(data.size, 42); assert.equal(data.contentType, 'video/mp4');
        return { data: { uploadUrl: 'https://upload.example', uploadId: 'id', headers: { 'Content-Length': '42' } } };
      }
      assert.equal(data.uploadId, 'id');
      return { data: { url: 'https://download.example/media' } };
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../src/utils/uploadTripMedia.js'), 'utf8');
  vm.runInNewContext(source.replace(/^import .*;\n/gm, '').replace('export async function', 'async function') + '\nthis.upload = uploadTripMedia;', context);
  return { calls, run: () => context.upload('file://media', { tripId: 'trip', contentType: 'video/mp4' }) };
}
test('uploads native binary media then publishes through the authenticated endpoint', async () => {
  const f = fixture(); assert.equal(await f.run(), 'https://download.example/media');
  assert.deepEqual(f.calls, ['prepareMediaUpload', 'upload', 'completeMediaUpload']);
});
for (const options of [{ status: 403 }, { status: 500 }, { missing: true }, { switchUser: true }]) {
  test(`failed media never finalizes: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options); await assert.rejects(f.run());
    assert.ok(!f.calls.includes('completeMediaUpload'));
  });
}
