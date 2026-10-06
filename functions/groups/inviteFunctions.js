const { tripExpiry, refreshAccess } = require('../services/participantAccessService');
const { reserveParticipantJoinSeat } = require('../services/participantJoinSeat');
// ─── Invite Functions ─────────────────────────────────────────────────────────
// Covers: S6 (auth required), S9 (trip isolation), S13 (App Check),
//         S14 (rate limiting), S15 (expiry + single-use), S16 (no redirects),
//         S17 (input validation), S23 (consent record)

const { HttpsError } = require("firebase-functions/v2/https");
const { onCall } = require("../middleware/participantAccessMiddleware");
const { admin, db, auth } = require("../admin");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth } = require("../middleware/appCheckMiddleware");
const { validate, schemas } = require("../middleware/validateSchema");
const { checkRateLimit } = require("../middleware/rateLimiter");
const crypto = require("crypto");

// ── Redeem Invitation ─────────────────────────────────────────────────────────
// This is the MOST security-critical endpoint.
exports.redeemInvitation = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  verifyAppCheck(request); // S13
  requireAuth(request);    // S6 — must be logged in

  // S14: Rate limit by UID (max 10 per minute)
  checkRateLimit(request.auth.uid, 10);

  // S17: Validate input
  const {
    inviteCode,
    firstName,
    lastName,
    phone,
    photoURL,
    voiceConsent,
    locationConsent
  } = validate(schemas.redeemInvite, request.data);
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

  // An invite's TTL is not the trip's lifetime. Reject closed/expired trips
  // even for previously joined accounts before returning idempotent success.
  const eligibilityTrip = (await db.ref(`orgs/${orgId}/trips/${tripId}`).get()).val();
  if (!tripExpiry(eligibilityTrip)) {
    throw new HttpsError('permission-denied', 'This trip has ended or is invalid.');
  }

  // Check if already joined
  const alreadyJoined = await db.ref(`trips_participants/${tripId}/${uid}`).get();


  // S16: No open redirects — all data comes from server-validated DB, not URL params

  // S23: Write consent record under the org
  const ipHash = request.rawRequest?.ip
    ? crypto.createHash("sha256").update(request.rawRequest.ip).digest("hex")
    : "unknown";

  const consentRecord = {
    terms: "accepted",
    privacy: "accepted",
    voice: voiceConsent ? "accepted" : "declined",
    location: locationConsent ? "accepted" : "declined",
    recorded_at: admin.database.ServerValue.TIMESTAMP,
    ip_hash: ipHash,
  };

  // Atomic multi-path write (S9: user gains trip access)
  const updates = {
    [`users/${uid}/account_type`]: 'participant',
    [`users/${uid}/mfa_pending`]: false,
    [`trips_participants/${tripId}/${uid}`]: true,
    [`users/${uid}/joined_trips/${tripId}`]: {
      org_id: orgId,
      status: "joined",
      joined_at: admin.database.ServerValue.TIMESTAMP,
    },
    [`users/${uid}/current_trip`]: tripId,
    [`orgs/${orgId}/consents/${uid}`]: consentRecord, // S23
    [`users/${uid}/join_flow_status`]: null, // Clear flag to allow App.js redirect
  };


  // Ensure user has basic structured info if missing (S12)
  const existingUserSnap = await db.ref(`users/${uid}`).get();
  const existingUser = existingUserSnap.val() || {};
  let savedProfile = {};
  if (existingUser.p_profile) {
    try {
      savedProfile = JSON.parse(require('../services/kmsService').decrypt(existingUser.p_profile)) || {};
    } catch (_) { /* Fall back to the basic profile and Auth record. */ }
  }
  const basicProfile = existingUser.profile || {};
  const savedName = userRecord.displayName || (existingUser.full_name?.includes('*') ? '' : existingUser.full_name) || '';
  const nameParts = savedName.trim().split(/\s+/);

  if (!existingUser.p_email) {
    const { encrypt } = require("../services/kmsService");
    updates[`users/${uid}/p_email`] = encrypt(userRecord.email);
    updates[`users/${uid}/created_at`] = admin.database.ServerValue.TIMESTAMP;
  }

  // S22/S12: Encrypt phone if provided and not already stored
  let resolvedPhone = phone || basicProfile.phone || savedProfile.phone || existingUser.phone || "";
  if (resolvedPhone && !existingUser.p_phone) {
    const { encrypt } = require("../services/kmsService");
    updates[`users/${uid}/p_phone`] = encrypt(resolvedPhone);
  }

  // S22: Force capture profile info and ENCRYPT IT (S12)
  const resolvedFirstName = firstName || basicProfile.firstName || basicProfile.first_name || savedProfile.firstName || existingUser.first_name || nameParts[0] || "";
  const resolvedLastName = lastName || basicProfile.lastName || basicProfile.last_name || savedProfile.lastName || existingUser.last_name || nameParts.slice(1).join(' ') || "";
  const resolvedPhotoURL = photoURL || basicProfile.photoURL || basicProfile.photo_url || savedProfile.photoURL || existingUser.photo_url || userRecord.photoURL || "";

  if (resolvedFirstName || resolvedLastName || resolvedPhone || resolvedPhotoURL || !existingUser.p_profile) {
    const { encrypt } = require("../services/kmsService");
    const profileBlob = JSON.stringify({
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      phone: resolvedPhone,
      photoURL: resolvedPhotoURL,
      email: userRecord.email
    });
    
    // Store as encrypted blob
    updates[`users/${uid}/p_profile`] = encrypt(profileBlob);

    // Also store unencrypted profile & photo fields for basic UI visibility / avatar rendering
    const unencryptedProfile = {
      ...basicProfile,
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      phone: resolvedPhone,
      photoURL: resolvedPhotoURL,
      email: userRecord.email,
      updated_at: Date.now()
    };
    updates[`users/${uid}/profile`] = unencryptedProfile;
    if (resolvedPhotoURL) {
      updates[`users/${uid}/photo_url`] = resolvedPhotoURL;
      updates[`users/${uid}/photo`] = resolvedPhotoURL;
      updates[`users/${uid}/image`] = resolvedPhotoURL;
      updates[`users/${uid}/profile_photo`] = resolvedPhotoURL;
    }
    
    // Also update top-level full_name but MASKED for basic UI identification without decryption
    if (resolvedFirstName || resolvedLastName) {
        const maskedName = `${resolvedFirstName.charAt(0)}*** ${resolvedLastName ? resolvedLastName.charAt(0) : ""}***`.trim();
        updates[`users/${uid}/full_name`] = maskedName;
    }

    // Update Firebase Auth user record if display name or photo URL are not already set
    const authUpdates = {};
    const newFullName = `${resolvedFirstName} ${resolvedLastName}`.trim();
    if (newFullName && !userRecord.displayName) {
      authUpdates.displayName = newFullName;
    }
    if (resolvedPhotoURL && !userRecord.photoURL) {
      authUpdates.photoURL = resolvedPhotoURL;
    }

    if (Object.keys(authUpdates).length > 0) {
      try {
        await auth.updateUser(uid, authUpdates);
      } catch (authErr) {
        console.warn("Failed to update Auth user details:", authErr);
      }
    }
  }

  // Final Merge and update
  
  if (alreadyJoined.exists()) {
    // Repair a legacy/partially completed join before publishing access.
    await db.ref().update({
      ...Object.fromEntries(Object.entries(updates).filter(([path]) =>
        path.startsWith(`users/${uid}/`) && path !== `users/${uid}/joined_trips/${tripId}`)),
      [`users/${uid}/joined_trips/${tripId}/org_id`]: orgId,
      [`users/${uid}/joined_trips/${tripId}/status`]: 'joined',
      [`users/${uid}/current_trip`]: tripId,
      [`users/${uid}/join_flow_status`]: null,
      [`users/${uid}/mfa_pending`]: false,
      [`users/${uid}/account_type`]: 'participant',
    });
    const access = await refreshAccess(uid);
    return { success: true, tripId, orgId, access, message: "Already joined." };
  }

  await reserveParticipantJoinSeat(orgId, tripId, uid);
  let access;
  try {
    // Publish account type and both membership indexes in the same write.
    // Access refreshes must never see a new participant without their trip.
    await db.ref().update(updates);
    access = await refreshAccess(uid);
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


  return { success: true, tripId, orgId, access };
});

