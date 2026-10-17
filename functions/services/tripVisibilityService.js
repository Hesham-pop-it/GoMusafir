const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../admin');
const { requireTripAccess } = require('./participantAccessService');
const { getParticipantProfile } = require('./participantProfileService');
const { visible, activeGrant } = require('./visibilityPolicy');
const { respond } = require('./unchangedResponse');
const { cachedUser } = require('./userRecordCache');
const { loadTerms, isActive, expiryEntry } = require('./notificationTerms');
const roles = ['admin', 'manager', 'co-host'];
const id = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);

// `only` limits the result to the people a chat, voice or notification payload
// names; those sections need no coordinates, only names and location visibility.
// `fresh` skips the shared record cache (server-written views must not lag).
// `synthetic` marks a server-side audience viewer: it holds no grants, and with
// `only` just those people's membership is read instead of the whole lists.
async function directory(request, access, only = null, fresh = false, synthetic = false) {
  const { tripId } = request.data;
  const { orgId, trip, staff } = access;
  const root = `trips_active/${orgId}/${tripId}`;
  const none = { val: () => null };
  const narrow = synthetic && only;
  const entries = async path => Object.fromEntries(await Promise.all([...only].map(async uid => [uid, (await db.ref(`${path}/${uid}`).get()).val()])));
  const [memberMap, staffMap, locations, permissions] = await Promise.all([
    narrow ? entries(`trips_participants/${tripId}`) : db.ref(`trips_participants/${tripId}`).get().then(snap => snap.val() || {}),
    narrow ? entries(`orgs/${orgId}/staff`) : db.ref(`orgs/${orgId}/staff`).get().then(snap => snap.val() || {}),
    only ? none : db.ref(`${root}/locations`).get(), synthetic ? none : db.ref(`${root}/location_permissions`).get(),
  ]);
  const members = { val: () => memberMap }, staffSnap = { val: () => staffMap };
  const uids = new Set(Object.keys(memberMap).filter(uid => memberMap[uid] === true));
  Object.entries(staffMap).forEach(([uid, role]) => { if (roles.includes(role)) uids.add(uid); });
  if (only) for (const uid of uids) if (!only.has(uid)) uids.delete(uid);
  const users = {}, allowedLocations = {}, grants = {};
  await Promise.all([...uids].map(async uid => {
    // The viewer's own record is read fresh so their own privacy choices show at once.
    const userSnap = fresh || uid === request.auth.uid ? await db.ref(`users/${uid}`).get() : await cachedUser(db, uid);
    const personal = userSnap.val()?.participant_visibility?.[tripId] || {};
    let result;
    try { result = await getParticipantProfile({ ...request, data: { tripId, targetUid: uid } }, { access, snapshots: [
      { val: () => members.val()?.[uid] }, { val: () => staffSnap.val()?.[uid] }, userSnap,
    ] }); }
    catch (error) { if (error.code === 'not-found') return; throw error; }
    const profile = Object.fromEntries(Object.entries(result.profile).map(([k, v]) => [k, v === '***' ? '' : v]));
    const ownGrant = permissions.val()?.[uid]?.[request.auth.uid];
    const granted = activeGrant(ownGrant);
    const canSeeLocation = visible('location', trip.visibility_config, personal, uid === request.auth.uid, staff) || granted;
    // Do not expose private visibility choices, raw profiles, or alternate PII aliases.
    // The effective settings describe only this viewer's already-redacted result.
    const effective = {};
    for (const [field, flag] of [['name','canSeeFirstName'],['lastname','canSeeLastName'],['email','canSeeEmail'],['phone','canSeePhone'],['photo','canSeePhoto']]) {
      effective[field] = result.visibility[flag] ? 'Show to everyone' : 'Do not show';
    }
    effective.location = canSeeLocation ? 'Show to everyone' : 'Do not show';
    users[uid] = { profile, full_name: [profile.firstName, profile.lastName].filter(Boolean).join(' '),
      photo_url: profile.photoURL, participant_visibility: { [tripId]: effective },
      visibility: { ...result.visibility, canSeeLocation } };
    if (granted) grants[uid] = { [request.auth.uid]: ownGrant };
    const loc = locations.val()?.[uid];
    if (canSeeLocation && loc) {
      allowedLocations[uid] = Object.fromEntries(['lat','lng','latitude','longitude','speed','heading','accuracy','updated_at']
        .filter(key => loc[key] !== undefined).map(key => [key, loc[key]]));
    }
  }));
  return { users, locations: allowedLocations, location_permissions: grants };
}

