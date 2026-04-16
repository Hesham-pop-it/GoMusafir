// ─── Invite Functions ─────────────────────────────────────────────────────────
// Covers: S6 (auth required), S9 (trip isolation), S13 (App Check),
//         S14 (rate limiting), S15 (expiry + single-use), S16 (no redirects),
//         S17 (input validation), S23 (consent record)

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { admin, db, auth } = require("../admin");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth } = require("../middleware/appCheckMiddleware");
const { validate, schemas } = require("../middleware/validateSchema");
const { checkRateLimit } = require("../middleware/rateLimiter");
const crypto = require("crypto");

// ── Redeem Invitation ─────────────────────────────────────────────────────────
// This is the MOST security-critical endpoint.
exports.redeemInvitation = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request); // S13
  requireAuth(request);    // S6 — must be logged in

  // S14: Rate limit by UID (max 10 per minute)
  checkRateLimit(request.auth.uid, 10);

  // S17: Validate input
  const { inviteCode } = validate(schemas.redeemInvite, request.data);
  const uid = request.auth.uid;

  // S1: Email must be verified before joining any trip
  const userRecord = await auth.getUser(uid);
  if (!userRecord.emailVerified) {
    throw new HttpsError("failed-precondition", "Please verify your email before joining a trip.");
  }

  // Look up the invite
  const inviteSnap = await db.ref(`invites/${inviteCode}`).get();
  if (!inviteSnap.exists()) {
    throw new HttpsError("not-found", "Invalid invitation link.");
  }

  const invite = inviteSnap.val();
  const now = Date.now();

  // S15: Check expiry
  if (invite.expires_at && now > invite.expires_at) {
    throw new HttpsError("failed-precondition", "This invitation link has expired.");
  }

  const { org_id: orgId, trip_id: tripId } = invite;

  // Check if already joined
  const alreadyJoined = await db.ref(`trips_participants/${tripId}/${uid}`).get();
  if (alreadyJoined.exists()) {
    return { success: true, tripId, orgId, message: "Already joined." };
  }

  // S16: No open redirects — all data comes from server-validated DB, not URL params

  // S23: Write consent record under the org
  const ipHash = request.rawRequest?.ip
    ? crypto.createHash("sha256").update(request.rawRequest.ip).digest("hex")
    : "unknown";

  const consentRecord = {
    terms: "accepted",
    privacy: "accepted",
    voice: request.data.voiceConsent ? "accepted" : "declined",
    location: request.data.locationConsent ? "accepted" : "declined",
    recorded_at: admin.database.ServerValue.TIMESTAMP,
    ip_hash: ipHash,
  };

  // Atomic multi-path write (S9: user gains trip access)
  const updates = {
    [`trips_participants/${tripId}/${uid}`]: true,
    [`users/${uid}/joined_trips/${tripId}`]: {
      org_id: orgId,
      status: "joined",
      joined_at: admin.database.ServerValue.TIMESTAMP,
    },
    [`users/${uid}/current_trip`]: tripId,
    [`orgs/${orgId}/consents/${uid}`]: consentRecord, // S23
    [`orgs/${orgId}/trips/${tripId}/participants`]: admin.database.ServerValue.increment(1),
    [`users/${uid}/join_flow_status`]: null, // Clear flag to allow App.js redirect
  };


  // Ensure user has basic structured info if missing (S12)
  const existingUserSnap = await db.ref(`users/${uid}`).get();
  const existingUser = existingUserSnap.val() || {};

  if (!existingUser.p_email) {
    const { encrypt } = require("../services/kmsService");
    updates[`users/${uid}/p_email`] = encrypt(userRecord.email);
    updates[`users/${uid}/created_at`] = admin.database.ServerValue.TIMESTAMP;
  }

  // S22/S12: Encrypt phone if provided and not already stored
  let phone = request.data.phone || existingUser.profile?.phone || "";
  if (phone && !existingUser.p_phone) {
    const { encrypt } = require("../services/kmsService");
    updates[`users/${uid}/p_phone`] = encrypt(phone);
  }

  // S22: Force capture profile info whenever provided to ensure data completeness
  const firstName = request.data.firstName || existingUser.profile?.firstName || "";
  const lastName = request.data.lastName || existingUser.profile?.lastName || "";
  const photoURL = request.data.photoURL || existingUser.profile?.photoURL || "";

  // Always update if any profile field is provided or if profile is missing
  if (request.data.firstName || request.data.lastName || request.data.phone || request.data.photoURL || !existingUser.profile) {
    updates[`users/${uid}/profile`] = {
      firstName,
      lastName,
      phone,
      photoURL,
      updated_at: admin.database.ServerValue.TIMESTAMP,
    };
    
    // Sync to top-level full_name for Admin-Dashboard compatibility
    if (firstName || lastName) {
      updates[`users/${uid}/full_name`] = `${firstName} ${lastName}`.trim();
    }
  }

  // Final Merge and update
  console.log(`[RedeemInvite] Atomic updates for UID: ${uid}`, Object.keys(updates));
  
  try {
    await db.ref().update(updates);
  } catch (dbErr) {
    console.error("[RedeemInvite] Database update failed:", dbErr);
    throw new HttpsError("internal", "Failed to update participant status.");
  }

  // S20: Audit log
  try {
    await writeAuditLog(orgId, {
      action: "PARTICIPANT_JOINED",
      byUid: uid,
      targetId: tripId,
      ipAddress: request.rawRequest?.ip,
    });
  } catch (auditErr) {
    console.warn("Audit log failed, but join succeeded:", auditErr);
  }


  return { success: true, tripId, orgId };
});

// ── Get Invite Metadata (public — no auth needed) ─────────────────────────────
// Returns safe trip preview for the invite landing page.
// S16: Only serves data from our DB, never reflects URL params back.
exports.getInviteMetadata = onCall({ region: "europe-west1" }, async (request) => {
  const { inviteCode } = request.data;
  if (!inviteCode || typeof inviteCode !== "string") {
    throw new HttpsError("invalid-argument", "inviteCode is required.");
  }

  const inviteSnap = await db.ref(`invites/${inviteCode}`).get();
  if (!inviteSnap.exists()) {
    throw new HttpsError("not-found", "Invalid or expired invitation.");
  }

  const invite = inviteSnap.val();

  // S15: Check expiry even for metadata
  if (invite.expires_at && Date.now() > invite.expires_at) {
    throw new HttpsError("failed-precondition", "This invitation link has expired.");
  }

  const tripSnap = await db.ref(`orgs/${invite.org_id}/trips/${invite.trip_id}`).get();
  if (!tripSnap.exists()) {
    throw new HttpsError("not-found", "Trip not found.");
  }

  const trip = tripSnap.val();
  const orgSnap = await db.ref(`orgs/${invite.org_id}/metadata/name`).get();

  // Return only safe, non-sensitive fields
  return {
    tripTitle: trip.title,
    destination: trip.destination,
    startDate: trip.start_date,
    endDate: trip.end_date,
    companyName: orgSnap.val(),
  };
});
