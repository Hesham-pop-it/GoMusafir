// ─── Trip Functions ───────────────────────────────────────────────────────────
// Covers: S6 (RBAC), S8 (org isolation), S15 (invite expiry + single-use),
//         S16 (no open redirects), S17 (input validation), S19 (server-side mute),
//         S20 (audit log)

const { HttpsError } = require("firebase-functions/v2/https");
const { onCall } = require("../middleware/participantAccessMiddleware");
const { admin, db } = require("../admin");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth, requireRole } = require("../middleware/appCheckMiddleware");
const { validate, schemas } = require("../middleware/validateSchema");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");
const { sendPushNotification } = require("../services/notificationService");

// ── Request Trip Creation Link (Step 4) ──────────────────────────────────────
exports.requestTripLink = onCall({ region: "europe-west1", secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "manager", "co-host"]);

  const { uid, token } = request.auth;
  const orgId = token.orgId;
  const email = token.email;

  if (!orgId) throw new HttpsError("unauthenticated", "No organization linked to this account.");

  // Generate a unique, short-lived secure token for this link
  const linkToken = crypto.randomBytes(32).toString("hex");
  const expiry = Date.now() + 1 * 60 * 60 * 1000; // 1 hour expiry

  await db.ref(`temp_links/${linkToken}`).set({
    orgId: orgId,
    uid: uid,
    email: email,
    expiresAt: expiry,
    used: false,
    action: "CREATE_TRIP"
  });

  const webLink = `https://app.gomusafir.app/create-journey?token=${linkToken}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #B99A4A; text-align: center;">Ready to Start a New Journey?</h2>
      <p>Hello,</p>
      <p>Click the button below to create your new trip/event on the GoMusafir web dashboard. This secure link is valid for 1 hour.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${webLink}" style="background-color: #B99A4A; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Create New Journey</a>
      </div>
      <p style="word-break: break-all; color: #666; font-size: 11px;">Verification Link: ${webLink}</p>
    </div>
  `;

  await sendEmail({ to: email, subject: "Create Your New GoMusafir Journey", html: htmlContent });
  await writeAuditLog(orgId, { action: "TRIP_LINK_REQUESTED", byUid: uid });
  return { success: true };
});

// ── Verify Link Token (Step 4 Security) ──────────────────────────────────────
exports.verifyLinkToken = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  // This is a public check, but we still verify the token's existence and expiry.
  const { token, allowPaid } = request.data;
  if (!token) throw new HttpsError("invalid-argument", "Token is required.");

  const tokenRef = db.ref(`temp_links/${token}`);
  const snapshot = await tokenRef.get();

  if (!snapshot.exists()) {
    throw new HttpsError("not-found", "Invalid or expired link. Please request a new one from the app.");
  }

  const data = snapshot.val();
  if (data.used) {
    if (allowPaid && data.paid && data.tripId) {
      return {
        valid: true,
        orgId: data.orgId,
        email: data.email || null,
        action: data.action,
        prepaidSeats: 0,
        tripId: data.tripId,
        inviteCode: data.inviteCode || null
      };
    }
    throw new HttpsError("permission-denied", "This link has already been used.");
  }
  if (Date.now() > data.expiresAt) {
    throw new HttpsError("deadline-exceeded", "This link has expired. Please request a new one from the app.");
  }

  const orgSnap = await db.ref(`orgs/${data.orgId}/prepaid_seats`).get();
  const prepaidSeats = orgSnap.val() || 0;

  // Optional: We can mark it as used here, or wait for the trip creation to succeed.
  // For now, we return the orgId so the website knows which org to create the trip for.
  return {
    valid: true,
    orgId: data.orgId,
    email: data.email,
    action: data.action,
    prepaidSeats
  };
});