function displayName(users, uid) { return users[uid]?.full_name || 'Participant'; }
const senderOf = message => message.sender_id || message.senderUid || message.fromUid || message.senderId;
// Everyone sanitizeMessage looks up, including the author of a quoted reply.
function sendersOf(messages) {
  const uids = new Set();
  const add = message => {
    if (!message || typeof message !== 'object') return;
    for (const key of ['sender_id', 'senderUid', 'fromUid', 'senderId']) if (typeof message[key] === 'string') uids.add(message[key]);
    add(message.replyTo);
  };
  Object.values(messages).forEach(add);
  return uids;
}
function sanitizeMessage(message, users) {
  if (!message || typeof message !== 'object') return message;
  const uid = senderOf(message);
  const result = { ...message };
  // Older messages carried denormalized profile data. Never return those copies.
  for (const key of ['sender','sender_name','senderName','name','full_name','firstName','lastName','email','phone','sender_email','sender_phone']) {
    if (key in result) result[key] = ['sender','sender_name','senderName','name','full_name'].includes(key) ? displayName(users, uid) : '';
  }
  for (const key of ['avatar','senderImage','photoURL','photo_url']) if (key in result) result[key] = users[uid]?.profile?.photoURL || '';
  if (result.replyTo) result.replyTo = sanitizeMessage(result.replyTo, users);
  // A location attachment is subject to the same rule as the live map.
  if (!users[uid]?.visibility?.canSeeLocation) {
    for (const key of ['lat','lng','latitude','longitude','location','coordinates','address']) delete result[key];
    if (result.type === 'location') { result.type = 'text'; result.text = 'Location is private'; }
  }
  return result;
}

async function getVisibleTripData(request) {
  return respond(request, await visibleTripData(request));
}
async function visibleTripData(request) {
  const { tripId, section = 'directory' } = request.data || {};
  if (!id(tripId) || !['directory','chat','voice','notifications'].includes(section)) throw new HttpsError('invalid-argument', 'Invalid visibility request.');
  const access = await requireTripAccess(request, tripId);
  if (section === 'directory') return directory(request, access);
  const root = `trips_active/${access.orgId}/${tripId}`;
  if (section === 'chat') {
    const messages = (await db.ref(`${root}/chat`).orderByChild('timestamp').limitToLast(500).get()).val() || {};
    const data = await directory(request, access, sendersOf(messages));
    return Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, sanitizeMessage(value, data.users)]));
  }
  if (section === 'voice') {
    const voice = (await db.ref(`${root}/voice_channel`).get()).val() || {};
    if (voice.activeSpeaker && typeof voice.activeSpeaker === 'object') {
      const uid = voice.activeSpeaker.uid || voice.activeSpeaker.id;
      const data = await directory(request, access, new Set(typeof uid === 'string' ? [uid] : []));
      voice.activeSpeaker = { uid: uid || '', name: displayName(data.users, uid),
        photoURL: data.users[uid]?.profile?.photoURL || '', avatar: data.users[uid]?.profile?.photoURL || '' };
    }
    return voice;
  }
  // Only active notifications leave the server; expired ones wait for the daily prune.
  const [all, terms] = await Promise.all([db.ref(`${root}/notifications/${request.auth.uid}`).get(), loadTerms(db)]);
  const now = Date.now();
  const notifications = Object.fromEntries(Object.entries(all.val() || {})
    .filter(([, value]) => value && typeof value === 'object' && isActive(value, terms, now, access.trip?.end_date)));
  const data = await directory(request, access, sendersOf(notifications));
  return Object.fromEntries(Object.entries(notifications).map(([key, value]) => {
    const result = sanitizeMessage(value, data.users);
    // Notification text may embed a now-hidden name; render structured events instead.
    if (value.senderUid || value.fromUid || value.sender_id) {
      result.name = displayName(data.users, value.senderUid || value.fromUid || value.sender_id);
      result.title = value.type === 'location_request' ? 'Location Request' : 'Trip Update';
      result.message = value.type === 'location_request' ? 'A participant is asking for your location.' : 'You have a trip update.';
    }
    if (value.type === 'location_response') {
      const response = require('./notificationPrivacy').redactNotification(value);
      result.title = response.title;
      result.message = response.message;
    }
    return [key, result];
  }));
}

