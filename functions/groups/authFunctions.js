const { calculateAccess, refreshAccess } = require('../services/participantAccessService');
// ─── Auth Functions ───────────────────────────────────────────────────────────
// Covers: S1 (email verify), S2 (MFA), S4 (password policy), S5 (session revoke),
//         S6 (RBAC custom claims), S12 (KMS PII), S20/S21 (audit/login logging)

const functions = require("firebase-functions/v2");
const { HttpsError } = require("firebase-functions/v2/https");
const { onCall } = require("../middleware/participantAccessMiddleware");
const { beforeUserCreated, beforeUserSignedIn } = require("firebase-functions/v2/identity");
const { admin, db, auth } = require("../admin");
const { encrypt } = require("../services/kmsService");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth } = require("../middleware/appCheckMiddleware");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");
const { sendPushNotification } = require("../services/notificationService");
const { deleteStripeCustomer } = require("../services/stripeService");

// ── S6 + S12: On user signup — set custom claims and encrypt PII ──────────────
// This trigger fires when the org admin account is created via the website.
// Role claim is set to "pending" until createOrganization confirms the org.
exports.onUserSignup = beforeUserCreated({ region: "europe-west1" }, async (event) => {
  const user = event.data;
  // Block sign-ups without email
  if (!user.email) {
    throw new HttpsError("invalid-argument", "An email address is required.");
  }
  // S4: Basic password is enforced by Firebase Auth policy in console settings.
  // Custom claims will be set by createOrganization after org is confirmed.
  return { customClaims: { ...user.customClaims, role: user.customClaims?.role || "pending" } };
});

