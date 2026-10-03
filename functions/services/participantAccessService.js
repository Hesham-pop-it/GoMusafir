const { db, auth } = require('../admin');
const { guardedTransaction } = require('./guardedTransaction');
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

// Access state is server-owned and lives entirely in Realtime Database.
async function refreshAccess(uid) {
  const accessRef = db.ref(`app_access/${uid}`);
  let value;
  // Recalculate after a concurrent refresh; never publish eligibility computed
  // against an older access version over a newer revocation or membership grant.
  for (let attempt = 0; attempt < 8; attempt++) {
    const old = (await accessRef.get()).val() || {};
    const access = await calculateAccess(uid);
    const result = await guardedTransaction(accessRef, current => {
      current = current || {};
      if ((current.version || 0) !== (old.version || 0)) return;
      const lostAccess = !access.staff && !access.expires_at &&
        (current.staff || current.expires_at > 0 || (!current.participant && access.participant));
      return { staff: access.staff, participant: access.participant || current.participant === true,
        trips: access.trips, current_trip: access.staff ? access.current_trip : (access.trips[access.current_trip] ? access.current_trip : Object.keys(access.trips)[0] || null),
        expires_at: access.expires_at,
        revoked_before: lostAccess
          ? Math.max(current.revoked_before || 0, Math.floor(Date.now() / 1000) + 1)
          : current.revoked_before || 0,
        revocation_pending: !access.staff && (lostAccess || current.revocation_pending === true),
        version: (current.version || 0) + 1 };
    });
    if (result.committed) {
      value = result.snapshot.val();
      break;
    }
  }
  if (!value) throw new HttpsError('aborted', 'Your trip access is updating. Please retry.');
  if (!value.staff && value.current_trip) {
    await guardedTransaction(db.ref(`users/${uid}/current_trip`), current => {
      if (current && value.trips[current]) return;
      return value.current_trip;
    });
  }
  if (value.revocation_pending) {
    await auth.revokeRefreshTokens(uid);
    await db.ref(`users/${uid}/active_device_id`).remove();
    await guardedTransaction(accessRef, current => {
      if (current?.version !== value.version) return;
      return { ...current, revocation_pending: false };
    });
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