async function requestParticipantLocation(request) {
  const { tripId, targetUid } = request.data || {};
  if (!id(tripId) || !id(targetUid) || targetUid === request.auth.uid) throw new HttpsError('invalid-argument', 'Choose another participant.');
  const { orgId } = await requireTripAccess(request, tripId);
  const members = (await db.ref(`trips_participants/${tripId}`).get()).val() || {};
  if (members[targetUid] !== true || members[request.auth.uid] !== true) throw new HttpsError('permission-denied', 'Both users must be participants in this trip.');
  const root = `trips_active/${orgId}/${tripId}`;
  const notification = db.ref(`${root}/notifications/${targetUid}`).push();
  await notification.set({ type: 'location_request', senderUid: request.auth.uid, fromUid: request.auth.uid,
    tripId, orgId, status: 'pending', timestamp: Date.now(), expiresAt: Date.now() + 15 * 60 * 1000,
    name: 'Participant', title: 'Location Request', message: 'A participant is asking to see your location for 15 minutes.' });
  return { id: notification.key };
}
async function respondToLocationRequest(request) {
  const { tripId, notificationId, accept } = request.data || {};
  if (!id(tripId) || !id(notificationId) || typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'Invalid response.');
  const { orgId } = await requireTripAccess(request, tripId);
  const uid = request.auth.uid;
  const root = `trips_active/${orgId}/${tripId}`;
  const notificationRef = db.ref(`${root}/notifications/${uid}/${notificationId}`);
  const notification = (await notificationRef.get()).val();
  if (!notification || notification.type !== 'location_request' || !id(notification.senderUid)) throw new HttpsError('not-found', 'Request not found.');
  const members = (await db.ref(`trips_participants/${tripId}`).get()).val() || {};
  const GRANT_MS = 15 * 60 * 1000;
  const sender = notification.senderUid;
  const grantPath = `${root}/location_permissions/${uid}/${sender}`;
  const responsePath = `${root}/notifications/${sender}/location_response_${notificationId}`;
  // One multi-path write: the response, the grant and the prune entry stand or fall together.
  const answerUpdates = (status, at) => {
    const accepted = status === 'accepted';
    const updates = {
      [responsePath]: {
        type: 'location_response', senderUid: uid, tripId, orgId, timestamp: at, status, name: 'Participant',
        title: accepted ? 'Location Request Accepted' : 'Location Request Declined',
        message: accepted ? 'Location is shared with you for 15 minutes.' : 'The participant declined your request.',
      },
      // The answered request leaves the list; the prune removes it.
      ...expiryEntry(notificationId, `${root}/notifications/${uid}/${notificationId}`, at),
    };
    if (accepted) updates[grantPath] = { acceptedAt: at, expiresAt: at + GRANT_MS, requestId: notificationId };
    return updates;
  };
  const wanted = accept ? 'accepted' : 'declined';
  if (notification.status && notification.status !== 'pending') {
    // A retry after the answer was stored but the write that follows failed: finish it from the
    // stored answer time, so the grant never outlives the original 15 minutes.
    if (notification.status === wanted && members[uid] === true && members[sender] === true) {
      const at = notification.respondedAt;
      const [response, grant] = await Promise.all([db.ref(responsePath).get(), db.ref(grantPath).get()]);
      const live = wanted === 'declined' || (Number.isFinite(at) && at + GRANT_MS > Date.now());
      if (live && (!response.exists() || (wanted === 'accepted' && !grant.exists()))) {
        await db.ref().update(answerUpdates(wanted, Number.isFinite(at) ? at : Date.now()));
      }
    }
    return { status: notification.status };
  }
  if (!(notification.expiresAt > Date.now())) throw new HttpsError('failed-precondition', 'This request has expired. Ask for a new request.');
  if (members[uid] !== true || members[sender] !== true) throw new HttpsError('permission-denied', 'Participant no longer belongs to this trip.');
  const now = Date.now();
  // Transaction on the one request binds the answer to it once, so retries cannot extend a grant.
  const result = await notificationRef.transaction(pending => {
    if (pending === null) return;
    if (!pending || pending.status !== 'pending' || pending.expiresAt <= now) return;
    pending.status = wanted;
    pending.respondedAt = now;
    pending.visible_until = now;
    return pending;
  });
  if (!result.committed || result.snapshot.val()?.status !== wanted || result.snapshot.val()?.respondedAt !== now) {
    const stored = result.snapshot.val();
    if (!stored) throw new HttpsError('not-found', 'Request not found.');
    if (stored.status === 'pending') throw new HttpsError('failed-precondition', 'This request has expired. Ask for a new request.');
    throw new HttpsError('failed-precondition', 'This request was already handled.');
  }
  await db.ref().update(answerUpdates(wanted, now));
  return { status: wanted, expiresAt: accept ? now + GRANT_MS : null };
}
module.exports = { getVisibleTripData, requestParticipantLocation, respondToLocationRequest, sanitizeMessage, sendersOf, senderOf, directory };