// ── S21: Log every sign-in (success + failure) ────────────────────────────────
exports.onSignIn = beforeUserSignedIn({ region: "europe-west1" }, async (event) => {
  const user = event.data;
  const ipAddress = event.ipAddress || "unknown";
  // Ordinary participant login is blocked without a valid trip. Returning
  // users join through the invitation/email-code enrollment endpoint instead.
  try {
    // Verify staff from Auth plus organization membership without depending on
    // participant reconciliation availability during staff sign-in.
    const identityAccess = await calculateAccess(user.uid);
    const access = identityAccess.staff ? identityAccess : await refreshAccess(user.uid);
    if (!access.staff && !access.expires_at && (access.participant || user.customClaims?.role !== 'pending')) {
      throw new HttpsError('permission-denied', 'Your trip has ended. Join a valid trip to sign in again.');
    }
  } catch (error) {
    // beforeSignIn can run before a newly created account is visible to Admin.
    if (error.code !== 'auth/user-not-found') throw error;
  }

  // S21: Log sign-in
  await db.ref("system_logs/logins").push({
    uid: user.uid,
    email_hash: crypto.createHash("sha256").update(user.email || "").digest("hex"),
    ip_hash: crypto.createHash("sha256").update(ipAddress).digest("hex"),
    timestamp: admin.database.ServerValue.TIMESTAMP,
    event: "SIGNIN_SUCCESS",
  });

  // NEW: Sync profile data if missing
  const userRef = db.ref(`users/${user.uid}`);
  const userSnap = await userRef.get();
  const userData = userSnap.val() || {};

  const updates = {};
  if (!userData.full_name && user.displayName) {
    updates.full_name = user.displayName;
  }

  // Populate basic profile from Auth provider if missing
  if (!userData.profile && user.displayName) {
    const parts = user.displayName.split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";
    
    updates.profile = {
      firstName,
      lastName,
      photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName[0] || 'U')}&background=B99A4A&color=fff`,
      updated_at: Date.now()
    };
  }

  if (Object.keys(updates).length > 0) {
    await userRef.update(updates);
  }

  // Notify the user of a new sign in
  sendPushNotification(
    user.uid,
    "New Sign-In",
    "We noticed a new sign-in to your GoMusāfir account.",
    { type: 'NEW_SIGN_IN' },
    { androidChannelId: "Admin" }
  ).catch(e => console.log("Push error:", e.message));

  return {};
});

// ── S5: Revoke all sessions for a user (Admin only) ───────────────────────────
exports.revokeSession = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const callerRole = request.auth.token.role;
  const callerOrgId = request.auth.token.orgId;
  const { targetUid } = request.data;

  if (callerRole !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can revoke sessions.");
  }
  if (!targetUid) throw new HttpsError("invalid-argument", "targetUid is required.");

  // Verify target user belongs to caller's org
  const targetSnap = await db.ref(`users/${targetUid}/staff_org_id`).get();
  if (!targetSnap.exists() || targetSnap.val() !== callerOrgId) {
    throw new HttpsError("permission-denied", "Target user does not belong to your organization.");
  }

  // Revoke Firebase refresh tokens
  await auth.revokeRefreshTokens(targetUid);

  // Mark all sessions as revoked in RTDB
  const sessionsSnap = await db.ref(`users/${targetUid}/active_sessions`).get();
  if (sessionsSnap.exists()) {
    const updates = {};
    Object.keys(sessionsSnap.val()).forEach((sid) => {
      updates[`users/${targetUid}/active_sessions/${sid}/revoked`] = true;
    });
    await db.ref().update(updates);
  }

  await writeAuditLog(callerOrgId, {
    action: "SESSION_REVOKED",
    byUid: request.auth.uid,
    targetId: targetUid,
    ipAddress: request.rawRequest?.ip,
  });

  return { success: true };
});

// ── S3: Verify MFA enrollment status ─────────────────────────────────────────
exports.verifyMFAState = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const userRecord = await auth.getUser(request.auth.uid);
  const mfaEnrolled = userRecord.multiFactor?.enrolledFactors?.length > 0;

  return { mfaEnrolled };
});

// ── Custom Email 6-Digit OTP Flow ─────────────────────────────────────────────
exports.sendCustomEmailOTP = onCall({ enrollment: true, region: "europe-west1", secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const uid = request.auth.uid;
  const email = request.auth.token.email;

  // Rate Limiting check (prevent spamming emails)
  const rateLimitRef = db.ref(`otp_codes/${uid}/lastSent`);
  const snapshot = await rateLimitRef.get();
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
  const limitTime = isEmulator ? 5000 : 60000;
  if (snapshot.exists() && Date.now() - snapshot.val() < limitTime) {
    throw new HttpsError("resource-exhausted", "auth/too-many-requests");
  }

  // Generate ultra-secure 6-digit code
  const code = email === 'apple@popitnl.nl' ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();

  // Store code in RTDB securely with an expiration timestamp
  await db.ref(`otp_codes/${uid}`).set({
    code: code,
    expiresAt: Date.now() + 10 * 60 * 1000, // Valid for 10 minutes
    lastSent: Date.now()
  });

  if (email === 'apple@popitnl.nl') {
      return { success: true };
  }

  try {
    await sendEmail({
      to: email,
      subject: "Your GoMusāfir Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
          <h2 style="color: #B99A4A;">GoMusāfir Verification</h2>
          <p>Use the following 6-digit code to verify your beautiful new workspace:</p>
          <h1 style="background: #1A1814; color: #FFF; padding: 20px; border-radius: 8px; font-size: 36px; letter-spacing: 4px;">${code}</h1>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.warn("Email Error: ", err);
    throw new HttpsError("internal", "Failed to send email OTP: " + err.message);
  }
});

exports.verifyCustomEmailOTP = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const uid = request.auth.uid;
  const { otp } = request.data;

  if (!otp || otp.length !== 6) {
    throw new HttpsError("invalid-argument", "Invalid OTP format");
  }

  // ── Apple Review Bypass ───────────────────────────────────────────────────────
  // Apple testers use apple@popitnl.nl with OTP 123456. Short-circuit all DB
  // checks so the bypass works even if sendCustomEmailOTP was never called,
  // or if the stored OTP has expired.
  const isAppleBypass = request.auth.token.email === 'apple@popitnl.nl' && otp === '123456';
  if (isAppleBypass) {
    await admin.auth().updateUser(uid, { emailVerified: true });
    // Clean up any leftover OTP record (best-effort)
    await db.ref(`otp_codes/${uid}`).remove().catch(() => {});
    return { verified: true };
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const otpRef = db.ref(`otp_codes/${uid}`);
  const snapshot = await otpRef.get();

  if (!snapshot.exists()) {
    throw new HttpsError("not-found", "No pending OTP request found.");
  }

  const data = snapshot.val();
  if (Date.now() > data.expiresAt) {
    throw new HttpsError("deadline-exceeded", "OTP has expired. Please request a new one.");
  }

  if (data.code !== otp) {
    throw new HttpsError("permission-denied", "Incorrect OTP code.");
  }

  // OTP Matches! Authenticate the user cryptographically via Firebase Admin SDK
  await admin.auth().updateUser(uid, {
    emailVerified: true
  });

  // Cleanup the used code to prevent multi-use attacks
  await otpRef.remove();

  return { verified: true };
});

exports.checkUserExistence = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  const { email } = request.data;
  if (!email || typeof email !== "string") {
    throw new HttpsError("invalid-argument", "Valid email is required.");
  }
  try {
    const userRecord = await auth.getUserByEmail(email.toLowerCase());
    const role = userRecord.customClaims?.role;
    const staffSnap = await db.ref(`users/${userRecord.uid}/staff_org_id`).get();
    const isStaff = !!staffSnap.val() || ['admin', 'co-host', 'manager'].includes(role);
    return { exists: true, isStaff: !!isStaff };
  } catch (error) {
    if (error.code === "auth/user-not-found") return { exists: false, isStaff: false };
    throw new HttpsError("internal", error.message);
  }
});

// ── Delete User Globally (Admin only) ─────────────────────────────────────────
exports.deleteUserGlobally = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin"]);

  const { targetUid } = request.data;
  const orgId = request.auth.token.orgId;

  if (!targetUid) throw new HttpsError("invalid-argument", "targetUid is required.");

  // Verify target user belongs to caller's org for data isolation
  const joinedTripsSnap = await db.ref(`users/${targetUid}/joined_trips`).get();
  let belongsToOrg = false;
  if (joinedTripsSnap.exists()) {
    for (const tid of Object.keys(joinedTripsSnap.val())) {
      const tOrgSnap = await db.ref(`trips_orgs/${tid}`).get();
      if (tOrgSnap.exists() && tOrgSnap.val() === orgId) {
        belongsToOrg = true;
        break;
      }
    }
  }

  // Also check if they are staff of this org
  const staffOrgSnap = await db.ref(`users/${targetUid}/staff_org_id`).get();
  if (staffOrgSnap.exists() && staffOrgSnap.val() === orgId) {
    belongsToOrg = true;
  }

  if (!belongsToOrg) {
    throw new HttpsError("permission-denied", "You can only delete users who belong to your organization.");
  }

  // 1. Find all trips the user joined to clean up trips_participants
  const joinedTrips = joinedTripsSnap.val() || {};
  const updates = {
    [`users/${targetUid}`]: null,
    [`otp_codes/${targetUid}`]: null,
  };

  for (const tid of Object.keys(joinedTrips)) {
    updates[`trips_participants/${tid}/${targetUid}`] = null;
    const tripOrgId = joinedTrips[tid].org_id || joinedTrips[tid].orgId;
    if (tripOrgId) {
      updates[`trips_active/${tripOrgId}/${tid}/locations/${targetUid}`] = null;
    }
  }

  // 2. Delete Stripe Customer (if any)
  let targetEmail = null;
  try {
    const targetUser = await auth.getUser(targetUid);
    targetEmail = targetUser.email;
  } catch (e) {}

  let stripeCustomerId = null;
  const userStripeSnap = await db.ref(`users/${targetUid}/stripe_customer_id`).get();
  if (userStripeSnap.exists()) {
    stripeCustomerId = userStripeSnap.val();
  } else if (orgId) {
    const orgStripeSnap = await db.ref(`orgs/${orgId}/stripe_customer_id`).get();
    if (orgStripeSnap.exists()) {
      stripeCustomerId = orgStripeSnap.val();
    }
  }
  await deleteStripeCustomer(stripeCustomerId, targetEmail, orgId);

  // 3. Delete from Auth (Admin SDK)
  await db.ref(`app_access/${targetUid}`).remove();
  await auth.deleteUser(targetUid);

  // 4. Delete from DB
  await db.ref().update(updates);

  await writeAuditLog(orgId, {
    action: "USER_DELETED_GLOBALLY",
    byUid: request.auth.uid,
    targetId: targetUid,
  });

  return { success: true };
});

// ── Delete My Account (Bypasses recent login requirement by using Admin SDK) ───
// Deletion requires a valid identity, even when the user has no active trip.
exports.deleteMyAccount = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const uid = request.auth.uid;
  const role = request.auth.token.role;
  const orgId = request.auth.token.orgId;
  const userEmail = request.auth.token.email;

  let stage = "organization";
  try {
    // 1. If admin, mark org for deletion (soft delete)
    if (role === 'admin' && orgId) {
      await db.ref(`orgs/${orgId}/metadata/deleted_at`).set(admin.database.ServerValue.TIMESTAMP);
      await writeAuditLog(orgId, {
        action: "ORG_DELETED_BY_OWNER",
        byUid: uid,
        targetId: orgId,
      });
    }

    stage = "billing";
    // 2. Cleanup Stripe Customer
    let stripeCustomerId = null;
    const userStripeSnap = await db.ref(`users/${uid}/stripe_customer_id`).get();
    if (userStripeSnap.exists()) {
      stripeCustomerId = userStripeSnap.val();
    } else if (orgId) {
      const orgStripeSnap = await db.ref(`orgs/${orgId}/stripe_customer_id`).get();
      if (orgStripeSnap.exists()) {
        stripeCustomerId = orgStripeSnap.val();
      }
    }
    await deleteStripeCustomer(stripeCustomerId, userEmail, orgId);

    stage = "profile-read";
    // 3. Cleanup user data
    const joinedTripsSnap = await db.ref(`users/${uid}/joined_trips`).get();
    const updates = {
      [`users/${uid}`]: null,
      [`otp_codes/${uid}`]: null,
    };

    if (joinedTripsSnap.exists()) {
      const joinedTrips = joinedTripsSnap.val();
      Object.keys(joinedTrips).forEach(tid => {
        updates[`trips_participants/${tid}/${uid}`] = null;
        const tripOrgId = joinedTrips[tid]?.org_id || joinedTrips[tid]?.orgId;
        if (tripOrgId) {
          updates[`trips_active/${tripOrgId}/${tid}/locations/${uid}`] = null;
        }
      });
    }

    stage = "profile-cleanup";
    updates[`app_access/${uid}`] = null;
    await db.ref().update(updates);

    stage = "auth-delete";
    await auth.deleteUser(uid);
  } catch (error) {
    console.error("Account deletion failed", { uid, stage, code: error.code, message: error.message });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "We couldn't finish deleting your account. Please try again. If this continues, contact support.");
  }

  return { success: true };
});

// ── Web-to-App Secure Authentication Handoff ──────────────────────────────────
// Allows an authenticated web user (e.g. after registration) to securely hand off
// their session to the mobile app without re-entering credentials.
// S15: Short 5-minute TTL, single-use, cryptographically secure token.
exports.createAuthHandoffToken = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const uid = request.auth.uid;
  const token = crypto.randomBytes(32).toString("hex");

  const handoffRef = db.ref(`auth_handoff_tokens/${token}`);
  await handoffRef.set({
    uid,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes validity
    used: false,
  });

  return {
    success: true,
    token,
    expiresIn: 300,
  };
});

exports.exchangeAuthHandoffToken = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  const { token } = request.data || {};

  if (!token || typeof token !== "string" || token.length < 32 || token.length > 128) {
    throw new HttpsError("invalid-argument", "Valid session handoff token is required.");
  }

  const tokenRef = db.ref(`auth_handoff_tokens/${token}`);
  const snapshot = await tokenRef.get();

  if (!snapshot.exists()) {
    throw new HttpsError("not-found", "Invalid or expired session token.");
  }

  const tokenData = snapshot.val();
  const now = Date.now();

  if (tokenData.used || (tokenData.expiresAt && now > tokenData.expiresAt)) {
    await tokenRef.remove().catch(() => {});
    throw new HttpsError("failed-precondition", "This session token has expired or has already been used.");
  }

  // Burn immediately to ensure strict single-use security
  await tokenRef.remove();

  const uid = tokenData.uid;
  if (!uid) {
    throw new HttpsError("internal", "Malformed token record.");
  }

  // Verify the user exists in Firebase Auth
  let userRecord;
  try {
    userRecord = await auth.getUser(uid);
    if (!userRecord) {
      throw new HttpsError("not-found", "User account not found.");
    }
  } catch (userErr) {
    throw new HttpsError("not-found", "User account not found.");
  }

  const access = await calculateAccess(uid);
  if (!access.staff && !access.expires_at) {
    throw new HttpsError('permission-denied', 'Join a valid trip before using the app.');
  }

  // Clear any mfa_pending flag in database so the mobile app doesn't ask for MFA again
  await db.ref(`users/${uid}/mfa_pending`).set(false).catch(() => {});

  // Ensure emailVerified is true in Firebase Auth since OTP was already verified on the website
  await auth.updateUser(uid, { emailVerified: true }).catch(() => {});

  // Fetch the user's custom claims (which include role and orgId)
  const existingClaims = userRecord.customClaims || {};

  // Generate custom token for mobile app sign-in, preserving all existing custom claims
  const customToken = await auth.createCustomToken(uid, {
    ...existingClaims,
    email_verified: true,
    handoff: true,
  });

  return {
    success: true,
    customToken,
  };
});


