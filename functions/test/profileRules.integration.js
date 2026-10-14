// Run only against Auth/RTDB emulators with a demo- project; never production.
// Proves who can read user profiles: same-org staff yes, other-org staff no,
// fellow travellers only through trip_cards, and that the index is server-only.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!databaseHost || !authHost || !project.startsWith('demo-')) throw new Error('Demo emulators required');
const ns = `${project}-default-rtdb`;
const admin = require('firebase-admin');
admin.initializeApp({ projectId: project, databaseURL: `http://${databaseHost}?ns=${ns}` });
const { db } = require('../admin');
const members = require('../services/orgMembersService');
const { run: backfill } = require('../scripts/backfillOrgMembers');
const base = `http://${databaseHost}`;
const authBase = `http://${authHost}/identitytoolkit.googleapis.com`;
const json = { 'Content-Type': 'application/json' };

async function makeUser(name, claims) {
  const email = `${name}-${Date.now()}@example.test`;
  const signUp = await (await fetch(`${authBase}/v1/accounts:signUp?key=fake`, { method: 'POST', headers: json,
    body: JSON.stringify({ email, password: 'test-password', returnSecureToken: true }) })).json();
  if (claims) {
    const update = await fetch(`${authBase}/v1/projects/${project}/accounts:update`, { method: 'POST',
      headers: { ...json, Authorization: 'Bearer owner' }, body: JSON.stringify({ localId: signUp.localId, customAttributes: JSON.stringify(claims) }) });
    assert.equal(update.status, 200, await update.text());
  }
  const signIn = await (await fetch(`${authBase}/v1/accounts:signInWithPassword?key=fake`, { method: 'POST', headers: json,
    body: JSON.stringify({ email, password: 'test-password', returnSecureToken: true }) })).json();
  assert.ok(signIn.idToken);
  return { uid: signUp.localId, token: signIn.idToken };
}

