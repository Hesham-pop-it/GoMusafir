const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../admin');
const { requireTripAccess } = require('./participantAccessService');
const { getParticipantProfile } = require('./participantProfileService');
const { visible, activeGrant } = require('./visibilityPolicy');
const roles = ['admin', 'manager', 'co-host'];
const id = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);

async function directory(request, access) {
  const { tripId } = request.data;
  const { orgId, trip, staff } = access;
  const root = `trips_active/${orgId}/${tripId}`;
  const [members, staffSnap, locations, permissions] = await Promise.all([
    db.ref(`trips_participants/${tripId}`).get(), db.ref(`orgs/${orgId}/staff`).get(),
    db.ref(`${root}/locations`).get(), db.ref(`${root}/location_permissions`).get(),
  ]);
  const uids = new Set(Object.keys(members.val() || {}).filter(uid => members.val()[uid] === true));
  Object.entries(staffSnap.val() || {}).forEach(([uid, role]) => { if (roles.includes(role)) uids.add(uid); });
  const users = {}, allowedLocations = {}, grants = {};
  await Promise.all([...uids].map(async uid => {
    const userSnap = await db.ref(`users/${uid}`).get();
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
function sanitizeMessage(message, users) {
  if (!message || typeof message !== 'object') return message;
  const uid = message.sender_id || message.senderUid || message.fromUid || message.senderId;
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
  const { tripId, section = 'directory' } = request.data || {};
  if (!id(tripId) || !['directory','chat','voice','notifications'].includes(section)) throw new HttpsError('invalid-argument', 'Invalid visibility request.');
  const access = await requireTripAccess(request, tripId);
  const data = await directory(request, access);
  if (section === 'directory') return data;
  const root = `trips_active/${access.orgId}/${tripId}`;
  if (section === 'chat') {
    const messages = (await db.ref(`${root}/chat`).orderByChild('timestamp').limitToLast(500).get()).val() || {};
    return Object.fromEntries(Object.entries(messages).map(([key, value]) => [key, sanitizeMessage(value, data.users)]));
  }
  if (section === 'voice') {
    const voice = (await db.ref(`${root}/voice_channel`).get()).val() || {};
    if (voice.activeSpeaker && typeof voice.activeSpeaker === 'object') {
      const uid = voice.activeSpeaker.uid || voice.activeSpeaker.id;
      voice.activeSpeaker = { uid: uid || '', name: displayName(data.users, uid),
        photoURL: data.users[uid]?.profile?.photoURL || '', avatar: data.users[uid]?.profile?.photoURL || '' };
    }
    return voice;
  }
  const notifications = (await db.ref(`${root}/notifications/${request.auth.uid}`).get()).val() || {};
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
  if (notification.status && notification.status !== 'pending') return { status: notification.status };
  if (!(notification.expiresAt > Date.now())) throw new HttpsError('failed-precondition', 'This request has expired. Ask for a new request.');
  const members = (await db.ref(`trips_participants/${tripId}`).get()).val() || {};
  if (members[uid] !== true || members[notification.senderUid] !== true) throw new HttpsError('permission-denied', 'Participant no longer belongs to this trip.');
  const now = Date.now();
  // Transaction binds acceptance to this request once, so retries cannot extend a grant.
  const result = await db.ref(root).transaction(current => {
    if (current === null) return null;
    const pending = current.notifications?.[uid]?.[notificationId];
    if (!pending || pending.status !== 'pending' || pending.expiresAt <= now) return;
    pending.status = accept ? 'accepted' : 'declined';
    pending.respondedAt = now;
    current.notifications[notification.senderUid] ||= {};
    current.notifications[notification.senderUid][`location_response_${notificationId}`] = {
      type: 'location_response', senderUid: uid, tripId, orgId, timestamp: now,
      status: accept ? 'accepted' : 'declined', name: 'Participant',
      title: accept ? 'Location Request Accepted' : 'Location Request Declined',
      message: accept ? 'Location is shared with you for 15 minutes.' : 'The participant declined your request.',
    };
    if (accept) {
      current.location_permissions ||= {};
      current.location_permissions[uid] ||= {};
      current.location_permissions[uid][notification.senderUid] = { acceptedAt: now, expiresAt: now + 15 * 60 * 1000, requestId: notificationId };
    }
    return current;
  });
  if (!result.committed) throw new HttpsError('failed-precondition', 'This request was already handled.');
  return { status: accept ? 'accepted' : 'declined', expiresAt: accept ? now + 15 * 60 * 1000 : null };
}
module.exports = { getVisibleTripData, requestParticipantLocation, respondToLocationRequest, sanitizeMessage, directory };