// ── Create Trip ───────────────────────────────────────────────────────────────
// S15: Invitation code is a UUID (cryptographically random).
// S16: Invite link is scoped — only resolves on *.app.gomusafir.app
exports.createTrip = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);

  const { title, destination, startDate, endDate, image, linkToken, totalSeats } = request.data;
  let orgId = request.auth?.token?.orgId;
  let uid = request.auth?.uid;

  // S17: Generic validation (minimal for this example, add schemas.createTrip in production)
  if (!title || !destination || !startDate || !endDate) {
    throw new HttpsError("invalid-argument", "Missing required trip fields.");
  }

  const { createTripRecord } = require('./tripCreationHelper');
  const { requireOrgStaff } = require('../services/tripSeatService');
  if (linkToken) {
    const tokenSnap = await db.ref(`temp_links/${linkToken}`).get();
    const tokenData = tokenSnap.val();
    if (!tokenData || tokenData.used || Date.now() > tokenData.expiresAt || tokenData.action !== 'CREATE_TRIP') {
      throw new HttpsError('permission-denied', 'Invalid or expired trip creation link.');
    }
    orgId = tokenData.orgId;
    uid = tokenData.uid;
  }
  await requireOrgStaff(orgId, uid);
  const { tripId, inviteCode } = await createTripRecord({
    orgId, uid, title, destination, startDate, endDate, image, totalSeats,
    operationId: linkToken ? `create:${linkToken}` : request.data.requestId ? `create:${uid}:${request.data.requestId}` : undefined,
  });

  if (linkToken) {
    await db.ref(`temp_links/${linkToken}`).update({
      used: true,
      paid: true,
      tripId: tripId,
      inviteCode: inviteCode
    });
  }

  // S20: Audit log
  await writeAuditLog(orgId, {
    action: "TRIP_CREATED",
    byUid: uid,
    targetId: tripId,
    ipAddress: request.rawRequest?.ip,
  });

  if (uid) {
    sendPushNotification(
      uid,
      "Trip Created",
      `Your trip "${title}" has been created successfully. Share the invite link with your team!`,
      { type: "TRIP_CREATED", tripId },
      { androidChannelId: "Admin", tripId }
    ).catch(e => console.error("Push notification failed:", e));
  }

  return { tripId, inviteCode };
});

// Date changes and seat deductions must use the same organization transaction.
exports.updateTripDates = onCall({ region: 'europe-west1' }, async request => {
  verifyAppCheck(request);
  requireRole(request, ['admin', 'co-host', 'manager']);
  const { tripId, startDate, endDate, destination } = request.data || {};
  if (typeof tripId !== 'string' || !/^[\w-]+$/.test(tripId)) throw new HttpsError('invalid-argument', 'Invalid trip.');
  const { requireOrgStaff, changeTripSeats, usageFor } = require('../services/tripSeatService');
  usageFor(startDate, endDate, 1);
  const orgId = request.auth.token.orgId;
  await requireOrgStaff(orgId, request.auth.uid);
  return changeTripSeats({ orgId, tripId, startDate, endDate, destination });
});

// ── Update Live Location (Optimized — no audit log, high frequency) ───────────
exports.updateLiveLocation = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "manager", "co-host"]);

  const data = validate(schemas.updateLocation, request.data);
  const orgId = request.auth.token.orgId;

  await db.ref(`orgs/${orgId}/trips/${data.tripId}/live_data/${data.busId}`).update({
    lat: data.lat,
    lng: data.lng,
    updated_at: admin.database.ServerValue.TIMESTAMP,
  });

  return { success: true };
});

// Canonical checks include both status and the end timestamp.
const { refreshAccess, tripExpiry } = require('../services/participantAccessService');
const { syncTrip } = require('./participantAccessFunctions');
const checkAndRevokeInactiveParticipant = async uid => {
  try { await refreshAccess(uid); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
};

// ── Close Trip ────────────────────────────────────────────────────────────────
// S15: Invalidates the invite code when trip is closed.
exports.closeTrip = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "co-host"]);

  const { tripId } = request.data;
  if (!tripId) throw new HttpsError("invalid-argument", "tripId is required.");

  const orgId = request.auth.token.orgId;

  // Get invite code to invalidate it
  const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}`).get();
  if (!tripSnap.exists()) throw new HttpsError("not-found", "Trip not found.");

  const trip = tripSnap.val();
  const inviteCode = trip.invitation_code;

  // Get participant list to revoke sessions for ended trip
  const participantsSnap = await db.ref(`trips_participants/${tripId}`).get();
  const participantIds = participantsSnap.exists() ? Object.keys(participantsSnap.val() || {}) : [];

  const updates = {
    [`orgs/${orgId}/trips/${tripId}/status`]: "closed",
    [`orgs/${orgId}/trips/${tripId}/live_data`]: null, // clear live data
    [`orgs/${orgId}/trips/${tripId}/invitation_code`]: null, // remove invite
    [`invites/${inviteCode}`]: null, // S15: invalidate invite
  };

  await db.ref().update(updates);

  // Revoke session for participants who have no other active trips
  await Promise.all(participantIds.map(pid => checkAndRevokeInactiveParticipant(pid)));
  await syncTrip(orgId, tripId);

  await writeAuditLog(orgId, {
    action: "TRIP_CLOSED",
    byUid: request.auth.uid,
    targetId: tripId,
  });

  return { success: true };
});

// ── Rotate Invite Code ────────────────────────────────────────────────────────
// S15: Manually rotate invite code without closing the trip
exports.rotateInviteCode = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "co-host"]);

  const { tripId } = request.data;
  if (!tripId) throw new HttpsError("invalid-argument", "tripId is required.");

  const orgId = request.auth.token.orgId;

  const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}`).get();
  if (!tripSnap.exists()) throw new HttpsError("not-found", "Trip not found.");

  const trip = tripSnap.val();
  const oldInviteCode = trip.invitation_code;
  const newInviteCode = uuidv4();

  const updates = {
    [`orgs/${orgId}/trips/${tripId}/invitation_code`]: newInviteCode,
    [`invites/${oldInviteCode}`]: null,
    [`invites/${newInviteCode}`]: {
      org_id: orgId,
      trip_id: tripId,
      role: "participant",
      expires_at: trip.invite_expires_at,
      redeemed_count: trip.participants - 1, // Inherit current count
    },
  };

  await db.ref().update(updates);

  await writeAuditLog(orgId, {
    action: "INVITE_ROTATED",
    byUid: request.auth.uid,
    targetId: tripId,
  });

  return { newInviteCode };
});

