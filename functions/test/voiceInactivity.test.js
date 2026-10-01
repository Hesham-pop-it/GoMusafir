const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { everyoneMuted, observe, answer, INACTIVITY_MS } = require('../services/voiceInactivityState');
const muted = identity => ({ identity, tracks: [{ type: 0, muted: true }] });
const initial = { roomSid: 'room', muted: true, now: 1000, id: 'question' };

test('all connected users count, including unpublished microphones and staff', () => {
  assert.equal(everyoneMuted([]), false);
  assert.equal(everyoneMuted([muted('admin'), muted('manager'), muted('co-host'), { identity: 'participant' }]), true);
  for (const identity of ['admin', 'manager', 'co-host', 'participant']) {
    assert.equal(everyoneMuted([muted('other'), { identity, tracks: [{ type: 0, muted: false }] }]), false);
  }
});
test('continued silence preserves deadline; speech/unmute resets it; stale observations cannot restore it', () => {
  let state = observe(null, initial);
  assert.equal(observe(state, { ...initial, now: 5000, id: 'other' }).startedAt, 1000);
  state = observe(state, { ...initial, now: 6000, activity: true });
  assert.equal(state.status, 'active');
  assert.equal(observe(state, { ...initial, now: 5000 }), undefined);
  state = observe(state, { ...initial, now: 7000, id: 'next' });
  assert.equal(state.startedAt, 7000);
  assert.equal(state.id, 'next');
});
test('pending has no timeout and accepts only first valid response', () => {
  const pending = { ...observe(null, initial), status: 'pending' };
  assert.equal(observe(pending, { ...initial, now: 9999999, activity: true }), undefined);
  assert.equal(answer(pending, 'stale', false, 400000, true, 'host'), undefined);
  const yes = answer(pending, pending.id, true, 400000, true, 'host');
  assert.equal(yes.startedAt, 400000);
  assert.equal(yes.status, 'timing');
  assert.notEqual(yes.id, pending.id);
  assert.equal(answer(yes, pending.id, false, 400001, true, 'other-host'), undefined);
  const no = answer(pending, pending.id, false, 400000, true, 'host');
  assert.equal(no.status, 'ending');
  assert.equal(answer(no, pending.id, true, 400001, true, 'other-host'), undefined);
  assert.equal(answer(pending, pending.id, true, 400000, false, 'host').status, 'active');
});

