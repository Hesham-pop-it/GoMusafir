// Run only against Auth/RTDB emulators; never production.
// A deactivated organisation (orgs/{id}/metadata/deleted_at) is closed to its staff and participants,
// and comes back when the mark is removed. The deletion queues and audit are server-only.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!databaseHost || !authHost || !project.startsWith('demo-')) throw new Error('Demo emulators required');
const base = `http://${databaseHost}`;
const ns = `${project}-default-rtdb`;
async function main() {
  const signup = async (name) => {
    const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${name}-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }),
    });
    const { localId: uid, idToken: token } = await response.json();
    assert.ok(uid && token);
    return { uid, token };
  };
  const [pilgrim, staff, bystander] = [await signup('pilgrim'), await signup('staff'), await signup('bystander')];
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
  const access = () => ({ expires_at: now + 60000, revoked_before: 0 });
  const trip = { status: 'active', end_date: now + 60000 };
  await owner('', {
    users: { [pilgrim.uid]: { joined_trips: { t: { org_id: 'o' } }, current_trip: 't' }, [bystander.uid]: { joined_trips: { u: { org_id: 'p' } }, current_trip: 'u' } },
    app_access: { [pilgrim.uid]: access(), [staff.uid]: access(), [bystander.uid]: access() },
    orgs: { o: { metadata: { name: 'Org O' }, staff: { [staff.uid]: 'co-host' }, trips: { t: trip } },
      p: { metadata: { name: 'Org P' }, staff: {}, trips: { u: trip } } },
    trips_orgs: { t: 'o', u: 'p' }, trips_participants: { t: { [pilgrim.uid]: true }, u: { [bystander.uid]: true } },
    trips_active: { o: { t: { chat: { m: { sender_id: 'x', timestamp: now, text: 'hello' } } } }, p: { u: { chat: { m: { sender_id: 'x', timestamp: now, text: 'hello' } } } } },
  });

  // Active organisation: both can work.
  await allow(pilgrim, 'orgs/o/trips/t');
  await allow(pilgrim, `trips_active/o/t/locations/${pilgrim.uid}`, 'PUT', { lat: 1 });
  await allow(staff, 'trips_active/o/t/chat');
  await allow(staff, 'orgs/o/staff');

  // Deactivated organisation: staff and participants can neither read nor write.
  await owner('orgs/o/metadata/deleted_at', now);
  await deny(pilgrim, 'orgs/o/trips/t');
  await deny(pilgrim, 'trips_active/o/t/chat');
  await deny(pilgrim, `trips_active/o/t/locations/${pilgrim.uid}`, 'PUT', { lat: 2 });
  await deny(pilgrim, 'trips_active/o/t/chat/new', 'PUT', { sender_id: pilgrim.uid, timestamp: Date.now(), text: 'hi', type: 'text' });
  await deny(staff, 'trips_active/o/t/chat');
  await deny(staff, 'orgs/o/staff');
  await deny(staff, 'orgs/o/trips/t');
  await deny(staff, 'trips_active/o/t/chat/new', 'PUT', { sender_id: staff.uid, timestamp: Date.now(), text: 'hi', type: 'text' });
  // The mark itself cannot be removed or forged from a client.
  await deny(staff, 'orgs/o/metadata/deleted_at', 'DELETE');
  await deny(staff, 'orgs/p/metadata/deleted_at', 'PUT', Date.now());
  // Another organisation is not affected.
  await allow(bystander, 'orgs/p/trips/u');
  await allow(bystander, `trips_active/p/u/locations/${bystander.uid}`, 'PUT', { lat: 1 });

  // Restored: the same people work again with the same tokens.
  await owner('orgs/o/metadata/deleted_at', null);
  await allow(pilgrim, 'orgs/o/trips/t');
  await allow(staff, 'trips_active/o/t/chat');

  // Deletion queues, the audit and the re-confirmation stamps are server-only.
  for (const node of ['account_deletions', 'org_deletions', 'deletion_audit', 'deletion_reauth']) {
    await owner(`${node}/x`, { purge_after: now, event: 'X', at: now });
    for (const user of [pilgrim, staff]) {
      await deny(user, `${node}/x`);
      await deny(user, `${node}/x`, 'PUT', { purge_after: 1 });
      await deny(user, node);
    }
  }
  console.log(`deletionRules: ${checks} checks passed`);
}
main().catch((e) => { console.error(e); process.exit(1); });
