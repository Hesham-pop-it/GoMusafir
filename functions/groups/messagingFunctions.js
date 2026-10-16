// ─── Direct messaging ────────────────────────────────────────────────────────
// Message requests, blocks, inbox rows, Journey team thread and staff chat.
// Paths and payloads follow thoughts/projects/GoMusafir/plans/*direct-messaging-contract.md.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onValueCreated } = require('firebase-functions/v2/database');
const { admin, db } = require('../admin');
const { requireTripAccess } = require('../services/participantAccessService');
const { visible } = require('../services/participantProfileService');
const { decrypt } = require('../services/kmsService');
const { sendPushNotification } = require('../services/notificationService');
const { isInVoice } = require('../services/voicePresenceService');
const { verifyAppCheck } = require('../middleware/appCheckMiddleware');

const region = 'europe-west1';
const STAFF_ROLES = ['admin', 'manager', 'co-host'];
const ROLE_LABELS = { admin: 'Admin', manager: 'Manager', 'co-host': 'Co-Host' };
const MAX_REQUEST_TEXT = 500;
const REQUESTS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
const validKey = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);

const hits = new Map(); // uid -> { count, resetAt }; per instance, like the other rate limiter
function hourlyLimit(uid, now = Date.now()) {
  const record = hits.get(uid);
  if (!record || now > record.resetAt) { hits.set(uid, { count: 1, resetAt: now + HOUR_MS }); return; }
  if (++record.count > REQUESTS_PER_HOUR) throw new HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
}

const notEligible = () => new HttpsError('failed-precondition', 'not-eligible');
const threadIdFor = (a, b) => [a, b].sort().join('_');
const base = (orgId, tripId) => `trips_active/${orgId}/${tripId}`;

function messageTextFor(data) {
  if (data.text) return data.text;
  if (data.type === 'image') return '📷 Sent a photo';
  if (data.type === 'voice') return '🎤 Sent a voice message';
  if (data.type === 'video') return '🎬 Sent a video';
  if (data.type === 'location') return '📍 Shared a location';
  return 'Sent a message';
}

// Display name from the user record, same field fallbacks as getParticipantProfile.
async function loadPerson(uid) {
  const user = (await db.ref(`users/${uid}`).get()).val() || {};
  let encrypted = {};
  if (user.p_profile) {
    try { encrypted = JSON.parse(decrypt(user.p_profile)) || {}; } catch (_) { /* fall back to plain fields */ }
  }
  const profile = user.profile || {};
  const pick = (...values) => values.find(v => typeof v === 'string' && v.trim() && v.trim() !== '***') || '';
  const firstName = pick(encrypted.firstName, profile.firstName, profile.first_name, user.first_name);
  const lastName = pick(encrypted.lastName, profile.lastName, profile.last_name, user.last_name);
  return { firstName, lastName, fullName: `${firstName} ${lastName}`.trim(),
    image: pick(profile.photoURL, encrypted.photoURL, user.photo_url), user };
}

async function staffRoleOf(orgId, uid) {
  const role = (await db.ref(`orgs/${orgId}/staff/${uid}`).get()).val();
  return STAFF_ROLES.includes(role) ? role : null;
}

async function staffUidsOf(orgId) {
  const val = (await db.ref(`orgs/${orgId}/staff`).get()).val() || {};
  return Object.keys(val).filter(uid => STAFF_ROLES.includes(val[uid]));
}

// The pilgrim's first name counts as visible to other participants only for "Show to everyone".
function nameVisibleToParticipants(trip, user, tripId) {
  return visible('name', (trip && trip.visibility_config) || {}, (user.participant_visibility || {})[tripId] || {}, false, false, false);
}

// What another pilgrim may see of this person: names and photo follow the trip's visibility settings.
function maskedFor(person, trip, tripId) {
  const config = (trip && trip.visibility_config) || {};
  const personal = (person.user.participant_visibility || {})[tripId] || {};
  const canSee = field => visible(field, config, personal, false, false, false);
  const first = canSee('name') ? person.firstName : '';
  const name = first ? (canSee('lastname') && person.lastName ? `${first} ${person.lastName}` : first) : '';
  return { firstVisible: Boolean(first), name, image: canSee('photo') ? person.image : '' };
}