function fixture() {
  let now = 1000;
  const store = {
    'trips_active/o/t/voice_channel/isChannelStarted': true,
    'orgs/o/staff/host': 'admin',
    'orgs/o/staff/other': 'co-host',
    'orgs/o/staff': { host: 'admin', other: 'co-host', absent: 'manager', participant: 'participant' },
  };
  let participants = [muted('host'), muted('other'), muted('participant')];
  let rooms = [{ sid: 'room' }];
  let failLive = false;
  let deleted = 0;
  const queued = [];
  const notifications = [];
  const snapshot = value => ({ val: () => value });
  const db = { ref: (path = '') => ({
    on: (_, listener) => { listener(); },
    off: () => {},
    get: async () => snapshot(store[path]),
    transaction: async callback => {
      const next = callback(store[path] ?? null);
      if (next !== undefined) store[path] = next;
      return { committed: next !== undefined, snapshot: snapshot(store[path]) };
    },
    update: async changes => Object.assign(store, changes),
  }) };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const exports = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../groups/voiceInactivityFunctions'), 'utf8'), {
    exports, Date: { now: () => now }, console,
    require: name => {
      if (name === 'node:crypto') return { randomUUID: () => `id-${now}` };
      if (name === 'firebase-functions/v2/https') return { HttpsError };
      if (name.includes('participantAccessMiddleware')) return { onCall: (_, fn) => fn };
      if (name === 'firebase-functions/v2/database') return { onValueWritten: (_, fn) => fn };
      if (name === 'firebase-functions/v2/tasks') return { onTaskDispatched: (_, fn) => fn };
      if (name === 'firebase-admin/functions') return { getFunctions: () => ({ taskQueue: () => ({ enqueue: async (data, options) => queued.push({ data, options }) }) }) };
      if (name === 'livekit-server-sdk') return { RoomServiceClient: class {
        async listRooms() { if (failLive) throw new Error('offline'); return rooms; }
        async listParticipants() { return participants; }
        async deleteRoom() { deleted++; rooms = []; }
      } };
      if (name.includes('participantAccessService')) return { requireTripAccess: async () => ({ orgId: 'o' }) };
      if (name === '../admin') return { db };
      if (name.includes('notificationService')) return { sendPushNotification: async (...args) => notifications.push(args) };
      if (name.includes('tripVoiceService')) return {
        accessRef: () => ({ get: async () => snapshot({ session: { id: 'session', roomName: 'voice-room', roomSid: 'room', status: 'active' } }) }),
        stopSession: async () => { deleted++; rooms = []; store['trips_active/o/t/voice_channel/isChannelStarted'] = false; },
      };
      if (name.includes('guardedTransaction')) return require('../services/guardedTransaction');
      if (name.includes('voiceInactivityState')) return require('../services/voiceInactivityState');
      throw new Error(name);
    }, process: { env: {} },
  });
  const request = (uid, data = {}) => ({ auth: { uid }, data: { tripId: 't', ...data } });
  const path = 'voice_inactivity/o/t';
  return { api: exports, store, queued, notifications, request,
    setTime: value => { now = value; }, setParticipants: value => { participants = value; },
    fail: () => { failLive = true; }, deleted: () => deleted,
    state: () => store[path],
    event: before => ({ params: { orgId: 'o', tripId: 't' }, data: { before: snapshot(before), after: snapshot(store[path]) } }),
    task: id => ({ data: { orgId: 'o', tripId: 't', id: id || store[path].id } }),
  };
}
async function pending(f) {
  await f.api.reportVoiceActivity(f.request('host'));
  f.setTime(1000 + INACTIVITY_MS);
  await f.api.checkVoiceInactivity(f.task());
  assert.equal(f.state().status, 'pending');
}
test('durable timer waits five minutes and does not close an unanswered prompt', async () => {
  const f = fixture();
  await f.api.reportVoiceActivity(f.request('host'));
  await f.api.onVoiceInactivityChanged(f.event(null));
  assert.equal(f.queued[0].options.scheduleDelaySeconds, 300);
  f.setTime(300999);
  await assert.rejects(f.api.checkVoiceInactivity(f.task()), /not due/);
  f.setTime(301000);
  await f.api.checkVoiceInactivity(f.task());
  assert.equal(f.state().status, 'pending');
  f.setTime(99999999);
  await f.api.checkVoiceInactivity(f.task());
  assert.equal(f.deleted(), 0);
});
test('participants and disconnected staff cannot answer', async () => {
  const f = fixture(); await pending(f);
  const data = { promptId: f.state().id, keepActive: false };
  await assert.rejects(f.api.respondToVoiceInactivity(f.request('participant', data)), { code: 'permission-denied' });
  f.setParticipants([muted('other')]);
  await assert.rejects(f.api.respondToVoiceInactivity(f.request('host', data)), { code: 'failed-precondition' });
  assert.equal(f.state().status, 'pending');
});
test('simultaneous Yes/No answers have one winner; No closes database and LiveKit', async () => {
  const f = fixture(); await pending(f);
  const data = { promptId: f.state().id, keepActive: false };
  const results = await Promise.all([
    f.api.respondToVoiceInactivity(f.request('host', data)),
    f.api.respondToVoiceInactivity(f.request('other', { ...data, keepActive: true })),
  ]);
  assert.equal(results.filter(r => r.accepted).length, 1);
  assert.equal(f.deleted(), 1);
  assert.equal(f.store['trips_active/o/t/voice_channel/isChannelStarted'], false);
  assert.equal(f.state().status, 'ended');
});
test('Yes re-arms a full five minutes and stale task cannot prompt again', async () => {
  const f = fixture(); await pending(f);
  const old = f.state();
  await f.api.respondToVoiceInactivity(f.request('host', { promptId: old.id, keepActive: true }));
  await f.api.onVoiceInactivityChanged(f.event(old));
  assert.equal(f.queued[0].options.scheduleDelaySeconds, 300);
  await f.api.checkVoiceInactivity(f.task(old.id));
  assert.equal(f.state().status, 'timing');
  f.setTime(601000);
  await f.api.checkVoiceInactivity(f.task());
  assert.equal(f.state().status, 'pending');
});
test('LiveKit failure cannot produce a prompt; unmuted participant cancels timer at expiry', async () => {
  const f = fixture(); await f.api.reportVoiceActivity(f.request('host'));
  f.setTime(301000); f.fail();
  await assert.rejects(f.api.checkVoiceInactivity(f.task()), /offline/);
  assert.equal(f.state().status, 'timing');
  const g = fixture(); await g.api.reportVoiceActivity(g.request('host'));
  g.setTime(301000); g.setParticipants([{ identity: 'participant', tracks: [{ type: 0, muted: false }] }]);
  await g.api.checkVoiceInactivity(g.task());
  assert.equal(g.state().status, 'active');
});


