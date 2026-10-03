const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { featureState, settle, validTripDates, DAY_MS } = require('../services/tripFeatureState');
const START = Date.UTC(2027, 7, 8, 10);
const END = Date.UTC(2027, 7, 22, 10);
const MAY = Date.UTC(2027, 4, 14, 10);
const trip = { status: 'active', start_date: START, end_date: END };

test('trip duration uses selected dates, independent of creation/enrollment', () => {
  assert.equal(validTripDates(START, END), true);
  assert.equal(validTripDates(START, START + 30 * DAY_MS), true);
  assert.equal(validTripDates(START, START + 30 * DAY_MS + 1), true);
  for (const dates of [[START, START], ['tomorrow', END], [NaN, END], [END, START]]) assert.equal(validTripDates(...dates), false);
  assert.equal(featureState(trip, MAY).tripStatus, 'UPCOMING');
});
test('central states switch at the exact 24-hour/start/end boundaries', () => {
  assert.equal(featureState(trip, START - DAY_MS - 1).voiceAccess, 'PRE_TRIP_LIMITED');
  assert.equal(featureState(trip, START - DAY_MS).voiceAccess, 'FULL');
  assert.equal(featureState(trip, START - 1).tripStatus, 'UPCOMING');
  assert.equal(featureState(trip, START).tripStatus, 'LIVE');
  assert.equal(featureState(trip, END - 1).voiceAccess, 'FULL');
  assert.equal(featureState(trip, END).voiceAccess, 'EXPIRED');
});

