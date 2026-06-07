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

  // --- Seat Capacity Check ---
  const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}`).get();
  if (!tripSnap.exists()) {
    throw new HttpsError("not-found", "Trip data not found.");
  }
  const trip = tripSnap.val();
  const currentParticipants = trip.participants || 0;
  const totalSeats = trip.total_seats || 15; // Fallback to 15 if not set

  if (currentParticipants >= totalSeats) {
    throw new HttpsError("resource-exhausted", `This trip is full. Maximum capacity is ${totalSeats} participants.`);
  }
  // --- End Capacity Check ---

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

  // S22: Force capture profile info and ENCRYPT IT (S12)
  const firstName = request.data.firstName || existingUser.profile?.firstName || "";
  const lastName = request.data.lastName || existingUser.profile?.lastName || "";
  const photoURL = request.data.photoURL || existingUser.profile?.photoURL || "";

  if (firstName || lastName || phone || photoURL || !existingUser.p_profile) {
    const { encrypt } = require("../services/kmsService");
    const profileBlob = JSON.stringify({
      firstName,
      lastName,
      phone,
      photoURL,
      email: userRecord.email
    });
    
    // Store as encrypted blob
    updates[`users/${uid}/p_profile`] = encrypt(profileBlob);
    
    // Also update top-level full_name but MASKED for basic UI identification without decryption
    if (firstName || lastName) {
        const maskedName = `${firstName.charAt(0)}*** ${lastName ? lastName.charAt(0) : ""}***`.trim();
        updates[`users/${uid}/full_name`] = maskedName;
    }
  }

  // Final Merge and update
  
  try {
    await db.ref().update(updates);
  } catch (dbErr) {
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
  }


  return { success: true, tripId, orgId };
});

// ── Get Team Invite Metadata (public — no auth needed) ─────────────────────────
exports.getTeamInviteMetadata = onCall({ region: "europe-west1" }, async (request) => {
  const { token } = validate(schemas.getTeamInviteMetadata, request.data);

  const inviteSnap = await db.ref(`org_invites/${token}`).get();
  if (!inviteSnap.exists()) {
    throw new HttpsError("not-found", "Invalid or expired invitation.");
  }

  const invite = inviteSnap.val();
  if (invite.expiresAt && Date.now() > invite.expiresAt) {
    throw new HttpsError("failed-precondition", "This invitation link has expired.");
  }

  const orgSnap = await db.ref(`orgs/${invite.orgId}/metadata/name`).get();
  
  return {
    role: invite.role,
    companyName: orgSnap.val(),
    orgId: invite.orgId,
    email: invite.email
  };
});

// ── Redeem Team Invitation ───────────────────────────────────────────────────
exports.redeemTeamInvitation = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const { token, firstName, lastName, fullName, userName, name, displayName, phoneCode, phoneNumber, country, photoURL } = validate(schemas.redeemTeamInvite, request.data);
  const uid = request.auth.uid;

  // S1: Email must be verified
  const userRecord = await auth.getUser(uid);
  if (!userRecord.emailVerified) {
    throw new HttpsError("failed-precondition", "Please verify your email before joining as a team member.");
  }

  const inviteSnap = await db.ref(`org_invites/${token}`).get();
  if (!inviteSnap.exists()) {
    throw new HttpsError("not-found", "Invalid invitation link.");
  }

  const invite = inviteSnap.val();
  if (invite.expiresAt && Date.now() > invite.expiresAt) {
    throw new HttpsError("failed-precondition", "This invitation link has expired.");
  }

  const { orgId, role } = invite;

  // 1. Set Custom User Claims (S6)
  await auth.setCustomUserClaims(uid, { role, orgId });

  // 2. Perform atomic updates (S8 Isolation)
  const updates = {
    [`orgs/${orgId}/staff/${uid}`]: role,
    [`users/${uid}/staff_org_id`]: orgId,
    [`org_invites/${token}`]: null, // Single-use (S15)
  };

  // S35: Ensure basic profile exists so they don't show as "Unknown User"
  // Fetch existing user record in Realtime Database to prevent overwriting their real name
  const userDbSnap = await db.ref(`users/${uid}`).get();
  const existingUser = userDbSnap.exists() ? userDbSnap.val() : null;

  console.log("User record:", userRecord);
  console.log("Existing user:", existingUser);
  
  let resolvedFirstName = firstName || "";
  let resolvedLastName = lastName || "";
  let resolvedFullName = fullName || userName || name || displayName || "";

  if (!resolvedFullName && (resolvedFirstName || resolvedLastName)) {
    resolvedFullName = `${resolvedFirstName} ${resolvedLastName}`.trim();
  }
  if (resolvedFullName && (!resolvedFirstName && !resolvedLastName)) {
    const parts = resolvedFullName.split(" ");
    resolvedFirstName = parts[0] || "";
    resolvedLastName = parts.slice(1).join(" ") || "";
  }

  // Update Auth displayName and photoURL if we got them from the input but they're not set in Auth
  const authUpdates = {};
  if (resolvedFullName && !userRecord.displayName) {
    authUpdates.displayName = resolvedFullName;
  }
  if (photoURL && !userRecord.photoURL) {
    authUpdates.photoURL = photoURL;
  }

  if (Object.keys(authUpdates).length > 0) {
    try {
      await auth.updateUser(uid, authUpdates);
    } catch (authErr) {
      console.warn("Failed to update Auth user details:", authErr);
    }
  }

  // S12: Encrypt email and phone
  const { encrypt } = require("../services/kmsService");
  
  if (!existingUser || !existingUser.p_email) {
    updates[`users/${uid}/p_email`] = encrypt(userRecord.email);
  }
  
  const phone = phoneNumber ? `${phoneCode || ""}${phoneNumber}` : "";
  if (phone && (!existingUser || !existingUser.p_phone)) {
    updates[`users/${uid}/p_phone`] = encrypt(phone);
  }
  
  if (country && (!existingUser || !existingUser.country)) {
    updates[`users/${uid}/country`] = country;
  }
  
  if (!existingUser || !existingUser.created_at) {
    updates[`users/${uid}/created_at`] = admin.database.ServerValue.TIMESTAMP;
  }

  if (resolvedFirstName) {
    updates[`users/${uid}/first_name`] = resolvedFirstName;
  }
  if (resolvedLastName) {
    updates[`users/${uid}/last_name`] = resolvedLastName;
  }
  if (photoURL) {
    updates[`users/${uid}/photo_url`] = photoURL;
  }

  const nameToUse = resolvedFullName || userRecord.displayName || (existingUser && existingUser.full_name) || "";

  if (nameToUse) {
    updates[`users/${uid}/full_name`] = nameToUse;
    
    // Only create/update profile if they don't already have one OR if new name/photo inputs are provided
    if (!existingUser || !existingUser.profile || resolvedFirstName || resolvedLastName || photoURL) {
      const parts = nameToUse.split(" ");
      const fName = resolvedFirstName || parts[0] || "";
      const lName = resolvedLastName || parts.slice(1).join(" ") || "";
      const resolvedPhotoURL = photoURL || userRecord.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(nameToUse[0] || 'U')}&background=B99A4A&color=fff`;
      updates[`users/${uid}/profile`] = {
          firstName: fName,
          lastName: lName,
          photoURL: resolvedPhotoURL,
          updated_at: Date.now()
      };
    }
  } else {
    // Fall back to "Team Member" ONLY if they have no name in input, Auth AND no record in the database
    updates[`users/${uid}/full_name`] = "Team Member";
  }

  await db.ref().update(updates);

  // 3. Audit Logging (S20)
  await writeAuditLog(orgId, {
    action: "TEAM_MEMBER_JOINED",
    byUid: uid,
    extra: { role, inviteToken: token }
  });

  return { success: true, orgId, role };
});


