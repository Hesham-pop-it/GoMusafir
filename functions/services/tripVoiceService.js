const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { RoomServiceClient } = require('livekit-server-sdk');
const { db } = require('../admin');
const { settle, endAt, EXHAUSTED_MESSAGE, HOST_RECONNECT_GRACE_MS, SOLO_TIMEOUT_MS } = require('./tripFeatureState');
const STAFF_ROLES = ['admin', 'co-host', 'manager'];
const accessRef = (orgId, tripId) => db.ref(`trip_feature_access/${orgId}/${tripId}`);
const roomService = () => new RoomServiceClient((process.env.LIVEKIT_URL || '').replace(/^ws/, 'http'),
  process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { requestTimeout: 8 });

const { guardedTransaction } = require('./guardedTransaction');

async function updateState(orgId, tripId, change = state => state) {
  const trip = (await db.ref(`orgs/${orgId}/trips/${tripId}`).get()).val();
  // Keep the server state cached while validating the transaction. A one-off
  // get() does not prevent a synthetic null here, which makes participant
  // joins reject an active room as "Channel not started" before any retry.
  // The guard also safely propagates errors from asynchronous SDK retries.
  const result = await guardedTransaction(accessRef(orgId, tripId), previous => {
    const now = Date.now();
    return change(settle(previous, trip, now), now);
  });
  return result.snapshot.val();
}

async function refreshFeatures(orgId, tripId) {
  const state = await updateState(orgId, tripId);
  if (state?.session?.status === 'ending') await finishSession(orgId, tripId, state.session);
  else if (state?.session?.status === 'active') await publishActiveSession(orgId, tripId, state.session);
  return (await accessRef(orgId, tripId).get()).val();
}