async function main() {
  const alice = await makeUser('alice', { orgId: 'orgA', role: 'manager' });
  const carol = await makeUser('carol', { orgId: 'orgB', role: 'admin' });
  const pat = await makeUser('pat');
  const bob = await makeUser('bob');
  const dan = await makeUser('dan');
  const end = Date.now() + 3600000;
  const user = (first, last, extra = {}) => ({ full_name: `${first} ${last}`, photo_url: `https://img/${first}.jpg`,
    profile: { firstName: first, lastName: last, email: `${first}@example.test`, phone: '+310000', photoURL: `https://img/${first}.jpg` }, ...extra });
  const owner = async (path, value) => {
    const response = await fetch(`${base}/${path}.json?ns=${ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner', ...json }, body: JSON.stringify(value) });
    assert.equal(response.status, 200, await response.text());
  };
  await owner('', {
    users: {
      [alice.uid]: user('Alice', 'A', { staff_org_id: 'orgA' }), [carol.uid]: user('Carol', 'C', { staff_org_id: 'orgB' }),
      [pat.uid]: user('Pat', 'P', { current_trip: 'tA' }), [bob.uid]: user('Bob', 'B', { current_trip: 'tB' }),
      [dan.uid]: user('Dan', 'D', { current_trip: 'tA2' }),
    },
    orgs: {
      orgA: { staff: { [alice.uid]: 'manager' }, trips: { tA: { status: 'active', end_date: end }, tA2: { status: 'active', end_date: end } } },
      orgB: { staff: { [carol.uid]: 'admin' }, trips: { tB: { status: 'active', end_date: end } } },
    },
    trips_orgs: { tA: 'orgA', tA2: 'orgA', tB: 'orgB' },
    trips_participants: { tA: { [pat.uid]: true }, tA2: { [dan.uid]: true }, tB: { [bob.uid]: true } },
    app_access: Object.fromEntries([pat, bob, dan].map(u => [u.uid, { expires_at: end, revoked_before: 0 }])),
  });

  // Server side: backfill (dry run writes nothing, apply is idempotent).
  const dry = await backfill({ apply: false });
  assert.equal((await db.ref('org_members').get()).exists(), false);
  assert.equal(dry.reduce((n, r) => n + r.members, 0), 5);
  const first = await backfill({ apply: true });
  const snapshot = JSON.stringify((await db.ref('org_members').get()).val());
  const trips = JSON.stringify((await db.ref('trip_cards').get()).val());
  assert.deepEqual(await backfill({ apply: true }), first);
  assert.equal(JSON.stringify((await db.ref('org_members').get()).val()), snapshot);
  assert.equal(JSON.stringify((await db.ref('trip_cards').get()).val()), trips);
  assert.deepEqual(Object.keys((await db.ref('org_members/orgA').get()).val()).sort(), [alice.uid, pat.uid, dan.uid].sort());
  assert.deepEqual(Object.keys((await db.ref('org_members/orgB').get()).val()).sort(), [carol.uid, bob.uid].sort());
  const card = (await db.ref(`trip_cards/tA/${pat.uid}`).get()).val();
  assert.equal(card.full_name, 'Pat P');
  assert.equal(card.profile.firstName, 'Pat');
  assert.equal(JSON.stringify(card).includes('example.test'), false, 'card must not hold email');
  assert.equal(JSON.stringify(card).includes('+310000'), false, 'card must not hold phone');
  assert.ok((await db.ref(`trip_cards/tA/${alice.uid}`).get()).exists(), 'staff get a card on every org trip');

  let checks = 0;
  const as = who => async (path, method = 'GET', data) => fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(who.token)}`,
    { method, headers: json, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const allow = async (who, path, method, data) => { const r = await as(who)(path, method, data); const text = await r.text(); assert.equal(r.status, 200, `${path}: ${text}`); checks++; return text ? JSON.parse(text) : null; };
  const deny = async (who, path, method, data) => { const r = await as(who)(path, method, data); assert.equal(r.status, 401, `${path}: ${await r.text()}`); checks++; };

  // Same-org staff.
  await allow(alice, `users/${pat.uid}`);
  await allow(alice, `users/${pat.uid}/profile`);
  await allow(alice, `users/${pat.uid}/full_name`);
  await allow(alice, `users/${dan.uid}/profile`);
  await allow(alice, `users/${alice.uid}`);
  // Staff of another organisation: nothing, including admins and pilgrims of that org.
  await deny(alice, `users/${bob.uid}`);
  await deny(alice, `users/${bob.uid}/profile`);
  await deny(alice, `users/${bob.uid}/full_name`);
  await deny(alice, `users/${bob.uid}/photo_url`);
  await deny(alice, `users/${carol.uid}`);
  await deny(alice, `users/${carol.uid}/profile`);
  await deny(carol, `users/${pat.uid}/profile`);
  await deny(carol, `users/${alice.uid}`);
  await allow(carol, `users/${bob.uid}/profile`);
  await deny(alice, 'trip_cards/tB');
  await deny(alice, `trip_cards/tB/${bob.uid}`);
  // Pilgrims: own record yes, other users' records no, wherever they are.
  await allow(pat, `users/${pat.uid}`);
  await allow(pat, `users/${pat.uid}/profile`);
  await allow(pat, `users/${pat.uid}/profile/likes/t`, 'PUT', true);
  await deny(pat, `users/${alice.uid}`);
  await deny(pat, `users/${alice.uid}/profile`);
  await deny(pat, `users/${dan.uid}`);
  await deny(pat, `users/${dan.uid}/profile`);
  await deny(pat, `users/${dan.uid}/full_name`);
  await deny(pat, `users/${bob.uid}/profile`);
  await deny(pat, `users/${bob.uid}/photo_url`);
  // Fellow travellers keep name and photo through the trip card of their own trip only.
  const own = await allow(pat, `trip_cards/tA/${alice.uid}`);
  assert.equal(own.full_name, 'Alice A');
  assert.equal(JSON.stringify(own).includes('example.test'), false);
  await allow(pat, `trip_cards/tA/${pat.uid}`);
  await deny(pat, `trip_cards/tA2/${dan.uid}`);
  await deny(pat, 'trip_cards/tA2');
  await deny(pat, `trip_cards/tB/${bob.uid}`);
  // The visibility setting stays readable by trip members (the app applies it).
  await allow(pat, `users/${dan.uid}/participant_visibility`);
  // Index and cards are server-only.
  for (const who of [alice, pat, carol]) {
    await deny(who, 'org_members/orgA');
    await deny(who, `org_members/orgA/${pat.uid}`);
    await deny(who, `org_members/orgA/${who.uid}`, 'PUT', true);
    await deny(who, `trip_cards/tA/${who.uid}`, 'PUT', { v: 1, full_name: 'Forged' });
  }
  // Other allowed flows still pass: own writes and the staff lists they already use.
  await allow(pat, `users/${pat.uid}/full_name`, 'PUT', 'Pat P');
  await allow(alice, 'orgs/orgA/trips/tA');
  await allow(alice, 'trips_participants/tA');
  await allow(pat, 'trips_participants/tA');
  await deny(pat, 'trips_participants/tA2');

  // Server-side maintenance: leave, rejoin, staff removal and profile change.
  await db.ref(`trips_participants/tA/${pat.uid}`).remove();
  await members.onParticipantChanged('tA', pat.uid, false);
  assert.equal((await db.ref(`org_members/orgA/${pat.uid}`).get()).exists(), false);
  assert.equal((await db.ref(`trip_cards/tA/${pat.uid}`).get()).exists(), false);
  await deny(alice, `users/${pat.uid}/profile`);
  await db.ref(`trips_participants/tA/${pat.uid}`).set(true);
  await members.onParticipantChanged('tA', pat.uid, true);
  await allow(alice, `users/${pat.uid}/profile`);
  // Still a participant of another trip of the org: leaving one trip keeps the index.
  await db.ref(`trips_participants/tA2/${pat.uid}`).set(true);
  await db.ref(`trips_participants/tA/${pat.uid}`).remove();
  await members.onParticipantChanged('tA', pat.uid, false);
  assert.equal((await db.ref(`org_members/orgA/${pat.uid}`).get()).val(), true);
  await db.ref(`users/${pat.uid}/full_name`).set('Pat Renamed');
  await db.ref(`users/${pat.uid}/joined_trips/tA2`).set({ org_id: 'orgA' });
  await members.refreshUserCards(pat.uid);
  assert.equal((await db.ref(`trip_cards/tA2/${pat.uid}`).get()).val().full_name, 'Pat Renamed');
  await members.onStaffChanged('orgA', alice.uid, false);
  assert.equal((await db.ref(`org_members/orgA/${alice.uid}`).get()).val(), true, 'staff list not changed in this test');
  await db.ref(`orgs/orgA/staff/${alice.uid}`).remove();
  await members.onStaffChanged('orgA', alice.uid, false);
  assert.equal((await db.ref(`org_members/orgA/${alice.uid}`).get()).exists(), false);
  assert.equal((await db.ref(`trip_cards/tA/${alice.uid}`).get()).exists(), false);
  await deny(alice, `users/${pat.uid}/profile`);

  console.log(`PASS: ${checks} direct RTDB checks plus server index and backfill checks for profile reads.`);
  process.exit(0);
}
main().catch(error => { console.error(error); process.exit(1); });