function fixture({ coldCache = false } = {}) {
  let now = MAY, sequence = 0, failDelete = false, failList = false, failedWritePath = null, retryValue;
  const data = { orgs: { o: { trips: { t: structuredClone(trip) }, staff: { host: 'admin', other: 'co-host', manager: 'manager' } } } };
  const rooms = new Map(), deleted = [], notifications = [], queued = [];
  const listeners = new Set();
  const read = path => path.split('/').filter(Boolean).reduce((value, key) => value?.[key], data) ?? null;
  const write = (path, value) => {
    const parts = path.split('/').filter(Boolean); let at = data;
    for (const key of parts.slice(0, -1)) at = at[key] ||= {};
    at[parts.at(-1)] = structuredClone(value);
  };
  const snap = value => ({ val: () => structuredClone(value), exists: () => value != null });
  const db = { ref: (path = '') => ({
    on: (_, listener) => { listeners.add(path); listener(snap(read(path))); },
    off: () => { listeners.delete(path); },
    get: async () => snap(read(path)),
    set: async value => write(path, value),
    transaction: async callback => {
      if (path === failedWritePath) { failedWritePath = null; throw new Error('Interrupted status write'); }
      let next;
      if (coldCache && !listeners.has(path)) {
        next = callback(null);
        // Returning undefined aborts without checking the existing server data.
        if (next === undefined) return { committed: false, snapshot: snap(null) };
      }
      assert.doesNotThrow(() => { next = callback(structuredClone(read(path))); },
        'RTDB update callbacks must abort, not throw into the SDK event loop');
      if (retryValue !== undefined && next !== undefined) {
        const value = retryValue; retryValue = undefined;
        write(path, value);
        await new Promise(resolve => setImmediate(resolve));
        assert.doesNotThrow(() => { next = callback(structuredClone(value)); },
          'RTDB retry callbacks must return undefined for a rejected state');
      }
      if (next !== undefined) write(path, next);
      return { committed: next !== undefined, snapshot: snap(read(path)) };
    },
    update: async values => { for (const [key, value] of Object.entries(values)) write([path, key].filter(Boolean).join('/'), value); },
  }) };
  class HttpsError extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } }
  const livekit = { RoomServiceClient: class {
    async deleteRoom(name) { if (failDelete) throw new Error('LiveKit unavailable'); deleted.push(name); rooms.delete(name); }
    async listRooms(names) { if (failList) throw new Error('LiveKit unavailable'); return names.filter(name => rooms.has(name)).map(name => ({ name, sid: rooms.get(name).sid })); }
    async listParticipants(name) { if (failList) throw new Error('LiveKit unavailable'); return rooms.get(name)?.participants || []; }
  } };
  let service;
  const load = file => {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve(file), 'utf8'), { module, exports: module.exports,
      Date: { now: () => now }, console, process: { env: {} },
      require: name => {
        if (name === 'node:crypto') return { randomUUID: () => `id-${++sequence}` };
        if (name === '../admin') return { db };
        if (name === 'livekit-server-sdk') return livekit;
        if (name === 'firebase-functions/v2/https') return { HttpsError };
        if (name.includes('guardedTransaction')) return require('../services/guardedTransaction');
        if (name.includes('tripFeatureState')) return require('../services/tripFeatureState');
        if (name.includes('tripVoiceService')) return service;
        if (name.includes('notificationService')) return { sendPushNotification: async (...args) => notifications.push(args) };
        if (name.includes('participantAccessMiddleware')) return { onCall: (_, callback) => callback };
        if (name.includes('participantAccessService')) return { requireTripAccess: async () => ({ orgId: 'o' }) };
        if (name === 'firebase-functions/v2/database') return { onValueWritten: (_, callback) => callback };
        if (name === 'firebase-functions/v2/tasks') return { onTaskDispatched: (_, callback) => callback };
        if (name === 'firebase-functions/v2/scheduler') return { onSchedule: (_, callback) => callback };
        if (name === 'firebase-admin/functions') return { getFunctions: () => ({ taskQueue: () => ({ enqueue: async (...args) => queued.push(args) }) }) };
        throw new Error(name);
      },
    });
    return module.exports;
  };
  service = load('../services/tripVoiceService');
  const api = load('../groups/tripFeatureFunctions');
  const state = () => read('trip_feature_access/o/t');
  const reserve = uid => service.reserveSession('o', 't', uid !== 'participant', uid || 'host');
  const join = async (uid = 'host', timestamp = now) => {
    const session = state().session;
    rooms.set(session.roomName, { sid: `sid-${session.id}`, participants: [{ identity: uid, joinedAt: timestamp / 1000 }] });
    await service.handleRoomEvent({ event: 'participant_joined', createdAt: timestamp / 1000,
      room: { name: session.roomName, sid: `sid-${session.id}` }, participant: { identity: uid } });
  };
  const refresh = () => service.refreshFeatures('o', 't');
  const stop = () => service.stopSession('o', 't');
  return { service, api, state, reserve, join, refresh, stop, rooms, deleted, notifications, queued, read, write,
    listeners,
    setNow: value => now = value, advance: value => now += value,
    failDelete: value => failDelete = value, failList: value => failList = value,
    failWriteOnce: path => failedWritePath = path,
    retryWith: value => retryValue = value,
    task: () => api.checkTripVoiceAccess({ data: { orgId: 'o', tripId: 't', dueAt: state().nextCheckAt, sessionId: state().session?.id || null } }),
  };
}
test('participant joins the active admin room with an empty SDK cache', async () => {
  const f = fixture({ coldCache: true });
  await f.reserve('host'); await f.join('host');
  const roomName = f.state().session.roomName;
  f.advance(2000);
  const joined = await f.reserve('participant');
  assert.equal(joined.session.roomName, roomName);
  assert.equal(joined.session.status, 'active');
  assert.equal(joined.preTripVoiceUsedSeconds, 2);
  assert.equal(f.listeners.size, 0);
});
test('participant cannot start an absent or pending room with an empty SDK cache', async () => {
  const f = fixture({ coldCache: true });
  await assert.rejects(f.reserve('participant'), { code: 'failed-precondition', message: 'Channel not started.' });
  await f.reserve('host');
  const roomName = f.state().session.roomName;
  await assert.rejects(f.reserve('participant'), { code: 'failed-precondition', message: 'Channel not started.' });
  assert.equal(f.state().session.roomName, roomName);
  assert.equal(f.state().session.status, 'pending');
  assert.equal(f.listeners.size, 0);
});