test('only connected staff receive push; participants and absent managers never receive it', async () => {
  const f = fixture(); await pending(f);
  await f.api.onVoiceInactivityChanged(f.event({ status: 'timing' }));
  assert.deepEqual(f.notifications.map(args => args[0]).sort(), ['host', 'other']);
});
test('short activity cancels old task even when microphone is already muted again', async () => {
  const f = fixture(); await f.api.reportVoiceActivity(f.request('host'));
  const oldId = f.state().id;
  f.setTime(300999);
  await f.api.reportVoiceActivity(f.request('participant', { activity: true }));
  assert.equal(f.state().status, 'active');
  await f.api.reportVoiceActivity(f.request('participant'));
  await f.api.checkVoiceInactivity(f.task(oldId));
  assert.equal(f.state().status, 'timing');
  assert.equal(f.state().startedAt, 300999);
});
test('new room never inherits a previous session prompt', () => {
  const old = { ...observe(null, initial), status: 'pending' };
  const next = observe(old, { ...initial, roomSid: 'new-room', now: 600000, id: 'new-question' });
  assert.equal(next.status, 'timing');
  assert.equal(next.startedAt, 600000);
  assert.equal(answer(next, old.id, false, 600001, true, 'host'), undefined);
});

test('connected managers receive the confirmation and can keep the room active', async () => {
  const f = fixture();
  f.store['orgs/o/staff/manager'] = 'manager';
  f.store['orgs/o/staff'].manager = 'manager';
  f.setParticipants([muted('host'), muted('manager'), muted('participant')]);
  await pending(f);
  await f.api.onVoiceInactivityChanged(f.event({ status: 'timing' }));
  assert.deepEqual(f.notifications.map(args => args[0]).sort(), ['host', 'manager']);
  const response = await f.api.respondToVoiceInactivity(f.request('manager', {
    promptId: f.state().id, keepActive: true,
  }));
  assert.equal(response.accepted, true);
  assert.equal(f.state().status, 'timing');
  assert.equal(f.deleted(), 0);
});

test('ending event completes a committed No after the responding request disappears', async () => {
  const f = fixture(); await pending(f);
  const before = f.state();
  f.store['voice_inactivity/o/t'] = answer(before, before.id, false, 301000, true, 'host');
  await f.api.onVoiceInactivityChanged(f.event(before));
  assert.equal(f.deleted(), 1);
  assert.equal(f.state().status, 'ended');
});
