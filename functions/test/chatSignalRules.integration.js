// Run only against Auth/RTDB emulators; never production.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!databaseHost || !authHost || !project.startsWith('demo-')) throw new Error('Demo emulators required');
const base = `http://${databaseHost}`;
const ns = `${project}-default-rtdb`;
async function main() {
  const signup = async name => {
    const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${name}-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }),
    });
    const { localId: uid, idToken: token } = await response.json();
    assert.ok(uid && token);
    return { uid, token };
  };
  const [pilgrim, staff, outsider] = [await signup('pilgrim'), await signup('staff'), await signup('outsider')];
  const owner = async (path, value) => {
    const response = await fetch(`${base}/${path}.json?ns=${ns}`, { method: 'PUT',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal(response.status, 200, await response.text());
  };
  const call = (user, path, method = 'GET', data) => fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(user.token)}`, {
    method, headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let checks = 0;
  const allow = async (user, path, method, data) => { const r = await call(user, path, method, data); assert.equal(r.status, 200, `${path}: ${await r.text()}`); checks++; };
  const deny = async (user, path, method, data) => { const r = await call(user, path, method, data); assert.equal(r.status, 401, `${path}: expected denied, got ${r.status}`); checks++; };
  const now = Date.now();
  const S = 'trips_active/o/t/chat_signal';
  await owner('', {
    app_access: { [pilgrim.uid]: { expires_at: now + 60000 }, [staff.uid]: { expires_at: now + 60000 }, [outsider.uid]: { expires_at: now + 60000 } },
    orgs: { o: { staff: { [staff.uid]: 'admin' }, trips: { t: { status: 'active', end_date: now + 60000 } } } },
    trips_orgs: { t: 'o' }, trips_participants: { t: { [pilgrim.uid]: true } },
    trips_active: { o: { t: { chat_signal: 'm1', chat: { m1: { sender_id: pilgrim.uid, timestamp: now, text: 'hi' } } } } },
  });
  // Members and staff may read the signal, which holds only a message id.
  await allow(pilgrim, S);
  await allow(staff, S);
  await deny(outsider, S);
  // Only the server writes it.
  await deny(pilgrim, S, 'PUT', 'forged');
  await deny(staff, S, 'PUT', 'forged');
  await deny(pilgrim, S, 'DELETE');
  // The chat itself stays server-read only.
  await deny(pilgrim, 'trips_active/o/t/chat');
  // An ended trip closes the signal to participants.
  await owner('orgs/o/trips/t/end_date', now - 1);
  await deny(pilgrim, S);
  await allow(staff, S);
  console.log(`PASS: ${checks} direct RTDB checks for the chat signal.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