// Repair both display mirrors on every reconciliation, including webhook retries
// after the ledger committed but a later database write failed.
async function publishActiveSession(orgId, tripId, session) {
  await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).transaction(channel => {
    if (channel?.endedSessionId === session.id || (channel?.sessionRequestedAt || 0) > session.requestedAt) return;
    if (channel?.sessionId === session.id && channel.isChannelStarted === true) return;
    const newSession = channel?.sessionId !== session.id;
    return { ...channel, isChannelStarted: true,
      ...(newSession ? { isAllMuted: false, adminMuted: false } : {}),
      endReason: null, endRecipientUid: null, lastUpdatedBy: session.requestedBy, sessionId: session.id,
      sessionRequestedAt: session.requestedAt };
  });
  await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state`).transaction(voice => {
    if (voice?.endedSessionId === session.id || (voice?.sessionRequestedAt || 0) > session.requestedAt) return;
    if (voice?.sessionId === session.id && voice.is_active === true) return;
    return { ...voice, is_active: true, sessionId: session.id, sessionRequestedAt: session.requestedAt };
  });
}

function assertVoiceAvailable(state) {
  if (state.voiceAccess === 'EXPIRED') throw new HttpsError('failed-precondition', 'This trip has ended.');
  if (state.voiceAccess === 'PRE_TRIP_LIMITED' && state.preTripVoiceRemainingSeconds <= 0) {
    throw new HttpsError('resource-exhausted', EXHAUSTED_MESSAGE, { reason: 'pre_trip_exhausted' });
  }
  if (state.session?.status === 'ending') throw new HttpsError('failed-precondition', 'Voice Chat is ending. Please try again shortly.');
}

async function reserveSession(orgId, tripId, staff, uid) {
  const existing = (await accessRef(orgId, tripId).get()).val();
  if (existing?.session?.status === 'pending' && existing.session.pendingUntil <= Date.now()) {
    await reconcileSession(orgId, tripId);
  } else if (existing?.session) await refreshFeatures(orgId, tripId);
  // A failed inactivity cleanup must not lock a later session. Only an ending
  // record for the current room is allowed to block a new token.
  const inactivityRef = db.ref(`voice_inactivity/${orgId}/${tripId}`);
  const inactivity = (await inactivityRef.get()).val();
  if (inactivity?.status === 'ending') {
    const current = (await accessRef(orgId, tripId).get()).val();
    if (inactivity.roomSid && current?.session?.roomSid === inactivity.roomSid) {
      await stopSession(orgId, tripId, 'inactivity', current.session.id);
    }
    await guardedTransaction(inactivityRef, value => value?.status === 'ending' &&
      value.id === inactivity.id && value.roomSid === inactivity.roomSid
      ? { ...value, status: 'ended' } : undefined);
  }
  const id = randomUUID();
  const roomName = `gm_${tripId}_${id}`;
  const state = await updateState(orgId, tripId, (current, now) => {
    assertVoiceAvailable(current);
    if (!current.session) {
      if (!staff) throw new HttpsError('failed-precondition', 'Channel not started.');
      current.session = { id, roomName, status: 'pending', pendingUntil: now + 60000, requestedAt: Math.max(now, (current.lastEndedSession?.requestedAt || 0) + 1), requestedBy: uid };
      current.nextCheckAt = Math.min(current.nextCheckAt || Infinity, now + 60000);
    } else if (!staff && current.session.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Channel not started.');
    }
    return current;
  });
  await db.ref(`voice_rooms/${state.session.roomName}`).set({ orgId, tripId, sessionId: state.session.id });
  return state;
}

async function stopSession(orgId, tripId, reason = 'host_stopped', expectedId, stoppedAt) {
  const state = await updateState(orgId, tripId, current => {
    if (!current.session || (expectedId && current.session.id !== expectedId)) return current;
    if (Number.isFinite(stoppedAt) && current.session.status === 'active') endAt(current, stoppedAt);
    current.session.status = 'ending';
    current.session.endReason = current.session.endReason || reason;
    current.nextCheckAt = Date.now();
    return current;
  });
  if (state?.session?.status === 'ending') await finishSession(orgId, tripId, state.session);
  else if (state?.session?.status === 'active') await publishActiveSession(orgId, tripId, state.session);
}

async function finishSession(orgId, tripId, session) {
  const current = (await accessRef(orgId, tripId).get()).val();
  if (current?.session?.id !== session.id || current.session.status !== 'ending') return;
  // A session-specific room prevents old tokens and delayed webhooks/tasks from
  // reconnecting to or terminating the next host's channel.
  try { await roomService().deleteRoom(session.roomName); }
  catch (error) { if (error.status !== 404 && error.code !== 'not_found') throw error; }
  await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).transaction(channel => {
    if ((channel?.sessionRequestedAt || 0) > session.requestedAt) return;
    return { ...channel, isChannelStarted: false, activeSpeaker: null, active_hosts: null, presence: null,
      endReason: session.endReason, endRecipientUid: session.endReason === 'alone_timeout' ? session.soloUid : null, endedSessionId: session.id, sessionRequestedAt: session.requestedAt,
      lastUpdatedBy: 'system' };
  });
  await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state`).transaction(voice => {
    if ((voice?.sessionRequestedAt || 0) > session.requestedAt) return;
    return { ...voice, is_active: false, endedSessionId: session.id, sessionRequestedAt: session.requestedAt };
  });
  const closed = await guardedTransaction(accessRef(orgId, tripId), value => {
    if (value?.session?.id !== session.id || value.session.status !== 'ending') return;
    return { ...value, session: null, lastEndedSession: { ...session, endedAt: Date.now() },
      nextCheckAt: Date.now() + 1 };
  });
  if (closed.committed) console.info('Voice session ended', {
    orgId, tripId, sessionId: session.id, reason: session.endReason,
  });
  if (closed.committed && session.endReason === 'pre_trip_exhausted') {
    const staff = (await db.ref(`orgs/${orgId}/staff`).get()).val() || {};
    const { sendPushNotification } = require('./notificationService');
    await Promise.all(Object.keys(staff).filter(uid => STAFF_ROLES.includes(staff[uid])).map(uid =>
      sendPushNotification(uid, 'Pre-trip Voice allowance used', EXHAUSTED_MESSAGE,
        { type: 'voice_allowance_exhausted', tripId, orgId },
        { tripId, eventId: `voice_allowance_${session.id}` })));
  }
}