function pushPayload({ type, orgId, tripId, kind, conversationId, name, senderUid, senderImage, message, timestamp }) {
  return { type, tripId, orgId, conversationKind: kind, conversationId: String(conversationId),
    name: String(name || ''), senderUid: String(senderUid || ''), senderImage: String(senderImage || ''),
    message: String(message || ''), timestamp: String(timestamp) };
}

// Quiet while the recipient is in the voice channel (and for bursts, when `forceQuiet`).
async function pushTo(uid, title, body, payload, { orgId, tripId, forceQuiet = false, collapseKey = null }) {
  const quiet = forceQuiet || await isInVoice(orgId, tripId, uid);
  const options = { tripId, interruptionLevel: 'active', androidChannelId: 'Chat', eventId: null, skipDbSave: true };
  if (quiet) options.quiet = true;
  if (collapseKey) options.collapseKey = collapseKey;
  return sendPushNotification(uid, title, body, payload, options);
}

function tripNotification(orgId, tripId, uid, item) {
  return db.ref(`${base(orgId, tripId)}/notifications/${uid}`).push().set({
    ...item, tripId, orgId, read: false, seen: false });
}

// ── Callables ────────────────────────────────────────────────────────────────

exports.sendMessageRequest = onCall({ region }, async request => {
  verifyAppCheck(request);
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  const { tripId, targetUid } = request.data || {};
  const text = typeof request.data?.text === 'string' ? request.data.text.trim() : '';
  if (!validKey(tripId) || !validKey(targetUid) || !text || text.length > MAX_REQUEST_TEXT) {
    throw new HttpsError('invalid-argument', 'Invalid message request.');
  }
  const me = request.auth.uid;
  hourlyLimit(me);
  const { orgId, trip, staff } = await requireTripAccess(request, tripId);
  if (staff || targetUid === me) throw notEligible();

  const threadId = threadIdFor(me, targetUid);
  const b = base(orgId, tripId);
  const [member, targetRole, blockedByMe, blockedMe, settings, thread, target] = await Promise.all([
    db.ref(`trips_participants/${tripId}/${targetUid}`).get(),
    staffRoleOf(orgId, targetUid),
    db.ref(`${b}/blocks/${me}/${targetUid}`).get(),
    db.ref(`${b}/blocks/${targetUid}/${me}`).get(),
    db.ref(`${b}/message_settings/${targetUid}/requests`).get(),
    db.ref(`${b}/dm_threads/${threadId}`).get(),
    loadPerson(targetUid),
  ]);
  // An existing thread answers first, so a block looks the same as a decline.
  if (thread.exists()) throw new HttpsError('already-exists', 'A conversation already exists.', { threadId });
  if (member.val() !== true || targetRole || blockedByMe.exists() || blockedMe.exists()) throw notEligible();
  if (settings.val() === 'nobody' || !nameVisibleToParticipants(trip, target.user, tripId)) throw notEligible();

  const sender = await loadPerson(me);
  const senderMask = maskedFor(sender, trip, tripId);
  const senderVisible = senderMask.firstVisible && Boolean(sender.firstName);
  const senderName = senderVisible ? sender.firstName : 'a participant';
  const senderShown = senderVisible ? senderMask.name : senderName;
  const targetShown = maskedFor(target, trip, tripId).name || target.firstName;
  const messageId = db.ref(`${b}/dm_messages/${threadId}`).push().key;
  const now = admin.database.ServerValue.TIMESTAMP;
  const nowMs = Date.now();
  // Claim the thread first: both sides map to the same id, so a simultaneous request aborts here.
  const claim = await db.ref(`${b}/dm_threads/${threadId}`).transaction(current => (current ? undefined
    : { members: { [me]: true, [targetUid]: true }, requester: me, status: 'pending' }));
  if (!claim.committed) throw new HttpsError('already-exists', 'A conversation already exists.', { threadId });
  try {
    await db.ref().update({
      [`${b}/dm_threads/${threadId}/created_at`]: now,
      [`${b}/dm_messages/${threadId}/${messageId}`]: {
        text, sender_id: me, sender_name: senderShown, avatar: senderMask.image, timestamp: now, type: 'text' },
      [`${b}/inbox/${me}/${threadId}`]: { kind: 'request_out', peer: targetUid, peer_name: targetShown, last_at: now, last_text: text, unread: 0 },
      [`${b}/inbox/${targetUid}/${threadId}`]: { kind: 'request_in', peer: me, peer_name: senderVisible ? senderMask.name : '', last_at: now, last_text: text, unread: 1 },
    });
  } catch (error) {
    await db.ref(`${b}/dm_threads/${threadId}`).remove().catch(() => {});
    throw error;
  }

  // Never put the message text in the push or the notification item.
  const body = `Message request from ${senderName}`;
  const payload = pushPayload({ type: 'dm_request', orgId, tripId, kind: 'dm', conversationId: threadId,
    name: senderName, senderUid: me, senderImage: senderMask.image, message: body, timestamp: nowMs });
  await Promise.all([
    pushTo(targetUid, 'Message request', body, payload, { orgId, tripId }),
    tripNotification(orgId, tripId, targetUid, { type: 'dm_request', title: 'Message request', message: body,
      name: senderName, senderUid: me, timestamp: nowMs }),
  ]);
  return { threadId };
});

