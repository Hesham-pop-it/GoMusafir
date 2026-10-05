const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { TrackSource } = require('livekit-server-sdk');
const { db } = require('../admin');
const { guardedTransaction } = require('./guardedTransaction');
const { roomService, STAFF_ROLES } = require('./tripVoiceService');

const MAX_SPEAKERS = 4;
const LEASE_MS = 120000;
const OPERATION_MS = 20000;
const speakerRef = (orgId, tripId) => db.ref(`voice_speakers/${orgId}/${tripId}`);

// Serialize the ledger AND LiveKit permission changes. Stop issuing RPCs long
// before the lease can expire; an RPC has an eight-second transport timeout.
async function withRoomLock(roomName, work) {
  const reference = db.ref(`voice_speaker_locks/${roomName}`);
  const owner = randomUUID();
  const acquired = await guardedTransaction(reference, lock => {
    if (lock && lock.until > Date.now()) return;
    return { owner, until: Date.now() + LEASE_MS };
  });
  if (!acquired.committed) throw new HttpsError('aborted', 'Speaker queue is updating. Please retry.');
  const deadline = Date.now() + OPERATION_MS;
  const check = () => {
    if (Date.now() >= deadline) throw new HttpsError('unavailable', 'Speaker permissions are still updating.');
  };
  try { return await work(check); }
  finally {
    await guardedTransaction(reference, lock => lock?.owner === owner ? null : undefined);
  }
}

async function updateSpeakers(orgId, tripId, command = {}) {
  const feature = (await db.ref(`trip_feature_access/${orgId}/${tripId}`).get()).val();
  const session = feature?.session;
  if (!session || session.status === 'ending' || feature.voiceAccess === 'EXPIRED') {
    if (command.action) throw new HttpsError('failed-precondition', 'Voice session has ended.');
    return;
  }
  if (command.roomName && command.roomName !== session.roomName) {
    if (!command.action) return;
    throw new HttpsError('failed-precondition', 'Voice session has changed.');
  }
  return withRoomLock(session.roomName, async check => {
    const current = (await db.ref(`trip_feature_access/${orgId}/${tripId}`).get()).val();
    if (current?.session?.id !== session.id || current.session.status === 'ending') return;
    const service = roomService();
    const [participants, staffSnap, membersSnap, muteSnap, previousSnap] = await Promise.all([
      service.listParticipants(session.roomName),
      db.ref(`orgs/${orgId}/staff`).get(), db.ref(`trips_participants/${tripId}`).get(),
      db.ref(`trips_active/${orgId}/${tripId}/voice_channel/isAllMuted`).get(),
      speakerRef(orgId, tripId).get(),
    ]);
    const staff = staffSnap.val() || {}, members = membersSnap.val() || {};
    const isStaff = uid => STAFF_ROLES.includes(staff[uid]);
    const connected = new Map(participants.map(p => [p.identity, p]));
    const previous = previousSnap.val();
    const state = previous?.sessionId === session.id ? previous : { sessionId: session.id, nextOrder: 0 };
    state.limit = MAX_SPEAKERS;
    state.roomName = session.roomName;
    state.sessionRequestedAt = session.requestedAt || 0;
    state.entries = state.entries || {};
    const save = async () => {
      check();
      const result = await guardedTransaction(speakerRef(orgId, tripId), value => {
        if ((value?.sessionRequestedAt || 0) > state.sessionRequestedAt) return;
        return state;
      });
      if (!result.committed) throw new HttpsError('failed-precondition', 'Voice session has changed.');
    };
    for (const [uid, entry] of Object.entries(state.entries)) {
      if (!connected.has(uid) || connected.get(uid).sid !== entry.sid ||
          (!isStaff(uid) && (!members[uid] || muteSnap.val() === true))) delete state.entries[uid];
    }
    const { action, uid, targetUid, requestId } = command;
    if (action === 'request') {
      const participant = connected.get(uid);
      if (!participant || participant.sid !== command.participantSid) {
        throw new HttpsError('failed-precondition', 'Connect to Voice before requesting a microphone.');
      }
      if (!isStaff(uid) && (!members[uid] || muteSnap.val() === true)) {
        throw new HttpsError('permission-denied', 'Speaking is currently disabled by the organizer.');
      }
      if (isStaff(uid) && Object.keys(state.entries).filter(id => id !== uid && isStaff(id)).length >= MAX_SPEAKERS) {
        throw new HttpsError('resource-exhausted', 'All four microphones are occupied by organizers. Mute an organizer before unmuting.');
      }
      if (!state.entries[uid]) {
        state.entries[uid] = { sid: participant.sid, requestId, order: ++state.nextOrder,
          status: 'queued' };
      } else if (state.entries[uid].requestId !== requestId) {
        // A new press supersedes an interrupted request on this connection.
        state.entries[uid].requestId = requestId;
      }
    } else if (action === 'release') {
      if (state.entries[uid]?.requestId === requestId) delete state.entries[uid];
    } else if (action === 'revoke' || action === 'grant') {
      if (!isStaff(uid)) throw new HttpsError('permission-denied', 'Organizer access required.');
      if (action === 'revoke') delete state.entries[targetUid];
      else {
        const entry = state.entries[targetUid];
        if (!entry) throw new HttpsError('failed-precondition', 'This person must request to speak first.');
        if (entry.status === 'queued') {
          entry.order = Math.min(0, ...Object.values(state.entries).map(e => e.order)) - 1;
        }
      }
    }
    const ordered = Object.entries(state.entries).sort(([aUid, a], [bUid, b]) =>
      Number(!isStaff(aUid)) - Number(!isStaff(bUid)) ||
      Number(a.status === 'queued') - Number(b.status === 'queued') || a.order - b.order || aUid.localeCompare(bUid));
    const selected = new Set(ordered.slice(0, MAX_SPEAKERS).map(([id]) => id));
    for (const [id, entry] of ordered) {
      entry.status = selected.has(id) ? (entry.status === 'granted' ? 'granted' : 'granting') : 'queued';
    }
    check();
    // Persist intent before RPCs, so a retry can repair a partially applied grant.
    await save();
    const permission = canPublish => ({ canSubscribe: true, canPublish, canPublishData: true,
      canPublishSources: [TrackSource.MICROPHONE], canUpdateMetadata: false });
    // Never reuse a slot until the old publisher has been revoked successfully.
    for (const participant of participants) {
      if (!selected.has(participant.identity) && participant.permission?.canPublish) {
        check();
        await service.updateParticipant(session.roomName, participant.identity, { permission: permission(false) });
      }
    }
    for (const id of selected) {
      check();
      if (!connected.get(id).permission?.canPublish || state.entries[id].status !== 'granted') {
        await service.updateParticipant(session.roomName, id, { permission: permission(true) });
      }
      state.entries[id].status = 'granted';
    }
    check();
    await save();
    return state;
  });
}

module.exports = { MAX_SPEAKERS, updateSpeakers, withRoomLock };
