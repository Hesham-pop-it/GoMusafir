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
  const [pilgrim, other, staff, outsider] = [await signup('pilgrim'), await signup('other'), await signup('staff'), await signup('outsider')];
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
  const T = 'trips_active/o/t';
  const entry = see => ({ full_name: '', visibility: { canSeeLocation: see } });
  await owner('', {
    app_access: Object.fromEntries([pilgrim, other, staff, outsider].map(user => [user.uid, { expires_at: now + 60000 }])),
    orgs: { o: { staff: { [staff.uid]: 'admin' }, trips: { t: { status: 'active', end_date: now + 60000 } } } },
    trips_orgs: { t: 'o' }, trips_participants: { t: { [pilgrim.uid]: true, [other.uid]: true } },
    trip_view: { t: {
      member: { [pilgrim.uid]: entry(false), [other.uid]: entry(false) },
      staff: { [pilgrim.uid]: entry(true), [other.uid]: entry(true) },
    } },
    account_signal: { [pilgrim.uid]: 'e1', [other.uid]: 'e2' },
    trips_active: { o: { t: {
      chat_view: { m1: { sender_id: pilgrim.uid, sender_name: 'Participant', text: 'hi' } },
      locations: { [pilgrim.uid]: { lat: 1, lng: 2 }, [other.uid]: { lat: 3, lng: 4 } },
    } } },
  });
  // Directory views: members read the member view, only staff the whole staff view,
  // everyone their own staff entry. Only the server writes them.
  await allow(pilgrim, 'trip_view/t/member');
  await allow(staff, 'trip_view/t/member');
  await deny(outsider, 'trip_view/t/member');
  await deny(pilgrim, 'trip_view/t/staff');
  await allow(staff, 'trip_view/t/staff');
  await allow(pilgrim, `trip_view/t/staff/${pilgrim.uid}`);
  await deny(pilgrim, `trip_view/t/staff/${other.uid}`);
  await deny(pilgrim, `trip_view/t/member/${pilgrim.uid}`, 'PUT', entry(true));
  await deny(staff, `trip_view/t/staff/${pilgrim.uid}`, 'PUT', entry(false));
  // Own account signal only.
  await allow(pilgrim, `account_signal/${pilgrim.uid}`);
  await deny(pilgrim, `account_signal/${other.uid}`);
  await deny(pilgrim, `account_signal/${pilgrim.uid}`, 'PUT', 'forged');
  // Chat mirror: same audience as the chat signal, server-written.
  await allow(pilgrim, `${T}/chat_view`);
  await allow(staff, `${T}/chat_view`);
  await deny(outsider, `${T}/chat_view`);
  await deny(pilgrim, `${T}/chat_view/m2`, 'PUT', { text: 'forged' });
  // Coordinates: per person, only when the view allows it for that audience.
  await deny(pilgrim, `${T}/locations`);
  await allow(pilgrim, `${T}/locations/${pilgrim.uid}`);
  await deny(pilgrim, `${T}/locations/${other.uid}`);
  await allow(staff, `${T}/locations/${other.uid}`);
  await deny(outsider, `${T}/locations/${other.uid}`);
  await owner(`trip_view/t/member/${other.uid}/visibility/canSeeLocation`, true);
  await allow(pilgrim, `${T}/locations/${other.uid}`);
  await owner(`trip_view/t/member/${other.uid}/visibility/canSeeLocation`, false);
  await owner(`trip_view/t/staff/${other.uid}/visibility/canSeeLocation`, false);
  await deny(staff, `${T}/locations/${other.uid}`);
  // An accepted grant opens one person's coordinates to the requester until it expires.
  const grant = `${T}/location_permissions/${other.uid}/${pilgrim.uid}`;
  await owner(grant, { acceptedAt: now, expiresAt: now + 60000, requestId: 'r1' });
  await allow(pilgrim, grant);
  await deny(outsider, grant);
  await allow(pilgrim, `${T}/locations/${other.uid}`);
  await deny(pilgrim, grant, 'PUT', { acceptedAt: now, expiresAt: now + 3600000 });
  await owner(grant, { acceptedAt: now - 120000, expiresAt: now - 60000, requestId: 'r1' });
  await deny(pilgrim, `${T}/locations/${other.uid}`);
  // An ended trip closes the views and the mirror to participants.
  await owner('orgs/o/trips/t/end_date', now - 1);
  await deny(pilgrim, 'trip_view/t/member');
  await deny(pilgrim, `${T}/chat_view`);
  await deny(pilgrim, `${T}/locations/${pilgrim.uid}`);
  await allow(staff, 'trip_view/t/staff');
  console.log(`PASS: ${checks} direct RTDB checks for the trip views, chat mirror and coordinates.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
