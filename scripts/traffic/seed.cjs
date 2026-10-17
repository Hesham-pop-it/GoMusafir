// Seeds one active trip with N fake pilgrims and one admin into the local
// emulators. Only fake data; it talks to the emulators directly, not the proxy.
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:19500';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19599';
const path = require('path');
const admin = require(path.resolve(__dirname, '../../functions/node_modules/firebase-admin'));

const PROJECT = 'demo-gomusafir';
const ORG = 'org_traffic';
const TRIP = 'trip_traffic';
const PASSWORD = 'traffic-pass-1';

async function seed(users) {
  const app = admin.initializeApp({ projectId: PROJECT, databaseURL: `http://127.0.0.1:19500?ns=${PROJECT}-default-rtdb` });
  const db = app.database();
  const now = Date.now();
  const staffUid = 'staff_0';
  const uids = Array.from({ length: users }, (_, i) => `vu_${i}`);
  // Clearing hundreds of people in one write exceeds the trigger limit too.
  for (const parent of ['users', `trips_participants/${TRIP}`, 'app_access']) {
    const ids = Object.keys((await db.ref(parent).get()).val() || {});
    for (let i = 0; i < ids.length; i += 50) {
      await db.ref(parent).update(Object.fromEntries(ids.slice(i, i + 50).map(id => [id, null])));
    }
  }
  await db.ref().set(null);
  await fetch(`http://127.0.0.1:19599/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  const data = {
    trips_orgs: { [TRIP]: ORG },
    trips_participants: { [TRIP]: Object.fromEntries(uids.map(uid => [uid, true])) },
    orgs: { [ORG]: {
      metadata: { name: 'Traffic Org' },
      staff: { [staffUid]: 'admin' },
      trips: { [TRIP]: {
        name: 'Traffic Umrah', status: 'active', start_date: now - 86400000, end_date: now + 7 * 86400000,
        invitation_code: 'TRAFFIC1',
        visibility_config: { name: 'Show to everyone', lastname: 'Show to everyone', photo: 'Show to everyone', email: 'Do not show', phone: 'Do not show', location: 'Show to everyone' },
      } },
    } },
    users: {},
  };
  const record = (uid, i, staff) => ({
    account_type: staff ? 'business' : 'participant',
    full_name: `Pilgrim ${i} Example`,
    email: `${uid}@traffic.test`,
    profile: { firstName: 'Pilgrim', lastName: `${i} Example`, email: `${uid}@traffic.test`, phone: `+3160000${String(i).padStart(4, '0')}`,
      photoURL: `https://example.invalid/avatars/${uid}.jpg` },
    photo_url: `https://example.invalid/avatars/${uid}.jpg`,
    current_trip: TRIP,
    joined_trips: staff ? {} : { [TRIP]: { org_id: ORG, joined_at: now } },
    participant_visibility: { [TRIP]: { name: 'Show to everyone', photo: 'Show to everyone', location: 'Show to everyone' } },
    settings: { language: 'en', notifications: true },
  });
  uids.forEach((uid, i) => { data.users[uid] = record(uid, i, false); });
  data.users[staffUid] = record(staffUid, 'staff', true);
  // One write may fire at most 1000 triggers, so people are added in batches.
  const people = data.users, members = data.trips_participants[TRIP];
  data.users = {}; data.trips_participants = {};
  await db.ref().update(data);
  const ids = Object.keys(people);
  for (let i = 0; i < ids.length; i += 50) {
    const batch = {};
    for (const uid of ids.slice(i, i + 50)) {
      batch[`users/${uid}`] = people[uid];
      if (members[uid]) batch[`trips_participants/${TRIP}/${uid}`] = true;
    }
    await db.ref().update(batch);
  }
  data.users = people;

  const auth = app.auth();
  const all = [...uids, staffUid];
  for (let i = 0; i < all.length; i += 50) {
    await Promise.all(all.slice(i, i + 50).map(async uid => {
      await auth.createUser({ uid, email: `${uid}@traffic.test`, password: PASSWORD });
      if (uid === staffUid) await auth.setCustomUserClaims(uid, { orgId: ORG, role: 'admin' });
    }));
  }
  // The server-written directory views and chat mirror, as backfillTripViews.js writes them.
  process.env.GCLOUD_PROJECT = PROJECT;
  const { writeTripView, mirrorRecentChat } = require(path.resolve(__dirname, '../../functions/services/tripViewService'));
  await writeTripView(TRIP);
  await mirrorRecentChat(TRIP);
  const size = Buffer.byteLength(JSON.stringify(data.users[uids[0]]));
  console.log(JSON.stringify({ users: uids.length, staff: 1, userRecordBytes: size }));
  await app.delete();
}

if (require.main === module) {
  seed(Number(process.argv[2] || 25)).catch(error => { console.error(error); process.exit(1); });
}
module.exports = { ORG, TRIP, PASSWORD, PROJECT };
