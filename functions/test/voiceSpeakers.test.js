const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  let now = 1000, sequence = 0, failUid, peak = 0;
  const data = new Map([
    ['trip_feature_access/o/t', { voiceAccess: 'FULL', session: { id: 'session', roomName: 'room', status: 'active' } }],
    ['orgs/o/staff', { host: 'admin', cohost: 'co-host', manager: 'manager' }],
    ['trips_participants/t', Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map(uid => [uid, true]))],
  ]);
  const participants = new Map(['host', 'cohost', 'manager', 'a', 'b', 'c', 'd', 'e', 'f'].map(uid =>
    [uid, { identity: uid, sid: `sid-${uid}`, permission: { canPublish: false } }]));
  const writes = [];
  const snapshot = path => ({ val: () => structuredClone(data.get(path) || null) });
  const db = { ref: path => ({
    on: (_, listener) => listener(snapshot(path)), off() {},
    get: async () => snapshot(path),
    set: async value => { data.set(path, structuredClone(value)); },
    transaction: async change => {
      const next = change(structuredClone(data.get(path) || null));
      if (next !== undefined) data.set(path, structuredClone(next));
      return { committed: next !== undefined, snapshot: snapshot(path) };
    },
  }) };
  const service = {
    listParticipants: async () => structuredClone([...participants.values()]),
    updateParticipant: async (room, uid, { permission }) => {
      if (uid === failUid) throw new Error('LiveKit unreachable');
      assert.equal(room, 'room');
      assert.deepEqual(Array.from(permission.canPublishSources), [2]);
      participants.get(uid).permission = { ...permission };
      writes.push({ uid, enabled: permission.canPublish });
      peak = Math.max(peak, [...participants.values()].filter(p => p.permission.canPublish).length);
      assert.ok(peak <= 4, 'LiveKit must never receive a fifth simultaneous publisher grant');
    },
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../services/voiceSpeakerService'), 'utf8'), {
    module, exports: module.exports, Date: { now: () => now }, console,
    require: name => {
      if (name === 'node:crypto') return { randomUUID: () => `lock-${++sequence}` };
      if (name === 'firebase-functions/v2/https') return { HttpsError };
      if (name === 'livekit-server-sdk') return { TrackSource: { MICROPHONE: 2 } };
      if (name === '../admin') return { db };
      if (name === './guardedTransaction') return require('../services/guardedTransaction');
      if (name === './tripVoiceService') return { roomService: () => service, STAFF_ROLES: ['admin', 'co-host', 'manager'] };
      throw new Error(name);
    },
  });
  const update = command => module.exports.updateSpeakers('o', 't', command);
  const request = (uid, id = uid) => update({ action: 'request', uid, participantSid: participants.get(uid)?.sid,
    roomName: 'room', requestId: id });
  const release = (uid, id = uid) => update({ action: 'release', uid, requestId: id });
  const state = () => structuredClone(data.get('voice_speakers/o/t'));
  return { update, request, release, state, data, participants, writes, peak: () => peak,
    fail: uid => { failUid = uid; }, advance: ms => { now += ms; } };
}

test('four total slots include staff; fifth and sixth requests wait in FIFO order', async () => {
  const f = fixture();
  for (const uid of ['host', 'cohost', 'manager', 'a', 'b', 'c']) await f.request(uid);
  assert.equal(f.peak(), 4);
  assert.equal(f.state().entries.b.status, 'queued');
  assert.equal(f.state().entries.c.status, 'queued');
  await f.release('host');
  assert.equal(f.state().entries.b.status, 'granted');
  assert.equal(f.state().entries.c.status, 'queued');
  assert.deepEqual(f.writes.slice(-2), [{ uid: 'host', enabled: false }, { uid: 'b', enabled: true }]);
});

test('simultaneous requests cannot race past capacity; aborted operations can retry', async () => {
  const f = fixture();
  const uids = ['host', 'a', 'b', 'c', 'd', 'e'];
  const outcomes = await Promise.allSettled(uids.map(uid => f.request(uid)));
  for (let i = 0; i < outcomes.length; i++) {
    if (outcomes[i].status === 'rejected') {
      assert.equal(outcomes[i].reason.code, 'aborted');
      await f.request(uids[i]);
    }
  }
  assert.equal(Object.values(f.state().entries).filter(e => e.status === 'granted').length, 4);
  assert.equal(Object.values(f.state().entries).filter(e => e.status === 'queued').length, 2);
});