// ── Get Invite Metadata (public — no auth needed) ─────────────────────────────
// Returns safe trip preview for the invite landing page.
// S16: Only serves data from our DB, never reflects URL params back.
exports.getInviteMetadata = onCall({ region: "europe-west1" }, async (request) => {
  const { inviteCode, email } = request.data;
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

  const currentParticipants = trip.participants || 0;
  const totalSeats = trip.total_seats || 15;

  let alreadyJoined = false;
  
  // Priority 1: Check by authenticated UID
  if (request.auth) {
    const joinedSnap = await db.ref(`trips_participants/${invite.trip_id}/${request.auth.uid}`).get();
    alreadyJoined = joinedSnap.exists();
  } 
  // Priority 2: Check by provided email (if not already found by UID)
  else if (email && typeof email === "string") {
    try {
      const userRecord = await auth.getUserByEmail(email.trim().toLowerCase());
      const joinedSnap = await db.ref(`trips_participants/${invite.trip_id}/${userRecord.uid}`).get();
      alreadyJoined = joinedSnap.exists();
    } catch (e) {
      // User might not exist or email not found - that's fine
    }
  }

  // Return only safe, non-sensitive fields
  return {
    tripTitle: trip.title,
    destination: trip.destination,
    startDate: trip.start_date,
    endDate: trip.end_date,
    companyName: orgSnap.val(),
    totalSeats: totalSeats,
    filledSeats: currentParticipants,
    alreadyJoined: alreadyJoined,
    isFull: currentParticipants >= totalSeats
  };
});