exports.respondToMessageRequest = onCall({ region }, async request => {
  verifyAppCheck(request);
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  const { tripId, threadId, action } = request.data || {};
  if (!validKey(tripId) || !validKey(threadId) || !['accept', 'decline', 'block'].includes(action)) {
    throw new HttpsError('invalid-argument', 'Invalid response.');
  }
  const me = request.auth.uid;
  const { orgId, trip } = await requireTripAccess(request, tripId);
  const b = base(orgId, tripId);
  const thread = (await db.ref(`${b}/dm_threads/${threadId}`).get()).val();
  if (!thread || !thread.members || thread.members[me] !== true || thread.requester === me) throw notEligible();
  const other = Object.keys(thread.members).find(uid => uid !== me);
  const now = admin.database.ServerValue.TIMESTAMP;

  if (action === 'accept') {
    if (thread.status === 'accepted') return { ok: true };
    const [mineSnap, theirsSnap, messagesSnap] = await Promise.all([
      db.ref(`${b}/inbox/${me}/${threadId}`).get(), db.ref(`${b}/inbox/${other}/${threadId}`).get(),
      db.ref(`${b}/dm_messages/${threadId}`).get()]);
    const updates = {
      [`${b}/dm_threads/${threadId}/status`]: 'accepted',
      [`${b}/dm_threads/${threadId}/accepted_at`]: now,
      [`${b}/dm_private/${me}/${threadId}`]: null,
    };
    // A blocked-then-unblocked request can lack a row: write it whole, with names masked for that viewer.
    const missing = [[me, other, mineSnap], [other, me, theirsSnap]].filter(([, , snap]) => !snap.exists());
    if (missing.length) {
      const last = Object.values(messagesSnap.val() || {}).sort((x, y) => (Number(x.timestamp) || 0) - (Number(y.timestamp) || 0)).pop() || {};
      const peers = await Promise.all(missing.map(([, peerUid]) => loadPerson(peerUid)));
      missing.forEach(([viewer, peerUid], i) => {
        updates[`${b}/inbox/${viewer}/${threadId}`] = { kind: 'dm', peer: peerUid, peer_name: maskedFor(peers[i], trip, tripId).name,
          last_at: last.timestamp || thread.created_at || now, last_text: last.text ? last.text : messageTextFor(last), unread: 0 };
      });
    }
    for (const [viewer, , snap] of [[me, other, mineSnap], [other, me, theirsSnap]]) {
      if (snap.exists()) updates[`${b}/inbox/${viewer}/${threadId}/kind`] = 'dm';
    }
    await db.ref().update(updates);
    return { ok: true };
  }
  if (thread.status !== 'pending') throw new HttpsError('failed-precondition', 'invalid-state');

  if (action === 'decline') {
    // Silent: the sender keeps seeing "Waiting to accept".
    await db.ref().update({
      [`${b}/dm_private/${me}/${threadId}`]: { declined_at: now },
      [`${b}/inbox/${me}/${threadId}/kind`]: 'declined',
    });
    return { ok: true };
  }

  const reportId = db.ref(`${b}/reports`).push().key;
  await db.ref().update({
    [`${b}/blocks/${me}/${other}`]: true,
    [`${b}/reports/${reportId}`]: { reporter: me, reported: other, threadId, at: now },
    [`${b}/inbox/${me}/${threadId}`]: null,
  });
  const [reporter, staffUids] = await Promise.all([loadPerson(me), staffUidsOf(orgId)]);
  const name = reporter.fullName || reporter.firstName || 'A participant';
  const body = `${name} blocked and reported someone`;
  const nowMs = Date.now();
  const payload = pushPayload({ type: 'message_report', orgId, tripId, kind: 'dm', conversationId: threadId,
    name, senderUid: me, senderImage: reporter.image, message: body, timestamp: nowMs });
  await Promise.all(staffUids.flatMap(uid => [
    pushTo(uid, 'Message report', body, payload, { orgId, tripId }),
    tripNotification(orgId, tripId, uid, { type: 'message_report', title: 'Message report', message: body,
      name, senderUid: me, timestamp: nowMs }),
  ]));
  return { ok: true };
});