test('cancelling a queued request does not claim the next free slot', async () => {
  const f = fixture();
  for (const uid of ['host', 'a', 'b', 'c', 'd', 'e']) await f.request(uid);
  await f.release('d');
  await f.release('a');
  assert.equal(f.state().entries.d, undefined);
  assert.equal(f.state().entries.e.status, 'granted');
});

test('failed revocation never grants the next slot; retry repairs persisted intent', async () => {
  const f = fixture();
  for (const uid of ['host', 'a', 'b', 'c', 'd']) await f.request(uid);
  f.fail('a');
  await assert.rejects(f.release('a'), /unreachable/);
  assert.equal(f.participants.get('d').permission.canPublish, false);
  f.fail(null);
  await f.update();
  assert.equal(f.participants.get('a').permission.canPublish, false);
  assert.equal(f.state().entries.d.status, 'granted');
});

test('failed grant is recoverable without losing queue order or adding a fifth slot', async () => {
  const f = fixture();
  f.fail('a');
  await assert.rejects(f.request('a'), /unreachable/);
  assert.equal(f.state().entries.a.status, 'granting');
  f.fail(null);
  await f.update();
  assert.equal(f.state().entries.a.status, 'granted');
});

test('disconnects, changed connection IDs and revoked membership free slots', async () => {
  const f = fixture();
  for (const uid of ['host', 'a', 'b', 'c', 'd', 'e']) await f.request(uid);
  f.participants.delete('a');
  f.participants.get('b').sid = 'new-sid';
  delete f.data.get('trips_participants/t').c;
  await f.update();
  assert.deepEqual(Object.keys(f.state().entries).sort(), ['d', 'e', 'host']);
  assert.equal(f.participants.get('b').permission.canPublish, false);
  assert.equal(f.participants.get('c').permission.canPublish, false);
});

test('global mute clears participant slots and queue while retaining staff slots', async () => {
  const f = fixture();
  for (const uid of ['host', 'a', 'b', 'c', 'd']) await f.request(uid);
  f.data.set('trips_active/o/t/voice_channel/isAllMuted', true);
  await f.update();
  assert.deepEqual(Object.keys(f.state().entries), ['host']);
  await assert.rejects(f.request('a'), { code: 'permission-denied' });
});

test('organizers prioritize and revoke; participants cannot moderate', async () => {
  const f = fixture();
  for (const uid of ['host', 'a', 'b', 'c', 'd', 'e']) await f.request(uid);
  await assert.rejects(f.update({ action: 'revoke', uid: 'a', targetUid: 'host' }), { code: 'permission-denied' });
  await f.update({ action: 'grant', uid: 'manager', targetUid: 'e' });
  await f.update({ action: 'revoke', uid: 'cohost', targetUid: 'c' });
  assert.equal(f.state().entries.e.status, 'granted');
  assert.equal(f.state().entries.d.status, 'queued');
  await assert.rejects(f.update({ action: 'grant', uid: 'host', targetUid: 'f' }), { code: 'failed-precondition' });
});

test('duplicate requests and stale releases do not consume or revoke another request', async () => {
  const f = fixture();
  await f.request('a', 'first');
  await f.request('a', 'first');
  await f.request('a', 'second');
  await f.release('a', 'first');
  assert.equal(f.state().entries.a.requestId, 'second');
  assert.equal(Object.keys(f.state().entries).length, 1);
});

test('stale sessions and disconnected requesters are rejected', async () => {
  const f = fixture();
  await assert.rejects(f.update({ action: 'request', uid: 'a', roomName: 'old-room' }), { code: 'failed-precondition' });
  await assert.rejects(f.update({ action: 'request', uid: 'a', participantSid: 'old-sid' }), { code: 'failed-precondition' });
  f.data.get('trip_feature_access/o/t').session.status = 'ending';
  await assert.rejects(f.request('a'), { code: 'failed-precondition' });
});

test('an abandoned room lock expires without resetting the speaker ledger', async () => {
  const f = fixture();
  await f.request('a');
  f.data.set('voice_speaker_locks/room', { owner: 'crashed-worker', until: 5000 });
  await assert.rejects(f.request('b'), { code: 'aborted' });
  f.advance(5000);
  await f.request('b');
  assert.deepEqual(Object.keys(f.state().entries), ['a', 'b']);
});

test('a delayed old-room update cannot overwrite a newer session queue', async () => {
  const f = fixture();
  const newer = { sessionId: 'new-session', sessionRequestedAt: 2000, entries: {} };
  f.data.set('voice_speakers/o/t', newer);
  await assert.rejects(f.request('a'), { code: 'failed-precondition' });
  assert.deepEqual(f.state(), newer);
  assert.deepEqual(f.writes, []);
});