test('viewing or reserving Voice consumes nothing before a real media connection', async () => {
  const f = fixture(); await f.refresh(); await f.reserve(); f.advance(45000); await f.refresh();
  assert.equal(f.state().preTripVoiceRemainingSeconds, 3600);
  assert.equal(f.state().session.status, 'pending');
  f.advance(15000); await f.task();
  assert.equal(f.state().session, null);
  assert.equal(f.state().preTripVoiceRemainingSeconds, 3600);
});
test('a fresh reservation needs no LiveKit administration request and preserves prior usage', async () => {
  const f = fixture(); await f.refresh();
  f.write('trip_feature_access/o/t/preTripVoiceUsedMs', 120000);
  f.failList(true); f.failDelete(true);
  await f.reserve();
  assert.equal(f.state().session.status, 'pending');
  assert.equal(f.state().preTripVoiceRemainingSeconds, 3480);
});
test('a session ending during an asynchronous transaction retry rejects without hanging', async () => {
  const f = fixture(); await f.refresh();
  const changed = structuredClone(f.state());
  changed.session = { id: 'concurrent', status: 'ending', endReason: 'host_stopped', requestedAt: MAY };
  f.retryWith(changed);
  await assert.rejects(f.reserve(), { code: 'failed-precondition', message: 'Voice Chat is ending. Please try again shortly.' });
  assert.equal(f.state().session.id, 'concurrent');
  assert.equal(f.read('voice_rooms'), null);
});
test('allowance exhausted by a concurrent transaction returns the correct error without resetting usage', async () => {
  const f = fixture(); await f.refresh();
  f.retryWith({ ...f.state(), preTripVoiceUsedMs: 3600000 });
  await assert.rejects(f.reserve(), { code: 'resource-exhausted' });
  assert.equal(f.state().preTripVoiceUsedMs, 3600000);
  assert.equal(f.read('voice_rooms'), null);
});
test('12 minutes plus 20 minutes weeks later leaves 28 minutes shared across all hosts', async () => {
  const f = fixture(); await f.reserve(); await f.join();
  f.advance(12 * 60000); await f.stop();
  assert.equal(f.state().preTripVoiceRemainingSeconds, 48 * 60);
  f.advance(21 * DAY_MS); await f.reserve('other'); await f.join('other');
  f.advance(20 * 60000); await f.stop();
  assert.equal(f.state().preTripVoiceRemainingSeconds, 28 * 60);
  assert.equal(f.state().preTripVoiceUsedSeconds, 32 * 60);
});
test('simultaneous hosts share one reservation and one wall-clock counter', async () => {
  const f = fixture(); const values = await Promise.all([f.reserve('host'), f.reserve('other'), f.reserve('manager')]);
  assert.equal(new Set(values.map(v => v.session.id)).size, 1);
  await f.join(); f.advance(90000);
  await Promise.all([f.reserve('other'), f.reserve('manager'), f.refresh()]);
  assert.equal(f.state().preTripVoiceUsedSeconds, 90);
});
test('allowance exhaustion deletes the room, closes channel, notifies hosts, rejects everyone', async () => {
  const f = fixture(); await f.reserve(); await f.join(); f.advance(3600000); await f.task();
  assert.equal(f.state().session, null);
  assert.equal(f.state().preTripVoiceRemainingSeconds, 0);
  assert.equal(f.read('trips_active/o/t/voice_channel/isChannelStarted'), false);
  assert.equal(f.rooms.size, 0);
  assert.deepEqual(f.notifications.map(args => args[0]).sort(), ['host', 'manager', 'other']);
  for (const uid of ['host', 'other', 'manager', 'participant']) await assert.rejects(f.reserve(uid), { code: 'resource-exhausted' });
});
test('full access unlocks without deleting history; an active session crosses boundary uninterrupted', async () => {
  const f = fixture(); f.setNow(START - DAY_MS - 30000); await f.reserve(); await f.join();
  f.advance(30000); await f.task();
  assert.equal(f.state().voiceAccess, 'FULL');
  assert.equal(f.state().preTripVoiceUsedSeconds, 30);
  assert.equal(f.state().session.status, 'active');
  f.advance(2 * 3600000); await f.refresh(); assert.equal(f.state().preTripVoiceUsedSeconds, 30);
  assert.equal(f.deleted.length, 0);
});
test('previously exhausted trips unlock 24h before departure without resetting usage', async () => {
  const f = fixture(); await f.reserve(); await f.join(); f.advance(3600000); await f.refresh();
  f.setNow(START - DAY_MS); await f.refresh(); await f.reserve(); await f.join();
  assert.equal(f.state().voiceAccess, 'FULL'); assert.equal(f.state().preTripVoiceUsedSeconds, 3600);
});
test('trip end closes active full Voice and prohibits further sessions', async () => {
  const f = fixture(); f.setNow(END - 60000); await f.reserve(); await f.join();
  f.setNow(END); await f.task();
  assert.equal(f.state().voiceAccess, 'EXPIRED'); assert.equal(f.rooms.size, 0);
  await assert.rejects(f.reserve(), /ended/);
});
test('stale tasks and replayed webhooks cannot close the next session or reset balance', async () => {
  const f = fixture(); await f.reserve(); await f.join(); const old = structuredClone(f.state());
  f.advance(10000); await f.stop(); await f.reserve('other'); await f.join('other');
  const id = f.state().session.id;
  await f.api.checkTripVoiceAccess({ data: { orgId: 'o', tripId: 't', dueAt: old.nextCheckAt, sessionId: old.session.id } });
  await f.service.handleRoomEvent({ event: 'room_finished', room: { name: old.session.roomName, sid: old.session.roomSid } });
  await f.service.handleRoomEvent({ event: 'participant_joined', room: { name: old.session.roomName }, participant: { identity: 'host' } });
  assert.equal(f.state().session.id, id); assert.equal(f.state().preTripVoiceUsedSeconds, 10);
  assert.equal(f.read('trips_active/o/t/voice_channel/isChannelStarted'), true);
});
test('room deletion failure retains ending lock and retries without losing usage', async () => {
  const f = fixture(); await f.reserve(); await f.join(); f.advance(3600000); f.failDelete(true);
  await assert.rejects(f.refresh(), /unavailable/); assert.equal(f.state().session.status, 'ending');
  await assert.rejects(f.reserve('other'), /unavailable/);
  f.failDelete(false); await f.refresh(); assert.equal(f.state().session, null);
  assert.equal(f.state().preTripVoiceUsedSeconds, 3600);
});
test('reconciliation accounts for a lost join webhook using LiveKit media timestamps', async () => {
  const f = fixture(); await f.reserve(); const session = f.state().session;
  f.rooms.set(session.roomName, { sid: 'recovered', participants: [{ identity: 'host', joinedAt: MAY / 1000 }] });
  f.advance(60000); await f.task();
  assert.equal(f.state().preTripVoiceUsedSeconds, 60); assert.equal(f.state().session.status, 'active');
});
test('a missing host ends Voice; LiveKit outages never pretend the room was empty', async () => {
  const f = fixture(); await f.reserve(); await f.join(); f.advance(10000); f.failList(true);
  await assert.rejects(f.service.stopIfNoHosts('o', 't'), /unavailable/);
  assert.equal(f.state().session.status, 'active');
  f.failList(false); f.rooms.get(f.state().session.roomName).participants = [];
  await f.service.stopIfNoHosts('o', 't'); assert.equal(f.state().session.status, 'active');
  f.advance(15000); await f.task(); assert.equal(f.state().session, null);
  assert.equal(f.state().preTripVoiceUsedSeconds, 25);
});
test('a transient empty host list two seconds after joining does not end Voice', async () => {
  const f = fixture(); await f.reserve(); await f.join(); f.advance(2000);
  const room = f.rooms.get(f.state().session.roomName);
  const participants = room.participants; room.participants = [];
  await f.service.stopIfNoHosts('o', 't');
  assert.equal(f.state().session.status, 'active');
  assert.equal(f.state().nextCheckAt, MAY + 17000);
  f.advance(15000); room.participants = participants; await f.task();
  assert.equal(f.state().session.status, 'active');
  assert.equal(f.state().session.noHostsSince, undefined);
  assert.equal(f.state().preTripVoiceUsedSeconds, 17);
  assert.equal(f.deleted.length, 0);
});
test('LiveKit failure at the reconnect deadline cannot close the room', async () => {
  const f = fixture(); await f.reserve(); await f.join();
  f.rooms.get(f.state().session.roomName).participants = [];
  await f.service.stopIfNoHosts('o', 't');
  f.advance(15000); f.failList(true);
  await assert.rejects(f.task(), /unavailable/);
  assert.equal(f.state().session.status, 'active');
  assert.equal(f.deleted.length, 0);
});
test('host reconnect grace cannot extend the pre-trip allowance', async () => {
  const f = fixture(); await f.reserve(); await f.join(); f.advance(3598000);
  f.rooms.get(f.state().session.roomName).participants = [];
  await f.service.stopIfNoHosts('o', 't');
  assert.equal(f.state().nextCheckAt, MAY + 3600000);
  f.advance(2000); await f.task();
  assert.equal(f.state().session, null);
  assert.equal(f.state().lastEndedSession.endReason, 'pre_trip_exhausted');
  assert.equal(f.state().preTripVoiceUsedSeconds, 3600);
});
test('an old inactivity ending record cannot block a new session', async () => {
  const f = fixture();
  f.write('voice_inactivity/o/t', { id: 'old', roomSid: 'old-room', status: 'ending' });
  await f.reserve();
  assert.equal(f.state().session.status, 'pending');
  assert.equal(f.read('voice_inactivity/o/t/status'), 'ended');
  assert.equal(f.state().preTripVoiceRemainingSeconds, 3600);
});
test('retry completes interrupted inactivity cleanup before starting the next session', async () => {
  const f = fixture(); await f.reserve(); await f.join(); f.advance(2000);
  const old = structuredClone(f.state().session);
  f.write('voice_inactivity/o/t', { id: 'old', roomSid: old.roomSid, status: 'ending' });
  f.failDelete(true); await assert.rejects(f.reserve(), /unavailable/);
  assert.equal(f.state().session.status, 'ending');
  f.failDelete(false); await f.reserve();
  assert.notEqual(f.state().session.id, old.id);
  assert.equal(f.state().session.status, 'pending');
  assert.equal(f.state().preTripVoiceUsedSeconds, 2);
  assert.equal(f.read('voice_inactivity/o/t/status'), 'ended');
});
test('durable tasks carry the exact deadline and distant trips are scheduled within 28 days', async () => {
  const f = fixture(); await f.refresh();
  await f.api.onTripFeatureAccessChanged({ params: { orgId: 'o', tripId: 't' }, data: {
    before: { val: () => null }, after: { val: () => f.state() },
  } });
  assert.equal(f.queued[0][1].scheduleDelaySeconds, 28 * 86400);
  await f.reserve(); await f.join(); const dueAt = f.state().nextCheckAt;
  assert.equal(dueAt, MAY + 300000);
});