// ── Set Mute All (S19) ──────────────────────────────────────────────────────
exports.setMuteAll = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "manager", "co-host"]);

  const { tripId, mute } = request.data;
  if (!tripId) throw new HttpsError("invalid-argument", "tripId is required.");

  const orgId = request.auth.token.orgId;

  await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/mute_all`).set(mute);
  await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).update({
    isAllMuted: mute,
    lastUpdatedBy: request.auth.uid
  });

  await writeAuditLog(orgId, {
    action: mute ? "TRIP_MUTED" : "TRIP_UNMUTED",
    byUid: request.auth.uid,
    targetId: tripId,
  });

  return { success: true };
});

// ── Remove Participant from Trip ──────────────────────────────────────────────
exports.removeParticipantFromTrip = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "co-host", "manager"]);

  const { tripId, targetUid } = request.data;
  const orgId = request.auth.token.orgId;

  if (!tripId || !targetUid) {
    throw new HttpsError("invalid-argument", "tripId and targetUid are required.");
  }

  // Security: Check if trip belongs to caller's org
  const tripOrgSnap = await db.ref(`trips_orgs/${tripId}`).get();
  if (!tripOrgSnap.exists() || tripOrgSnap.val() !== orgId) {
    throw new HttpsError("permission-denied", "Trip does not belong to your organization.");
  }

  // Get trip info for notification
  const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}`).get();
  const tripTitle = tripSnap.exists() ? tripSnap.val().title : 'your trip';

  // Atomic update to remove from participant list, user's joined list, and active location data
  const updates = {
    [`trips_participants/${tripId}/${targetUid}`]: null,
    [`users/${targetUid}/joined_trips/${tripId}`]: null,
    [`trips_active/${orgId}/${tripId}/locations/${targetUid}`]: null,
  };

  await db.ref().update(updates);

  await checkAndRevokeInactiveParticipant(targetUid);

  await writeAuditLog(orgId, {
    action: "PARTICIPANT_REMOVED",
    byUid: request.auth.uid,
    targetId: targetUid,
    extra: { tripId }
  });

  sendPushNotification(
    targetUid,
    "Removed from Trip",
    `You have been removed from the trip "${tripTitle}".`,
    { type: "PARTICIPANT_REMOVED", tripId },
    { androidChannelId: "Admin", tripId }
  ).catch(e => console.error("Push notification failed:", e));

  return { success: true };
});
// Resolve profile data and enforce trip membership and field visibility on the server.
exports.getParticipantProfile = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  return require('../services/participantProfileService').getParticipantProfile(request);
});