// ── Get Team Invite Metadata (public — no auth needed) ─────────────────────────
exports.getTeamInviteMetadata = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  const { token } = validate(schemas.getTeamInviteMetadata, request.data);

  const inviteSnap = await db.ref(`org_invites/${token}`).get();
  if (!inviteSnap.exists()) {
    throw new HttpsError("not-found", "Invalid or expired invitation.");
  }

  const invite = inviteSnap.val();
  if (!invite.redeemedBy && invite.expiresAt && Date.now() > invite.expiresAt) {
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
exports.redeemTeamInvitation = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
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
  if (!invite.redeemedBy && invite.expiresAt && Date.now() > invite.expiresAt) {
    throw new HttpsError("failed-precondition", "This invitation link has expired.");
  }

  const { orgId, role } = invite;

  if (!invite.email || invite.email.trim().toLowerCase() !== userRecord.email?.trim().toLowerCase()) {
    throw new HttpsError('permission-denied', 'Sign in with the email address this invitation was sent to.');
  }
  if (invite.redeemedBy && invite.redeemedBy !== uid) {
    throw new HttpsError('permission-denied', 'This invitation has already been accepted.');
  }
  const userDbSnap = await db.ref(`users/${uid}`).get();
  const existingUser = userDbSnap.exists() ? userDbSnap.val() : null;
  if ((existingUser?.staff_org_id && existingUser.staff_org_id !== orgId) ||
      (userRecord.customClaims?.orgId && userRecord.customClaims.orgId !== orgId)) {
    throw new HttpsError('failed-precondition', 'This account already belongs to another team. Sign in with the invited account or contact the organizer.');
  }
  if (invite.redeemedBy === uid &&
      (await db.ref(`orgs/${orgId}/staff/${uid}`).get()).val() !== role) {
    throw new HttpsError('permission-denied', 'This invitation has already been used. Ask the organizer for a new invitation.');
  }

  // 2. Perform atomic updates (S8 Isolation)
  const updates = {
    [`orgs/${orgId}/staff/${uid}`]: role,
    [`users/${uid}/staff_org_id`]: orgId,
    [`users/${uid}/join_flow_status`]: null,
    [`users/${uid}/mfa_pending`]: false,
    // Bind consumption to this UID so retries can finish claims/handoff safely.
    [`org_invites/${token}/redeemedBy`]: uid,
    [`org_invites/${token}/redeemedAt`]: invite.redeemedAt || Date.now(),
  };

  // S35: Ensure basic profile exists so they don't show as "Unknown User"
  // Fetch existing user record in Realtime Database to prevent overwriting their real name
  
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

  // Generate secure single-use auth handoff token for mobile app onboarding
  const handoffToken = crypto.randomBytes(32).toString("hex");
  updates[`auth_handoff_tokens/${handoffToken}`] = {
    uid: uid,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    expiresAt: Date.now() + 15 * 60 * 1000,
    used: false,
  };

  await db.ref().update(updates);

  // Publish privileges only after membership commits. A retry can repair a
  // failed claims update using the UID-bound invitation above.
  await auth.setCustomUserClaims(uid, { ...userRecord.customClaims, role, orgId });

  // 3. Audit Logging (S20)
  await writeAuditLog(orgId, {
    action: "TEAM_MEMBER_JOINED",
    byUid: uid,
    extra: { role, inviteToken: token },
  }).catch(error => console.warn('Team join audit failed:', error.message));

  return { success: true, orgId, role, handoffToken };
});



// ── Get Invite Metadata (public — no auth needed) ─────────────────────────────
// Returns safe trip preview for the invite landing page.
// S16: Only serves data from our DB, never reflects URL params back.
exports.getInviteMetadata = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
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
  if (!tripExpiry(trip)) throw new HttpsError("permission-denied", "This trip has ended or is invalid.");
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
