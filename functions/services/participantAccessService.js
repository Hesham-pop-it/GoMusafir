const { admin, db, auth } = require('../admin');
const { HttpsError } = require('firebase-functions/v2/https');
const STAFF_ROLES = ['admin', 'co-host', 'manager'];

// Trips are eligible from enrollment until their exclusive end timestamp.
// Missing/malformed dates and all non-active statuses fail closed.
function tripExpiry(trip, now = Date.now()) {
  return trip?.status === 'active' && Number.isFinite(trip.end_date) && trip.end_date > now
    ? trip.end_date : 0;
}

async function calculateAccess(uid, now = Date.now()) {
  const [userSnap, record] = await Promise.all([db.ref(`users/${uid}`).get(), auth.getUser(uid)]);
  const user = userSnap.val() || {};
  const orgId = record.customClaims?.orgId;
  let staff = false;
  if (orgId && STAFF_ROLES.includes(record.customClaims?.role)) {
    const staffSnap = await db.ref(`orgs/${orgId}/staff/${uid}`).get();
    staff = STAFF_ROLES.includes(staffSnap.val());
  }
  // Staff login/app access never depends on participant trip records.
  if (staff) return { staff: true, trips: {}, current_trip: user.current_trip || null,
    participant: false, expires_at: 0, record };
  const trips = {};
  await Promise.all(Object.entries(user.joined_trips || {}).map(async ([tripId, membership]) => {
    const tripOrgId = membership?.org_id || membership?.orgId;
    if (!tripOrgId) return;
    const [participant, trip] = await Promise.all([
      db.ref(`trips_participants/${tripId}/${uid}`).get(),
      db.ref(`orgs/${tripOrgId}/trips/${tripId}`).get(),
    ]);
    const expiry = tripExpiry(trip.val(), now);
    if (participant.val() && expiry) trips[tripId] = expiry;
  }));
  return { staff, trips, current_trip: user.current_trip || null, participant: user.account_type === 'participant' || Object.keys(user.joined_trips || {}).length > 0, expires_at: Math.max(0, ...Object.values(trips)), record };
}

// The RTDB record is server-owned. Firestore is an authorization mirror used
// by Storage rules, which cannot read RTDB. Neither contains profile/PII data.
async function refreshAccess(uid) {
  const accessRef = db.ref(`app_access/${uid}`);
  const firestore = admin.firestore();
  const mirrorRef = firestore.doc(`app_access/${uid}`);
  // Read the mirror before calculating eligibility. Firestore retries this
  // transaction if another refresh wins, so an older grant cannot overwrite a
  // newer revocation. A monotonically increasing version orders RTDB writes.
  const value = await firestore.runTransaction(async transaction => {
    const mirror = await transaction.get(mirrorRef);
    const old = mirror.data() || (await accessRef.get()).val() || {};
    const access = await calculateAccess(uid);
    const lostAccess = !access.staff && !access.expires_at &&
      (old.staff || old.expires_at > 0 || (!old.participant && access.participant));
    const revokedBefore = lostAccess
      ? Math.max(old.revoked_before || 0, Math.floor(Date.now() / 1000) + 1)
      : old.revoked_before || 0;
    const next = { staff: access.staff, participant: access.participant || old.participant === true,
      trips: access.trips, current_trip: access.staff ? access.current_trip : (access.trips[access.current_trip] ? access.current_trip : Object.keys(access.trips)[0] || null),
      expires_at: access.expires_at, revoked_before: revokedBefore,
      revocation_pending: !access.staff && (lostAccess || old.revocation_pending === true), version: (old.version || 0) + 1 };
    transaction.set(mirrorRef, next);
    return next;
  });
  await accessRef.transaction(current => {
    if ((current?.version || 0) >= value.version) return;
    return value;
  });
  if (!value.staff && value.current_trip) {
    await db.ref(`users/${uid}/current_trip`).transaction(current => {
      if (current && value.trips[current]) return;
      return value.current_trip;
    });
  }
  if (value.revocation_pending) {
    await auth.revokeRefreshTokens(uid);
    await db.ref(`users/${uid}/active_device_id`).remove();
    await firestore.runTransaction(async transaction => {
      const current = (await transaction.get(mirrorRef)).data();
      if (current?.version === value.version) transaction.set(mirrorRef, { ...current, revocation_pending: false });
    });
    await accessRef.transaction(current => {
      if (current?.version !== value.version) return;
      return { ...current, revocation_pending: false };
    });
    value.revocation_pending = false;
  }
  return (await accessRef.get()).val() || value;
}

async function requireFreshIdentity(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');
  const uid = request.auth.uid;
  const [record, access] = await Promise.all([auth.getUser(uid), db.ref(`app_access/${uid}`).get()]);
  const cutoff = Math.max(Math.floor(new Date(record.tokensValidAfterTime || 0).getTime() / 1000),
    access.val()?.revoked_before || 0);
  if (record.disabled || !Number.isFinite(request.auth.token.auth_time) || request.auth.token.auth_time < cutoff) {
    throw new HttpsError('unauthenticated', 'Your session has ended. Please sign in again.');
  }
}

async function requireAppAccess(request) {
  await requireFreshIdentity(request);
  const access = await calculateAccess(request.auth.uid);
  if (!access.staff && !access.expires_at) {
    throw new HttpsError('permission-denied', 'Join a valid trip before using the app.');
  }
  return access;
}

async function requireTripAccess(request, tripId) {
  const access = await requireAppAccess(request);
  const orgId = (await db.ref(`trips_orgs/${tripId}`).get()).val();
  const trip = (await db.ref(`orgs/${orgId}/trips/${tripId}`).get()).val();
  if (!tripExpiry(trip)) throw new HttpsError('permission-denied', 'This trip has ended.');
  const staff = orgId && STAFF_ROLES.includes((await db.ref(`orgs/${orgId}/staff/${request.auth.uid}`).get()).val());
  if (!staff && !access.trips[tripId]) throw new HttpsError('permission-denied', 'Not a participant in this trip.');
  return { orgId, trip, staff };
}

module.exports = { tripExpiry, calculateAccess, refreshAccess, requireFreshIdentity, requireAppAccess, requireTripAccess };