exports.unblockParticipant = onCall({ region }, async request => {
  verifyAppCheck(request);
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  const { tripId, uid } = request.data || {};
  if (!validKey(tripId) || !validKey(uid)) throw new HttpsError('invalid-argument', 'Invalid request.');
  const { orgId } = await requireTripAccess(request, tripId);
  await db.ref(`${base(orgId, tripId)}/blocks/${request.auth.uid}/${uid}`).remove();
  return { ok: true };
});

// ── Triggers ─────────────────────────────────────────────────────────────────

exports.onDirectMessageCreated = onValueCreated({
  ref: 'trips_active/{orgId}/{tripId}/dm_messages/{threadId}/{messageId}', region,
}, async event => {
  const data = event.data.val();
  const { orgId, tripId, threadId } = event.params;
  if (!data || !data.sender_id) return;
  const b = base(orgId, tripId);
  const thread = (await db.ref(`${b}/dm_threads/${threadId}`).get()).val();
  // The request message itself is handled by sendMessageRequest.
  if (!thread || thread.status !== 'accepted' || !thread.members) return;
  const peer = Object.keys(thread.members).find(uid => uid !== data.sender_id);
  if (!peer || thread.members[data.sender_id] !== true) return;

  const text = messageTextFor(data);
  const at = data.timestamp || Date.now();
  await Promise.all([
    db.ref(`${b}/inbox/${data.sender_id}/${threadId}`).update({ last_at: at, last_text: text }),
    db.ref(`${b}/inbox/${peer}/${threadId}`).update({ last_at: at, last_text: text }),
    db.ref(`${b}/inbox/${peer}/${threadId}/unread`).transaction(n => (n || 0) + 1),
  ]);
  // Title and photo come from the masked profile, not from the client-written message.
  const [tripSnap, sender] = await Promise.all([db.ref(`orgs/${orgId}/trips/${tripId}`).get(), loadPerson(data.sender_id)]);
  const shown = maskedFor(sender, tripSnap.val(), tripId);
  const name = shown.name || 'Someone';
  await pushTo(peer, name, text, pushPayload({ type: 'dm_message', orgId, tripId, kind: 'dm', conversationId: threadId,
    name, senderUid: data.sender_id, senderImage: shown.image, message: text, timestamp: Date.now() }), { orgId, tripId });
});