async function handleRoomEvent(event) {
  const roomName = event.room?.name;
  if (!roomName) return;
  const mapping = (await db.ref(`voice_rooms/${roomName}`).get()).val();
  if (!mapping) {
    // Retired pre-rollout rooms are never entitled to bypass the new ledger.
    if (['room_started', 'participant_joined'].includes(event.event)) await roomService().deleteRoom(roomName);
    return;
  }
  const { orgId, tripId, sessionId } = mapping;
  const state = (await accessRef(orgId, tripId).get()).val();
  if (state?.session?.id !== sessionId || state.session.status === 'ending') {
    if (['room_started', 'participant_joined'].includes(event.event)) await roomService().deleteRoom(roomName);
    return;
  }
  if (event.event === 'participant_joined') {
    const role = (await db.ref(`orgs/${orgId}/staff/${event.participant.identity}`).get()).val();
    if (state.session.status === 'pending' && STAFF_ROLES.includes(role)) {
      const trip = (await db.ref(`orgs/${orgId}/trips/${tripId}`).get()).val();
      await guardedTransaction(accessRef(orgId, tripId), value => {
        if (value?.session?.id !== sessionId || value.session.status !== 'pending') return;
        const now = Date.now();
        // Accept the trusted media timestamp even when webhook delivery was late.
        const joinedAt = Math.min(now, Math.max(value.session.pendingUntil - 60000, Number(event.createdAt) * 1000 || now));
        return settle({ ...value, session: { ...value.session, status: 'active', roomSid: event.room.sid,
          startedAt: joinedAt, accountedAt: joinedAt } }, trip, now);
      });
    }
    await refreshFeatures(orgId, tripId);
    await stopIfNoHosts(orgId, tripId, { sessionId, joinedUid: event.participant.identity, eventAt: Number(event.createdAt) * 1000 });
  } else if (event.event === 'room_finished') {
    // Ignore a delayed event for a different incarnation of this room.
    if (!state.session.roomSid || state.session.roomSid === event.room.sid) await stopSession(orgId, tripId, 'room_finished', sessionId, Number(event.createdAt) * 1000);
  } else if (event.event === 'participant_left') {
    if (state.session.roomSid && event.room.sid !== state.session.roomSid) return;
    await stopIfNoHosts(orgId, tripId, { sessionId, participantLeft: true,
      leftUid: event.participant?.identity, eventAt: Number(event.createdAt) * 1000 });
  }
}

