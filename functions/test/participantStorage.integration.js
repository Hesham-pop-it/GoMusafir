const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!authHost || !storageHost || !project.startsWith('demo-')) throw new Error('Demo emulators required');
async function main() {
  const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `storage-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }),
  });
  const { localId: uid, idToken: token } = await signup.json();
  assert.ok(uid && token);
  let checks = 0;
  for (const name of [`users/${uid}/photo.jpg`, 'chat_media/t/test.jpg', 'participant_avatars/test.jpg', 'trips/test.jpg']) {
    const url = `http://${storageHost}/v0/b/${project}.appspot.com/o?uploadType=media&name=${encodeURIComponent(name)}`;
    for (const authorization of [`Firebase ${token}`, null]) {
      const headers = { 'Content-Type': 'image/jpeg' };
      if (authorization) headers.Authorization = authorization;
      const response = await fetch(url, { method: 'POST', headers, body: 'test' });
      assert.equal(response.status, 403, await response.text()); checks++;
    }
    const seed = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'image/jpeg' }, body: 'test' });
    assert.equal(seed.status, 200, await seed.text());
    const read = await fetch(`http://${storageHost}/v0/b/${project}.appspot.com/o/${encodeURIComponent(name)}?alt=media`, {
      headers: { Authorization: `Firebase ${token}` },
    });
    assert.equal(read.status, name.startsWith('trips/') ? 200 : 403, await read.text()); checks++;
  }
  console.log(`PASS: ${checks} Storage checks: direct writes denied, private reads denied, trip photos public.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