exports.onTeamMessageCreated = onValueCreated({
  ref: 'trips_active/{orgId}/{tripId}/team/{pilgrimUid}/{messageId}', region,
}, async event => {
  const data = event.data.val();
  const { orgId, tripId, pilgrimUid } = event.params;
  if (!data || !data.sender_id) return;
  const b = base(orgId, tripId);
  const text = messageTextFor(data);
  const at = data.timestamp || Date.now();
  const role = await staffRoleOf(orgId, data.sender_id);
  const nowMs = Date.now();

  if (!role) {
    if (data.sender_id !== pilgrimUid) return;
    const [meta, pilgrim, staffUids] = await Promise.all([
      db.ref(`${b}/team_meta/${pilgrimUid}`).get(), loadPerson(pilgrimUid), staffUidsOf(orgId)]);
    const wasWaiting = meta.val()?.needs_reply === true;
    const pilgrimName = pilgrim.fullName || data.sender_name || 'Pilgrim';
    await db.ref(`${b}/team_meta/${pilgrimUid}`).update({
      last_at: at, last_text: text, last_sender_id: pilgrimUid, last_sender_name: pilgrimName, pilgrim_name: pilgrimName,
      needs_reply: true, notified_at: nowMs, ...(wasWaiting ? {} : { replied_by: null, replied_by_uid: null, replied_role: null }),
    });
    const payload = pushPayload({ type: 'team_message', orgId, tripId, kind: 'team', conversationId: pilgrimUid,
      name: pilgrimName, senderUid: pilgrimUid, senderImage: data.avatar || pilgrim.image, message: text, timestamp: nowMs });
    // A burst makes one sound: later messages before a reply are quiet and share a collapse key.
    await Promise.all(staffUids.map(uid => pushTo(uid, `${pilgrimName} · Journey team`, text, payload,
      { orgId, tripId, forceQuiet: wasWaiting, collapseKey: `team_${pilgrimUid}` })));
    return;
  }

  const staffPerson = await loadPerson(data.sender_id);
  const staffName = data.sender_name || staffPerson.fullName || staffPerson.firstName || 'Journey team';
  await db.ref(`${b}/team_meta/${pilgrimUid}`).update({
    last_at: at, last_text: text, last_sender_id: data.sender_id, last_sender_name: staffName,
    needs_reply: false, replied_by: staffName, replied_by_uid: data.sender_id, replied_role: role,
  });
  if (pilgrimUid === data.sender_id) return;
  const title = `${staffName} (${ROLE_LABELS[role]}) · Journey team`;
  const payload = pushPayload({ type: 'team_message', orgId, tripId, kind: 'team', conversationId: pilgrimUid,
    name: staffName, senderUid: data.sender_id, senderImage: data.avatar || staffPerson.image, message: text, timestamp: nowMs });
  await Promise.all([
    pushTo(pilgrimUid, title, text, payload, { orgId, tripId }),
    tripNotification(orgId, tripId, pilgrimUid, { type: 'team_message', title, message: text, name: staffName,
      senderUid: data.sender_id, timestamp: nowMs }),
  ]);
});

exports.onStaffChatCreated = onValueCreated({
  ref: 'trips_active/{orgId}/{tripId}/staff_chat/{messageId}', region,
}, async event => {
  const data = event.data.val();
  const { orgId, tripId } = event.params;
  if (!data || !data.sender_id) return;
  const text = messageTextFor(data);
  const name = data.sender_name || 'Someone';
  const staffUids = (await staffUidsOf(orgId)).filter(uid => uid !== data.sender_id);
  const payload = pushPayload({ type: 'staff_chat', orgId, tripId, kind: 'staff', conversationId: 'staff',
    name, senderUid: data.sender_id, senderImage: data.avatar, message: text, timestamp: Date.now() });
  await Promise.all(staffUids.map(uid => pushTo(uid, name, text, payload, { orgId, tripId })));
});
