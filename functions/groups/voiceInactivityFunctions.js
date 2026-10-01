const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { onValueWritten } = require('firebase-functions/v2/database');
const { onTaskDispatched } = require('firebase-functions/v2/tasks');
const { getFunctions } = require('firebase-admin/functions');
const { RoomServiceClient } = require('livekit-server-sdk');
const { onCall } = require('../middleware/participantAccessMiddleware');
const { requireTripAccess } = require('../services/participantAccessService');
const { db } = require('../admin');
const { sendPushNotification } = require('../services/notificationService');
const { INACTIVITY_MS, STAFF_ROLES, everyoneMuted, observe, answer } = require('../services/voiceInactivityState');
const { accessRef, stopSession } = require('../services/tripVoiceService');
const { guardedTransaction } = require('../services/guardedTransaction');
const region = 'europe-west1';
const stateRef = (orgId, tripId) => db.ref(`voice_inactivity/${orgId}/${tripId}`);
function roomService() {
  return new RoomServiceClient((process.env.LIVEKIT_URL || '').replace(/^ws/, 'http'),
    process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
}
async function liveState(orgId, tripId) {
  const service = roomService();
  const features = (await accessRef(orgId, tripId).get()).val();
  const roomName = features?.session?.roomName;
  if (!roomName || features.session.status !== 'active') return null;
  const [active, rooms] = await Promise.all([
    db.ref(`trips_active/${orgId}/${tripId}/voice_channel/isChannelStarted`).get(),
    service.listRooms([roomName]),
  ]);
  if (active.val() !== true || !rooms.length) return null;
  // Never interpret a LiveKit error as an empty/muted room.
  return { roomSid: rooms[0].sid, sessionId: features.session.id, roomName, participants: await service.listParticipants(roomName) };
}
async function caller(request) {
  const { tripId } = request.data || {};
  if (typeof tripId !== 'string' || !tripId || /[.#$\[\]/]/.test(tripId)) {
    throw new HttpsError('invalid-argument', 'Invalid tripId.');
  }
  const { orgId } = await requireTripAccess(request, tripId);
  const live = await liveState(orgId, tripId);
  if (!live?.participants.some(p => p.identity === request.auth.uid)) {
    throw new HttpsError('failed-precondition', 'You must be connected to this Voice Chat.');
  }
  return { orgId, tripId, live };
}

exports.reportVoiceActivity = onCall({ region }, async request => {
  const now = Date.now();
  const { orgId, tripId, live } = await caller(request);
  await guardedTransaction(stateRef(orgId, tripId), state => observe(state, {
    roomSid: live.roomSid, muted: everyoneMuted(live.participants),
    // Preserve short unmute/speech events even if muted again before the RPC arrives.
    activity: request.data.activity === true, now, startedAt: Date.now(), id: randomUUID(),
  }));
  return { success: true };
});

exports.respondToVoiceInactivity = onCall({ region }, async request => {
  const { promptId, keepActive } = request.data || {};
  if (typeof promptId !== 'string' || typeof keepActive !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Invalid response.');
  }
  const { orgId, tripId, live } = await caller(request);
  const role = (await db.ref(`orgs/${orgId}/staff/${request.auth.uid}`).get()).val();
  if (!STAFF_ROLES.includes(role)) throw new HttpsError('permission-denied', 'Host response required.');
  const result = await guardedTransaction(stateRef(orgId, tripId), state => {
    if (state?.roomSid !== live.roomSid) return;
    return answer(state, promptId, keepActive, Date.now(), everyoneMuted(live.participants), request.auth.uid);
  });
  if (!result.committed) return { accepted: false };
  if (!keepActive) await finishEnding(orgId, tripId, result.snapshot.val());
  return { accepted: true };
});

async function finishEnding(orgId, tripId, state) {
  const current = (await stateRef(orgId, tripId).get()).val();
  if (current?.id !== state.id || current.status !== 'ending') return;
  const features = (await accessRef(orgId, tripId).get()).val();
  if (features?.session?.roomSid === state.roomSid) {
    await stopSession(orgId, tripId, 'inactivity', features.session.id);
  }
  // Another server mechanism may already have ended this room. Release the
  // inactivity lock without ever touching a newer Voice session.
  await guardedTransaction(stateRef(orgId, tripId), current => current?.id === state.id && current.status === 'ending'
    ? { ...current, status: 'ended' } : undefined);
}

// A durable timer continues while iOS/Android is backgrounded. Each generation
// gets its own task; obsolete tasks cannot prompt a newer session or timer.
exports.onVoiceInactivityChanged = onValueWritten({
  ref: 'voice_inactivity/{orgId}/{tripId}', region, retry: true,
}, async event => {
  const state = event.data.after.val();
  const before = event.data.before.val();
  const { orgId, tripId } = event.params;
  if (state?.status === 'pending' && before?.status !== 'pending') {
    const live = await liveState(orgId, tripId);
    if (!live || live.roomSid !== state.roomSid) return;
    const staff = (await db.ref(`orgs/${orgId}/staff`).get()).val() || {};
    const current = (await stateRef(orgId, tripId).get()).val();
    if (current?.status !== 'pending' || current.id !== state.id) return;
    await Promise.all(live.participants.filter(p => STAFF_ROLES.includes(staff[p.identity])).map(p =>
      sendPushNotification(p.identity, 'Are you still using the Voice Chat?',
        'Open GoMusāfir to choose Yes or No.',
        { type: 'voice_inactivity', tripId, orgId, promptId: state.id },
        { tripId, skipDbSave: true, androidChannelId: 'Trip Audio', interruptionLevel: 'time-sensitive',
          eventId: `voice_inactivity_${tripId}_${state.id}` })));
  } else if (state?.status === 'ending') {
    // Also retries closure if the responding device/RPC disappears after committing No.
    await finishEnding(orgId, tripId, state);
  } else if (state?.status === 'timing' && state.id !== before?.id) {
    await getFunctions().taskQueue(`locations/${region}/functions/checkVoiceInactivity`).enqueue(
      { orgId, tripId, id: state.id },
      { scheduleDelaySeconds: Math.max(0, Math.ceil((state.startedAt + INACTIVITY_MS - Date.now()) / 1000)) });
  }
});

exports.checkVoiceInactivity = onTaskDispatched({ region,
  retryConfig: { maxAttempts: 5, minBackoffSeconds: 5 },
}, async request => {
  const { orgId, tripId, id } = request.data;
  const ref = stateRef(orgId, tripId);
  const state = (await ref.get()).val();
  if (state?.status !== 'timing' || state.id !== id) return;
  const live = await liveState(orgId, tripId);
  await guardedTransaction(ref, current => {
    if (current?.status !== 'timing' || current.id !== id) return;
    if (!live || live.roomSid !== current.roomSid || !everyoneMuted(live.participants)) {
      return { roomSid: current.roomSid, status: 'active', observedAt: Date.now() };
    }
    if (Date.now() - current.startedAt < INACTIVITY_MS) throw new Error('Timer not due yet');
    return { ...current, status: 'pending' };
  });
});

// Invalidate any old question when another mechanism ends the channel.
exports.resetVoiceInactivity = onValueWritten({
  ref: 'trips_active/{orgId}/{tripId}/voice_channel/isChannelStarted', region, retry: true,
}, async event => {
  if (event.data.after.val() === true) return;
  // Database events can arrive out of order after a channel has restarted.
  if ((await db.ref(`trips_active/${event.params.orgId}/${event.params.tripId}/voice_channel/isChannelStarted`).get()).val() === true) return;
  await guardedTransaction(stateRef(event.params.orgId, event.params.tripId), state =>
    state?.status === 'ending' ? undefined : null);
});