// ── Delete Trip ───────────────────────────────────────────────────────────────
exports.deleteTrip = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "co-host"]);

  const { tripId } = request.data;
  if (!tripId) throw new HttpsError("invalid-argument", "tripId is required.");

  const orgId = request.auth.token.orgId;
  const uid = request.auth.uid;

  // 1. Get the trip to verify it exists and get its invitation code
  const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}`).get();
  if (!tripSnap.exists()) throw new HttpsError("not-found", "Trip not found.");

  const trip = tripSnap.val();
  const inviteCode = trip.invitation_code;

  // 2. Find all participants to remove the trip from their joined_trips list
  const participantsSnap = await db.ref(`trips_participants/${tripId}`).get();
  const participantIds = [];
  if (participantsSnap.exists()) {
    const val = participantsSnap.val();
    if (typeof val === "object" && val !== null) {
      Object.keys(val).forEach(pid => {
        if (val[pid]) participantIds.push(pid);
      });
    }
  }

  // 3. Construct atomic update
  const updates = {};

  // Remove trip metadata and active status
  updates[`orgs/${orgId}/trips/${tripId}`] = null;
  updates[`trips_orgs/${tripId}`] = null;
  updates[`trips_participants/${tripId}`] = null;
  updates[`trips_active/${orgId}/${tripId}`] = null;

  // Invalidate invitation code if it exists
  if (inviteCode) {
    updates[`invites/${inviteCode}`] = null;
  }

  // Remove from joined_trips for all participants
  participantIds.forEach(pid => {
    updates[`users/${pid}/joined_trips/${tripId}`] = null;
  });

  await db.ref().update(updates);

  // Revoke session for participants who have no other active trips
  await Promise.all(participantIds.map(pid => checkAndRevokeInactiveParticipant(pid)));
  await syncTrip(orgId, tripId);

  // Write audit log
  await writeAuditLog(orgId, {
    action: "TRIP_DELETED",
    byUid: uid,
    targetId: tripId,
  });

  // Notify all participants asynchronously
  if (trip && trip.title) {
    Promise.all(
      participantIds.map(pid =>
        sendPushNotification(
          pid,
          "Trip Deleted",
          `The trip "${trip.title}" has been deleted by the organizer.`,
          { type: "TRIP_DELETED", tripId },
          { androidChannelId: "Admin", tripId }
        )
      )
    ).catch(e => console.error("Push notification failed:", e));
  }

  return { success: true };
});

// ── Update Participant Profile (Admin only) ──────────────────────────────────
exports.updateParticipantProfile = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "manager", "co-host"]);

  const { targetUid, tripId, firstName, lastName, email, phone, photoURL } = request.data;
  const orgId = request.auth.token.orgId;

  if (!targetUid || !tripId || !firstName || !lastName || !email || !phone) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  // Security: Verify trip belongs to caller's org
  const tripOrgSnap = await db.ref(`trips_orgs/${tripId}`).get();
  if (!tripOrgSnap.exists() || tripOrgSnap.val() !== orgId) {
    throw new HttpsError("permission-denied", "Access denied to this trip's data.");
  }

  // Verify target user is associated with this trip or organization
  const participantSnap = await db.ref(`trips_participants/${tripId}/${targetUid}`).get();
  const staffSnap = await db.ref(`orgs/${orgId}/staff/${targetUid}`).get();

  if (!participantSnap.exists() && !staffSnap.exists()) {
    throw new HttpsError("permission-denied", "Target user is not associated with this trip or organization.");
  }

  const { encrypt } = require("../services/kmsService");

  const encryptedEmail = encrypt(email);
  const encryptedPhone = encrypt(phone);
  const encryptedPhotoUrl = photoURL ? encrypt(photoURL) : null;

  const profile = {
    firstName: firstName,
    lastName: lastName,
    phone: phone,
    email: email,
    photoURL: photoURL || null,
    updated_at: Date.now()
  };

  const encryptedProfile = encrypt(JSON.stringify(profile));

  const updates = {
    [`users/${targetUid}/first_name`]: firstName,
    [`users/${targetUid}/last_name`]: lastName,
    [`users/${targetUid}/full_name`]: `${firstName} ${lastName}`.trim(),
    [`users/${targetUid}/photo_url`]: photoURL || null,
    [`users/${targetUid}/p_photo_url`]: encryptedPhotoUrl,
    [`users/${targetUid}/profile`]: profile,
    [`users/${targetUid}/p_profile`]: encryptedProfile,
    [`users/${targetUid}/p_email`]: encryptedEmail,
    [`users/${targetUid}/p_phone`]: encryptedPhone,
    [`trips_participants/${tripId}/${targetUid}`]: Date.now(),
  };

  await db.ref().update(updates);

  await writeAuditLog(orgId, {
    action: "PARTICIPANT_PROFILE_UPDATED",
    byUid: request.auth.uid,
    targetId: targetUid,
    extra: { tripId }
  });

  return { success: true };
});



// The website's journey link authorizes this upload without a browser login.
exports.uploadTripPhoto = onCall({ region: 'europe-west1' }, async request => {
  verifyAppCheck(request);
  const { linkToken, dataUrl } = request.data || {};
  if (typeof linkToken !== 'string' || !/^[a-zA-Z0-9_-]{16,200}$/.test(linkToken)) {
    throw new HttpsError('permission-denied', 'Invalid journey link.');
  }
  const link = (await db.ref(`temp_links/${linkToken}`).get()).val();
  if (!link || link.used || link.action !== 'CREATE_TRIP' || !Number.isFinite(link.expiresAt) || link.expiresAt <= Date.now()) {
    throw new HttpsError('permission-denied', 'This journey link has expired or has already been used.');
  }
  const { requireOrgStaff } = require('../services/tripSeatService');
  await requireOrgStaff(link.orgId, link.uid);
  const { decodeTripPhoto } = require('../services/tripPhotoService');
  const bytes = decodeTripPhoto(dataUrl);
  const file = admin.storage().bucket().file(`trips/${uuidv4()}.jpg`);
  await file.save(bytes, { resumable: false, metadata: { contentType: 'image/jpeg',
    metadata: { firebaseStorageDownloadTokens: uuidv4() } } });
  const { getDownloadURL } = require('firebase-admin/storage');
  return { url: await getDownloadURL(file) };
});