test('late room-finished delivery only charges actual channel uptime', async () => {
  const f = fixture(); await f.reserve(); await f.join(); const session = structuredClone(f.state().session);
  f.advance(120000); await f.refresh(); // A profile poll arrives before the delayed webhook.
  await f.service.handleRoomEvent({ event: 'room_finished', createdAt: (MAY + 60000) / 1000,
    room: { name: session.roomName, sid: session.roomSid } });
  assert.equal(f.state().preTripVoiceUsedSeconds, 60);
  assert.equal(f.state().session, null);
});


for (const brokenPath of ['trips_active/o/t/voice_channel', 'orgs/o/trips/t/voice_state']) {
  test(`webhook retry repairs ${brokenPath} after session activation was already committed`, async () => {
    const f = fixture(); await f.reserve(); f.failWriteOnce(brokenPath);
    await assert.rejects(f.join(), /Interrupted status write/);
    assert.equal(f.state().session.status, 'active');
    const original = f.state().session;
    await f.join(); // Redelivery must finish publishing even though no longer pending.
    assert.equal(f.read('trips_active/o/t/voice_channel/isChannelStarted'), true);
    assert.equal(f.read('orgs/o/trips/t/voice_state/is_active'), true);
    assert.equal(f.state().session.id, original.id);
    assert.equal(f.state().session.startedAt, original.startedAt);
    assert.equal(f.state().preTripVoiceUsedSeconds, 0);
  });
}
test('reconciliation repairs stale display flags without resetting mute or usage', async () => {
  const f = fixture(); await f.reserve(); await f.join();
  f.write('trips_active/o/t/voice_channel/isAllMuted', true);
  f.write('trips_active/o/t/voice_channel/adminMuted', true);
  f.write('trips_active/o/t/voice_channel/isChannelStarted', false);
  f.advance(12000); await f.service.reconcileSession('o', 't');
  assert.equal(f.read('trips_active/o/t/voice_channel/isChannelStarted'), true);
  assert.equal(f.read('trips_active/o/t/voice_channel/isAllMuted'), true);
  assert.equal(f.read('trips_active/o/t/voice_channel/adminMuted'), true);
  assert.equal(f.state().preTripVoiceUsedSeconds, 12);
});


