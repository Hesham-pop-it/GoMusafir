// Only demo emulators: exercises real RTDB rules, never production.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!databaseHost || !authHost || !project.startsWith('demo-')) throw new Error('Demo emulators required');
const base = `http://${databaseHost}`, ns = `${project}-default-rtdb`;
const DAY = 86400000;
async function main() {
  const users = {};
  for (const role of ['admin', 'manager', 'co-host', 'participant']) {
    const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${role}-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }),
    });
    const { localId: uid, idToken: token } = await response.json();
    assert.ok(uid && token); users[role] = { uid, token };
  }
  const now = Date.now(), start = now + 90 * DAY, end = start + 14 * DAY;
  const staff = {}, participants = {}, appAccess = {};
  for (const [role, { uid }] of Object.entries(users)) {
    if (role !== 'participant') staff[uid] = role;
    participants[uid] = true;
    appAccess[uid] = { expires_at: end, revoked_before: 0, staff: role !== 'participant' };
  }
  const owner = await fetch(`${base}/.json?ns=${ns}`, { method: 'PUT',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgs: { o: { staff, trips: { t: { status: 'active', start_date: start, end_date: end } } } },
      trips_orgs: { t: 'o' }, trips_participants: { t: participants }, app_access: appAccess,
      trip_feature_access: { o: { t: { voiceAccess: 'PRE_TRIP_LIMITED', preTripVoiceUsedSeconds: 120 } } },
    }),
  });
  assert.equal(owner.status, 200, await owner.text());
  let checks = 0;
  const check = async (role, path, method, value, allowed) => {
    const response = await fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(users[role].token)}`, {
      method, headers: { 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
    assert.equal(response.status, allowed ? 200 : 401, `${role} ${path}: ${await response.text()}`); checks++;
  };
  for (const role of Object.keys(users)) {
    await check(role, 'orgs/o/trips/t', 'GET', undefined, true);
    await check(role, 'trips_participants/t', 'GET', undefined, true);
    await check(role, 'trip_feature_access/o/t', 'GET', undefined, true);
    await check(role, 'trip_feature_access/o/t/preTripVoiceUsedSeconds', 'PUT', 0, false);
    await check(role, 'trip_feature_access/o/t', 'PUT', { voiceAccess: 'FULL' }, false);
    await check(role, 'voice_rooms/forged', 'PUT', { tripId: 't', orgId: 'o' }, false);
    await check(role, 'trips_active/o/t/voice_channel/isChannelStarted', 'PUT', true, false);
    await check(role, 'trips_active/o/t/voice_channel', 'PUT', { isChannelStarted: true }, false);
    await check(role, 'orgs/o/trips/t/voice_state/is_active', 'PUT', true, false);
    if (role !== 'participant') {
      await check(role, 'orgs/o/trips/t/end_date', 'PUT', start + 31 * DAY, false);
      await check(role, 'orgs/o/trips/t/end_date', 'PUT', end, true);
      await check(role, 'trips_active/o/t/voice_channel/isAllMuted', 'PUT', true, true);
      await check(role, `trips_active/o/t/voice_channel/active_hosts/${users[role].uid}`, 'PUT', true, true);
    }
  }
  const uid = users.participant.uid;
  await check('participant', `trips_active/o/t/chat/early`, 'PUT', { sender_id: uid, text: 'Preparing for our trip', timestamp: now }, true);
  await check('participant', `trips_active/o/t/locations/${uid}`, 'PUT', { lat: 1, lng: 2 }, true);
  await check('participant', `trips_active/o/t/voice_channel/active_hosts/${uid}`, 'PUT', true, false);
  console.log(`PASS: ${checks} Voice ownership, duration and early-access rule checks.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