async function stopIfNoHosts(orgId, tripId, event = {}) {
  const state = (await accessRef(orgId, tripId).get()).val();
  if (state?.session?.status !== 'active' || (event.sessionId && event.sessionId !== state.session.id)) return;
  const service = roomService();
  const observedAt = Date.now();
  const rooms = await service.listRooms([state.session.roomName]);
  const listed = rooms.length ? await service.listParticipants(state.session.roomName) : [];
  // Admin departure ends this room even if other members remain. Check the
  // live roster so a delayed leave event cannot end an admin's new connection.
  if (event.participantLeft && event.leftUid && !listed.some(p => p.identity === event.leftUid)) {
    const role = (await db.ref(`orgs/${orgId}/staff/${event.leftUid}`).get()).val();
    if (role === 'admin') {
      await stopSession(orgId, tripId, 'admin_left', state.session.id);
      return;
    }
  }
  // ACTIVE means ICE connectivity is established. Ignore tokens, app presence,
  // and participants whose media connection is still being negotiated.
  const participants = listed.filter(p => p.state === undefined || p.state === 2);
  const hasMembers = participants.length > 0;
  const trip = (await db.ref(`orgs/${orgId}/trips/${tripId}`).get()).val();
  const result = await guardedTransaction(accessRef(orgId, tripId), current => {
    if (current?.session?.id !== state.session.id || current.session.status !== 'active' ||
      (current.session.hostCheckAt || 0) > observedAt) return;
    const now = Date.now();
    const session = { ...current.session, hostCheckAt: observedAt };
    if (hasMembers) delete session.noHostsSince;
    else {
      session.noHostsSince = session.noHostsSince ?? now;
      // A signed leave event plus an empty current media roster confirms the
      // last user left. Do not add another reconnect grace period after that.
      // Unconfirmed empty polls retain grace; pending connections are protected.
      if ((event.participantLeft && listed.length === 0) ||
          now >= session.noHostsSince + HOST_RECONNECT_GRACE_MS) {
        session.status = 'ending';
        session.endReason = 'no_hosts';
      }
    }
    if (participants.length === 1) {
      const solo = participants[0];
      const connection = solo.sid || `${solo.identity}:${solo.joinedAt || ''}`;
      // A signed join from somebody else breaks continuity even when they leave
      // again before this server query. Delayed old events cannot extend a timer.
      const interrupted = event.joinedUid && event.joinedUid !== solo.identity &&
        event.eventAt > (session.soloSince || 0) && event.eventAt > (session.lastSoloJoinEventAt || 0);
      if (!Number.isFinite(session.soloSince) || session.soloConnection !== connection || interrupted) {
        session.soloSince = now;
        session.soloUid = solo.identity;
        session.soloConnection = connection;
      }
      if (interrupted) session.lastSoloJoinEventAt = event.eventAt;
      if (now >= session.soloSince + SOLO_TIMEOUT_MS) {
        session.status = 'ending';
        session.endReason = 'alone_timeout';
      }
    } else {
      delete session.soloSince;
      delete session.soloUid;
      delete session.soloConnection;
    }
    // Account active uptime before marking the session as ending.
    const next = settle(current, trip, now);
    if (next.session.status === 'active') {
      for (const key of ['hostCheckAt', 'status', 'endReason', 'noHostsSince', 'soloSince', 'soloUid', 'soloConnection', 'lastSoloJoinEventAt']) {
        if (session[key] !== undefined) next.session[key] = session[key];
      }
      // Missing keys must also clear prior timers when membership recovers.
      for (const key of ['noHostsSince', 'soloSince', 'soloUid', 'soloConnection']) {
        if (session[key] === undefined) delete next.session[key];
      }
    }
    return settle(next, trip, now);
  });
  const next = result.snapshot.val();
  if (result.committed) {
    const staff = (await db.ref(`orgs/${orgId}/staff`).get()).val() || {};
    // Media membership is authoritative after a crash/force-quit. Never let
    // a delayed webhook clear a newer session or a newer roster snapshot.
    await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).transaction(channel => {
      if (!channel || channel.sessionId !== state.session.id ||
          (channel.presenceCheckedAt || 0) > observedAt) return;
      const presence = Object.fromEntries(listed.map(p => [p.identity, true]));
      const activeHosts = Object.fromEntries(listed.filter(p => STAFF_ROLES.includes(staff[p.identity])).map(p => [p.identity, true]));
      const appPresence = { ...channel.app_presence };
      for (const uid of Object.keys(channel.presence || {})) {
        if (!presence[uid]) delete appPresence[uid];
      }
      return { ...channel, presence, active_hosts: activeHosts, app_presence: appPresence,
        presenceCheckedAt: observedAt,
        activeSpeaker: presence[channel.activeSpeaker?.uid] ? channel.activeSpeaker : null };
    });
  }
  if (result.committed && next?.session?.status === 'ending') {
    await finishSession(orgId, tripId, next.session);
  }
}


async function reconcileSession(orgId, tripId) {
  const state = (await accessRef(orgId, tripId).get()).val();
  // Retire pre-rollout rooms which used tripId and had no metering ledger.
  // This is also safe when a new session-specific room is already running.
  const legacy = await roomService().listRooms([tripId]);
  if (legacy.length) await roomService().deleteRoom(tripId);
  if (state?.session?.status === 'pending') {
    const service = roomService();
    const rooms = await service.listRooms([state.session.roomName]);
    if (rooms.length) {
      const participants = await service.listParticipants(state.session.roomName);
      const staff = (await db.ref(`orgs/${orgId}/staff`).get()).val() || {};
      const host = participants.filter(p => STAFF_ROLES.includes(staff[p.identity]))
        .sort((a, b) => Number(a.joinedAt) - Number(b.joinedAt))[0];
      if (host) await handleRoomEvent({ event: 'participant_joined', room: rooms[0], participant: host,
        createdAt: Number(host.joinedAt) || Date.now() / 1000 });
    }
  }
  await refreshFeatures(orgId, tripId);
  await stopIfNoHosts(orgId, tripId);
}

module.exports = { accessRef, roomService, updateState, refreshFeatures, reserveSession, stopSession,
  finishSession, handleRoomEvent, stopIfNoHosts, reconcileSession, STAFF_ROLES };
