// Real RTDB transactions against demo emulators; LiveKit permissions are simulated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError } = require('firebase-functions/v2/https');
const { randomUUID } = require('node:crypto');
const project = process.env.GCLOUD_PROJECT || 'demo-gomusafir';
if (!project.startsWith('demo-') || !process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Demo database emulator required');
const apps = [0, 1].map(id => initializeApp({ projectId: project,
  databaseURL: `https://${project}-default-rtdb.firebaseio.com` }, `speaker-test-${id}`));
const participants = new Map(Array.from({ length: 8 }, (_, i) => [`p${i}`,
  { identity: `p${i}`, sid: `sid${i}`, permission: { canPublish: false } }]));
let peak = 0;
const service = {
  listParticipants: async () => structuredClone([...participants.values()]),
  updateParticipant: async (_, uid, { permission }) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    participants.get(uid).permission = { ...permission };
    peak = Math.max(peak, [...participants.values()].filter(p => p.permission.canPublish).length);
    assert.ok(peak <= 4, `Publisher count exceeded four: ${peak}`);
  },
};
function load(db) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../services/voiceSpeakerService'), 'utf8'), {
    module, exports: module.exports, Date,
    require: name => {
      if (name === 'node:crypto') return { randomUUID };
      if (name === 'firebase-functions/v2/https') return { HttpsError };
      if (name === 'livekit-server-sdk') return { TrackSource: { MICROPHONE: 2 } };
      if (name === '../admin') return { db };
      if (name === './guardedTransaction') return require('../services/guardedTransaction');
      if (name === './tripVoiceService') return { roomService: () => service, STAFF_ROLES: ['admin', 'co-host', 'manager'] };
      throw new Error(name);
    },
  });
  return module.exports.updateSpeakers;
}
async function main() {
  const db = getDatabase(apps[0]);
  await db.ref().update({
    'trip_feature_access/speaker-test/t': { voiceAccess: 'FULL', session: { id: 's', roomName: 'speaker-test-room', status: 'active' } },
    'trips_participants/t': Object.fromEntries([...participants.keys()].map(uid => [uid, true])),
    'voice_speakers/speaker-test/t': null,
    'voice_speaker_locks/speaker-test-room': null,
  });
  const workers = apps.map(app => load(getDatabase(app)));
  const run = async (index, command) => {
    for (let attempt = 0; ; attempt++) {
      try { return await workers[index % 2]('speaker-test', 't', command); }
      catch (error) {
        if (error.code !== 'aborted' || attempt > 100) throw error;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
  };
  await Promise.all([...participants.values()].map((p, index) => run(index,
    { action: 'request', uid: p.identity, requestId: p.identity, participantSid: p.sid })));
  let state = (await db.ref('voice_speakers/speaker-test/t').get()).val();
  assert.equal(Object.values(state.entries).filter(e => e.status === 'granted').length, 4);
  assert.equal(Object.values(state.entries).filter(e => e.status === 'queued').length, 4);
  const speakers = Object.entries(state.entries).filter(([, e]) => e.status === 'granted').map(([uid]) => uid);
  await Promise.all(speakers.map((uid, index) => run(index, { action: 'release', uid, requestId: uid })));
  state = (await db.ref('voice_speakers/speaker-test/t').get()).val();
  assert.equal(Object.keys(state.entries).length, 4);
  assert.ok(Object.values(state.entries).every(e => e.status === 'granted'));
  assert.equal(peak, 4);
  console.log('PASS: two independent RTDB clients, eight concurrent requests, four concurrent releases, peak four publisher permissions.');
}
main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => Promise.all(apps.map(deleteApp)));
