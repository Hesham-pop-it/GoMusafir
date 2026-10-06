// Run only against Auth/RTDB emulators; never production.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!databaseHost || !authHost || !project.startsWith('demo-')) throw new Error('Demo emulators required');
const base = `http://${databaseHost}`;
const ns = `${project}-default-rtdb`;
async function main() {
  const signup = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `participant-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }),
  });
  const { localId: uid, idToken: token } = await signup.json();
  assert.ok(uid && token);
  const owner = async (path, value) => {
    const response = await fetch(`${base}/${path}.json?ns=${ns}`, { method: 'PUT',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal(response.status, 200, await response.text());
  };
  const call = async (path, method = 'GET', data) => fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(token)}`, {
    method, headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let checks = 0;
  const allow = async (path, method, data) => { const r = await call(path, method, data);assert.equal(r.status, 200, `${path}: ${await r.text()}`);checks++; };
  const deny = async (path, method, data) => { const r = await call(path, method, data);assert.equal(r.status, 401, `${path}: ${await r.text()}`);checks++; };
  await owner('', {
    users: { [uid]: { joined_trips: { t: { org_id: 'o' } }, current_trip: 't' } },
    app_access: { [uid]: { expires_at: Date.now() + 60000, revoked_before: 0 } },
    orgs: { o: { trips: { t: { status: 'active', end_date: Date.now() + 60000 } } } },
    trips_orgs: { t: 'o' }, trips_participants: { t: { [uid]: true } },
  });
  for (const path of ['orgs/o/trips/t', 'orgs/o/staff', `users/${uid}`, 'trips_active/o/t']) {
    const response = await fetch(`${base}/${path}.json?ns=${ns}`);
    assert.equal(response.status, 401, `Logged-out access to ${path} must fail`);
    checks++;
  }
  await allow('orgs/o/trips/t');
  await allow(`trips_active/o/t/locations/${uid}`, 'PUT', { lat: 1 });
  await allow(`trips_active/o/t/chat/one`, 'PUT', { sender_id: uid, timestamp: Date.now(), text: 'hello' });
  await deny(`users/${uid}/staff_org_id`, 'PUT', 'o');
  await deny(`users/${uid}/joined_trips/fake`, 'PUT', { org_id: 'o' });
  await deny(`app_access/${uid}/expires_at`, 'PUT', Date.now() + 999999);
  await deny('trips_active/o/other/voice_presence/' + uid, 'PUT', true);
  await deny('trips_active/o/other/notifications/someone', 'PUT', { title: 'no' });
  // Raw PII and historical metadata must not bypass the server-filtered views.
  await owner('users/other', { profile: { firstName: 'Hidden', email: 'private@example.test' }, full_name: 'Hidden Name' });
  await owner('trips_participants/t/other', true);
  await owner('trips_active/o/t/locations/other', { lat: 31, lng: 71 });
  await owner('orgs/o/trips/t/visibility_config', { name: 'Show to organizers', location: 'Show to organizers' });
  await allow(`users/${uid}/profile`);
  for (const path of ['users/other', 'users/other/profile', 'users/other/full_name',
    'trips_active/o/t/locations', 'trips_active/o/t/locations/other', 'trips_active/o/t/chat',
    'trips_active/o/t/voice_channel', 'trips_active/o/t/voice_channel/activeSpeaker',
    `trips_active/o/t/notifications/${uid}`, `users/${uid}`, `users/${uid}/notifications`]) await deny(path);
  await deny(`trips_active/o/t/location_permissions/other/${uid}`, 'PUT', true);
  await deny(`trips_active/o/t/location_permissions/${uid}/other`, 'PUT', {acceptedAt:Date.now(),expiresAt:Date.now()+900000});
  await deny('trips_active/o/t/notifications/other/forged', 'PUT', {
    type:'location_request',senderUid:uid,status:'pending',expiresAt:Date.now()+900000,
  });
  // A current org staff role still cannot read a participant's raw hidden fields.
  await owner(`orgs/o/staff/${uid}`, 'admin');
  await deny('users/other/profile');
  await deny('trips_active/o/t/locations/other');
  await owner(`orgs/o/staff/${uid}`, null);
  // Do not update the index or token: expiry must be immediate at the rules.
  await owner('orgs/o/trips/t/end_date', Date.now() - 1);
  await deny('orgs/o/trips/t');
  await deny('trips_participants/t');
  await deny(`trips_active/o/t/locations/${uid}`, 'PUT', { lat: 2 });
  await deny(`trips_active/o/t/chat/two`, 'PUT', { sender_id: uid, timestamp: Date.now(), text: 'blocked' });
  await deny(`trips_active/o/t/voice_channel/presence/${uid}`, 'PUT', true);
  await deny(`trips_active/o/t/read_pointers/${uid}`, 'PUT', 1);
  // Old sessions cannot regain access when a new valid trip exists.
  await owner('orgs/o/trips/t/end_date', Date.now() + 60000);
  await owner(`app_access/${uid}/revoked_before`, Math.floor(Date.now() / 1000) + 1);
  await deny('orgs/o/trips/t');
  await deny(`trips_active/o/t/locations/${uid}`, 'PUT', { lat: 3 });
  await deny(`users/${uid}`);
  await deny('orgs/o/staff');
  console.log(`PASS: ${checks} direct RTDB checks for access, forgery, expiry and session replay.`);
}
main().catch(error => { console.error(error);process.exitCode = 1; });
