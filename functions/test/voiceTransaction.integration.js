// Exercise the actual RTDB SDK retry path; never connect this test to production.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const admin = require('firebase-admin');
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
if (!host || !project.startsWith('demo-')) throw new Error('Demo database emulator required');
const options = { projectId: project, databaseURL: `http://${host}?ns=${project}-default-rtdb` };

async function main() {
  const seed = admin.initializeApp(options, 'seed');
  const client = admin.initializeApp(options, 'cold-transaction');
  const now = Date.now();
  const trip = { status: 'active', start_date: now + 3 * 86400000, end_date: now + 4 * 86400000 };
  const ledger = 'trip_feature_access/retry-test/trip';
  try {
    await seed.database().ref('orgs/retry-test/trips/trip').set(trip);
    await seed.database().ref(ledger).set({ session: { id: 'ending-session', status: 'ending' } });
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../services/tripVoiceService'), 'utf8'), {
      module, exports: module.exports, Date, console, process,
      require: name => name === '../admin' ? { db: client.database() } :
        name === 'livekit-server-sdk' ? { RoomServiceClient: class { async deleteRoom() {} } } :
        name === './guardedTransaction' ? require('../services/guardedTransaction') :
        name === './tripFeatureState' ? require('../services/tripFeatureState') : require(name),
    });
    let attempts = 0;
    const expected = new (require('firebase-functions/v2/https').HttpsError)(
      'failed-precondition', 'Voice Chat is ending. Please try again shortly.');
    let timer;
    try {
      await assert.rejects(Promise.race([
        module.exports.updateState('retry-test', 'trip', state => {
          attempts++;
          if (state.session?.status === 'ending') throw expected;
          return state;
        }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Transaction hung')), 5000); }),
      ]), error => error === expected);
    } finally { clearTimeout(timer); }
    assert.ok(attempts >= 2, 'Must exercise a real SDK retry, not just the initial callback');
    assert.equal((await seed.database().ref(`${ledger}/session/id`).get()).val(), 'ending-session');
    console.log(`PASS: real SDK retried ${attempts} times, rejected correctly, and preserved the session`);
    await seed.database().ref(ledger).set({ preTripVoiceUsedMs: 10228, session: {
      id: 'ending-session', status: 'ending', roomName: 'test-room', requestedAt: now,
      requestedBy: 'host', endReason: 'host_stopped',
    } });
    await module.exports.refreshFeatures('retry-test', 'trip');
    const cleaned = (await seed.database().ref(ledger).get()).val();
    assert.equal(cleaned.session, undefined, 'Cleanup must clear a real ending session on a cold SDK cache');
    assert.equal(cleaned.preTripVoiceUsedMs, 10228);
    assert.equal(cleaned.lastEndedSession.id, 'ending-session');
    console.log('PASS: cold-cache cleanup clears the ending lock and preserves usage/history');
    await seed.database().ref('orgs/retry-test/staff/host').set('admin');
    const restarted = await module.exports.reserveSession('retry-test', 'trip', true, 'host');
    assert.equal(restarted.session.status, 'pending');
    assert.notEqual(restarted.session.id, 'ending-session');
    assert.equal(restarted.preTripVoiceUsedMs, 10228);
    await module.exports.handleRoomEvent({ event: 'participant_joined', createdAt: Date.now() / 1000,
      room: { name: restarted.session.roomName, sid: 'new-room' }, participant: { identity: 'host' } });
    assert.equal((await seed.database().ref(`${ledger}/session/status`).get()).val(), 'active');
    await module.exports.stopSession('retry-test', 'trip');
    assert.equal((await seed.database().ref(`${ledger}/session`).get()).val(), null);
    console.log('PASS: restart, webhook activation, and stop complete on cold SDK caches');
  } finally {
    await Promise.all([seed.delete(), client.delete()]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