test('one connected host gets a full five minutes, then room deletion and a targeted reason', async () => {
  const f = fixture(); f.setNow(START); await f.reserve(); await f.join();
  assert.equal(f.state().nextCheckAt, START + 300000);
  f.advance(299999); await assert.rejects(f.task(), /early/);
  assert.equal(f.state().session.status, 'active');
  f.advance(1); await f.task();
  assert.equal(f.state().session, null);
  assert.equal(f.read('trips_active/o/t/voice_channel/endReason'), 'alone_timeout');
  assert.equal(f.read('trips_active/o/t/voice_channel/endRecipientUid'), 'host');
  assert.equal(f.rooms.size, 0);
});

for (const uid of ['participant', 'other', 'manager']) {
  test(`a second ${uid} cancels the solo deadline regardless of role`, async () => {
    const f = fixture(); f.setNow(START); await f.reserve(); await f.join();
    const session = f.state().session, dueAt = f.state().nextCheckAt;
    f.advance(299000);
    f.rooms.get(session.roomName).participants.push({ identity: uid, joinedAt: (START + 299000) / 1000 });
    await f.service.handleRoomEvent({ event: 'participant_joined', createdAt: (START + 299000) / 1000,
      room: { name: session.roomName, sid: session.roomSid }, participant: { identity: uid } });
    assert.equal(f.state().session.soloSince, undefined);
    f.advance(1000);
    await f.api.checkTripVoiceAccess({ data: { orgId: 'o', tripId: 't', dueAt, sessionId: session.id } });
    assert.equal(f.state().session.status, 'active');
    assert.equal(f.deleted.length, 0);
  });
}
test('multiple users dropping to one participant starts a fresh timer; no host is required', async () => {
  const f = fixture(); f.setNow(START); await f.reserve(); await f.join();
  const session = f.state().session;
  const room = f.rooms.get(session.roomName);
  room.participants.push({ identity: 'participant', joinedAt: START / 1000 });
  await f.service.reconcileSession('o', 't');
  assert.equal(f.state().session.soloSince, undefined);
  f.advance(600000); room.participants = room.participants.filter(p => p.identity === 'participant');
  await f.service.handleRoomEvent({ event: 'participant_left', createdAt: (START + 600000) / 1000,
    room: { name: session.roomName, sid: session.roomSid }, participant: { identity: 'host' } });
  assert.equal(f.state().session.soloSince, START + 600000);
  f.advance(15000); await f.service.reconcileSession('o', 't');
  assert.equal(f.state().session.status, 'active');
  f.advance(285000); await f.task();
  assert.equal(f.state().session, null);
  assert.equal(f.read('trips_active/o/t/voice_channel/endRecipientUid'), 'participant');
});
test('a brief second-user join resets continuity even if that user already left before webhook processing', async () => {
  const f = fixture(); f.setNow(START); await f.reserve(); await f.join();
  const session = f.state().session;
  f.advance(290000);
  const event = { event: 'participant_joined', createdAt: (START + 289000) / 1000,
    room: { name: session.roomName, sid: session.roomSid }, participant: { identity: 'participant' } };
  await f.service.handleRoomEvent(event);
  assert.equal(f.state().session.soloSince, START + 290000);
  f.advance(10000); await f.service.handleRoomEvent(event);
  assert.equal(f.state().session.soloSince, START + 290000);
  assert.equal(f.state().session.status, 'active');
});
test('restart after solo termination uses a fresh session and timer, immune to old tasks', async () => {
  const f = fixture(); f.setNow(START); await f.reserve(); await f.join();
  const sessionId = f.state().session.id, dueAt = f.state().nextCheckAt;
  f.advance(300000); await f.task();
  f.advance(1000); await f.reserve(); await f.join();
  assert.notEqual(f.state().session.id, sessionId);
  assert.equal(f.state().nextCheckAt, START + 601000);
  await f.api.checkTripVoiceAccess({ data: { orgId: 'o', tripId: 't', dueAt, sessionId } });
  assert.equal(f.state().session.status, 'active');
});
test('LiveKit errors at solo expiry never terminate an unverified room; recovery cancels if someone joined', async () => {
  const f = fixture(); f.setNow(START); await f.reserve(); await f.join();
  f.advance(300000); f.failList(true);
  await assert.rejects(f.task(), /unavailable/);
  assert.equal(f.state().session.status, 'active');
  f.failList(false); f.rooms.get(f.state().session.roomName).participants.push({ identity: 'other' });
  await f.task();
  assert.equal(f.state().session.soloSince, undefined);
  assert.equal(f.deleted.length, 0);
});
test('all-muted confirmation waiting for Yes/No cannot extend the solo limit', async () => {
  const f = fixture(); f.setNow(START); await f.reserve(); await f.join();
  f.write('voice_inactivity/o/t', { status: 'pending', id: 'muted-question', roomSid: f.state().session.roomSid });
  f.advance(300000); await f.task();
  assert.equal(f.state().session, null);
  assert.equal(f.read('trips_active/o/t/voice_channel/endReason'), 'alone_timeout');
});
