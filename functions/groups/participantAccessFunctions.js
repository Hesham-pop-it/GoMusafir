const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { admin, db } = require('../admin');
const { tripExpiry, refreshAccess, requireFreshIdentity } = require('../services/participantAccessService');

exports.getAppAccess = onCall({ region: 'europe-west1' }, async request => {
  await requireFreshIdentity(request);
  return { ...await refreshAccess(request.auth.uid), server_now: Date.now() };
});

async function syncTrip(orgId, tripId, previousParticipants = {}) {
  const participants = (await db.ref(`trips_participants/${tripId}`).get()).val() || {};
  const uids = new Set([...Object.keys(previousParticipants), ...Object.keys(participants)]);
  for (const uid of uids) {
    try { await refreshAccess(uid); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  }
  const trip = (await db.ref(`orgs/${orgId}/trips/${tripId}`).get()).val();
  if (!tripExpiry(trip)) {
    await require('../services/tripVoiceService').stopSession(orgId, tripId, 'trip_ended');
    if (trip) await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).update({ isChannelStarted: false, activeSpeaker: null });
    if (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
      const { RoomServiceClient } = require('livekit-server-sdk');
      const client = new RoomServiceClient(process.env.LIVEKIT_URL.replace(/^ws/, 'http'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
      try { await client.deleteRoom(tripId); }
      catch (error) { if (error.status !== 404 && error.code !== 'not_found') throw error; }
    }
  }
}

exports.onTripAccessChanged = onValueWritten({
  ref: '/orgs/{orgId}/trips/{tripId}', region: 'europe-west1', retry: true,
}, async event => {
  const before = event.data.before.val();
  const after = event.data.after.val();
  if (before?.status === after?.status && before?.end_date === after?.end_date) return;
  const expiryRef = db.ref(`trip_expirations/${event.params.tripId}`);
  if (after?.status === 'active' && Number.isFinite(after.end_date) && after.end_date > 0) {
    await expiryRef.set({ org_id: event.params.orgId, expires_at: after.end_date });
  } else {
    await expiryRef.remove();
  }
  await syncTrip(event.params.orgId, event.params.tripId);
});

exports.onMembershipAccessChanged = onValueWritten({
  ref: '/trips_participants/{tripId}/{uid}', region: 'europe-west1', retry: true,
}, async event => {
  try { await refreshAccess(event.params.uid); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
});

exports.onStaffAccessChanged = onValueWritten({
  ref: '/orgs/{orgId}/staff/{uid}', region: 'europe-west1', retry: true,
}, async event => {
  try { await refreshAccess(event.params.uid); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
});

// Rules enforce the timestamp immediately; this job handles refresh-token
// revocation and disconnecting voice rooms, including idle/background sessions.
exports.expireParticipantAccess = onSchedule({ schedule: 'every 1 minutes', region: 'europe-west1', retryCount: 3 }, async () => {
  const expired = await db.ref('app_access').orderByChild('expires_at').startAt(1).endAt(Date.now()).get();
  const pending = await db.ref('app_access').orderByChild('revocation_pending').equalTo(true).get();
  for (const uid of new Set([...Object.keys(expired.val() || {}), ...Object.keys(pending.val() || {})])) {
    try { await refreshAccess(uid); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  }
  const dueTrips = (await db.ref('trip_expirations').orderByChild('expires_at').startAt(1).endAt(Date.now()).get()).val() || {};
  for (const [tripId, entry] of Object.entries(dueTrips)) {
    const orgId = entry.org_id;
    // Do not overwrite a concurrently extended or manually closed trip.
    const result = await db.ref(`orgs/${orgId}/trips/${tripId}`).transaction(current => {
      if (!current || current.status !== 'active' || tripExpiry(current)) return;
      return { ...current, status: 'ended' };
    });
    if (result.committed) await syncTrip(orgId, tripId);
    await db.ref(`trip_expirations/${tripId}`).transaction(current => {
      if (!current || current.expires_at > Date.now()) return;
      return null;
    });
  }
});

// Run once during rollout to populate access for existing accounts. Only an
// organization admin may backfill their own staff/participants.
exports.backfillParticipantAccess = onCall({ region: 'europe-west1', timeoutSeconds: 540 }, async request => {
  await requireFreshIdentity(request);
  const orgId = request.auth.token.orgId;
  if (!orgId || (await db.ref(`orgs/${orgId}/staff/${request.auth.uid}`).get()).val() !== 'admin') {
    throw new HttpsError('permission-denied', 'Organization admin required.');
  }
  const org = (await db.ref(`orgs/${orgId}`).get()).val() || {};
  const uids = new Set(Object.keys(org.staff || {}));
  for (const tripId of Object.keys(org.trips || {})) {
    const trip = org.trips[tripId];
    if (trip.status === 'active' && Number.isFinite(trip.end_date)) {
      await db.ref(`trip_expirations/${tripId}`).set({ org_id: orgId, expires_at: trip.end_date });
    }
    const participants = (await db.ref(`trips_participants/${tripId}`).get()).val() || {};
    Object.keys(participants).forEach(uid => uids.add(uid));
  }
  for (const uid of uids) await refreshAccess(uid);
  return { processed: uids.size };
});
module.exports.syncTrip = syncTrip;

// Returning participants with no active trip cannot use ordinary password
// sign-in. A valid invitation plus email proof creates an enrollment-only
// identity; redeemInvitation still has to grant membership before app use.
const crypto = require('crypto');
async function validEnrollmentInvite(inviteCode) {
  if (typeof inviteCode !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(inviteCode)) {
    throw new HttpsError('invalid-argument', 'A valid invitation is required.');
  }
  const invite = (await db.ref(`invites/${inviteCode}`).get()).val();
  if (!invite || (invite.expires_at && invite.expires_at <= Date.now())) {
    throw new HttpsError('permission-denied', 'This invitation has expired.');
  }
  const trip = (await db.ref(`orgs/${invite.org_id}/trips/${invite.trip_id}`).get()).val();
  if (!tripExpiry(trip)) throw new HttpsError('permission-denied', 'This trip has ended.');
  return invite;
}
exports.beginParticipantEnrollment = onCall({ region: 'europe-west1', secrets: ['SENDGRID_API_KEY'] }, async request => {
  const { email, inviteCode } = request.data || {};
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }
  await validEnrollmentInvite(inviteCode);
  const normalized = email.trim().toLowerCase();
  const key = crypto.createHash('sha256').update(normalized).digest('hex');
  const challengeId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const rate = await db.ref(`enrollment_rate/${key}`).transaction(last => {
    if (last && now - last < 60000) return;
    return now;
  });
  if (!rate.committed) throw new HttpsError('resource-exhausted', 'Please wait a minute before requesting another code.');
  let user;
  try { user = await admin.auth().getUserByEmail(normalized); }
  catch (error) {
    if (error.code === 'auth/user-not-found') return { challengeId };
    throw error;
  }
  if (user.disabled || ['admin', 'co-host', 'manager'].includes(user.customClaims?.role)) {
    throw new HttpsError('permission-denied', 'This account cannot join as a participant.');
  }
  const code = crypto.randomInt(100000, 1000000).toString();
  const digest = crypto.createHash('sha256').update(`${challengeId}:${code}`).digest('hex');
  await db.ref(`enrollment_challenges/${challengeId}`).set({ uid: user.uid, inviteCode, digest,
    expires_at: now + 10 * 60 * 1000, attempts: 0 });
  await require('../services/emailService').sendEmail({
    to: normalized,
    subject: 'Your GoMusāfir trip joining code',
    html: `
      <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
        <h2 style="color: #B99A4A;">GoMusāfir Verification</h2>
        <p>Use this code to join your next trip:</p>
        <h1 style="background: #1A1814; color: #FFF; padding: 20px; border-radius: 8px; font-size: 36px; letter-spacing: 4px;">${code}</h1>
        <p>This code will expire in 10 minutes.</p>
      </div>
    `,
  });
  return { challengeId };
});
exports.completeParticipantEnrollment = onCall({ region: 'europe-west1' }, async request => {
  const { challengeId, code } = request.data || {};
  if (!/^[a-f0-9]{64}$/.test(challengeId || '') || !/^\d{6}$/.test(code || '')) {
    throw new HttpsError('invalid-argument', 'Enter the six-digit code.');
  }
  const digest = crypto.createHash('sha256').update(`${challengeId}:${code}`).digest('hex');
  const result = await db.ref(`enrollment_challenges/${challengeId}`).transaction(current => {
    // A cold RTDB cache supplies null even when the challenge exists remotely.
    // Propose the unchanged null so Firebase checks the server and retries;
    // returning undefined here aborts before the stored code can be checked.
    if (current === null) return null;
    if (current.used || current.expires_at <= Date.now() || current.attempts >= 5) return;
    return { ...current, attempts: current.attempts + 1, used: current.digest === digest };
  });
  const challenge = result.snapshot.val();
  if (!result.committed || !challenge?.used) throw new HttpsError('permission-denied', 'The code is invalid or expired.');
  const invite = await validEnrollmentInvite(challenge.inviteCode);
  const user = await admin.auth().getUser(challenge.uid);
  if (user.disabled) throw new HttpsError('permission-denied', 'Account disabled.');
  await admin.auth().updateUser(user.uid, { emailVerified: true });
  await db.ref(`users/${user.uid}/join_flow_status`).set({ isJoining: true, invitationCode: challenge.inviteCode });
  const customToken = await admin.auth().createCustomToken(user.uid, { enrollment_trip: invite.trip_id });
  return { customToken };
});
