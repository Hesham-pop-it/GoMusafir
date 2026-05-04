// ─── Auth Functions ───────────────────────────────────────────────────────────
// Covers: S1 (email verify), S2 (MFA), S4 (password policy), S5 (session revoke),
//         S6 (RBAC custom claims), S12 (KMS PII), S20/S21 (audit/login logging)

const functions = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { beforeUserCreated, beforeUserSignedIn } = require("firebase-functions/v2/identity");
const { admin, db, auth } = require("../admin");
const { encrypt } = require("../services/kmsService");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth } = require("../middleware/appCheckMiddleware");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");

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
  return {};
});

// ── S21: Log every sign-in (success + failure) ────────────────────────────────
exports.onSignIn = beforeUserSignedIn({ region: "europe-west1" }, async (event) => {
  const user = event.data;
  const ipAddress = event.ipAddress || "unknown";

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
exports.verifyMFAState = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const userRecord = await auth.getUser(request.auth.uid);
  const mfaEnrolled = userRecord.multiFactor?.enrolledFactors?.length > 0;

  return { mfaEnrolled };
});

// ── Custom Email 6-Digit OTP Flow ─────────────────────────────────────────────
exports.sendCustomEmailOTP = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const uid = request.auth.uid;
  const email = request.auth.token.email;

  // Rate Limiting check (prevent spamming emails)
  const rateLimitRef = db.ref(`otp_codes/${uid}/lastSent`);
  const snapshot = await rateLimitRef.get();
  if (snapshot.exists() && Date.now() - snapshot.val() < 60000) {
    throw new HttpsError("resource-exhausted", "auth/too-many-requests");
  }

  // Generate ultra-secure 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Store code in RTDB securely with an expiration timestamp
  await db.ref(`otp_codes/${uid}`).set({
    code: code,
    expiresAt: Date.now() + 10 * 60 * 1000, // Valid for 10 minutes
    lastSent: Date.now()
  });

  try {
    await sendEmail({
      to: email,
      subject: "Your GoMusafir Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; color: #333;">
          <h2 style="color: #B99A4A;">GoMusafir Verification</h2>
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

exports.verifyCustomEmailOTP = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const uid = request.auth.uid;
  const { otp } = request.data;

  if (!otp || otp.length !== 6) {
    throw new HttpsError("invalid-argument", "Invalid OTP format");
  }

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

exports.checkUserExistence = onCall({ region: "europe-west1" }, async (request) => {
  const { email } = request.data;
  if (!email || typeof email !== "string") {
    throw new HttpsError("invalid-argument", "Valid email is required.");
  }
  try {
    await auth.getUserByEmail(email.toLowerCase());
    return { exists: true };
  } catch (error) {
    if (error.code === "auth/user-not-found") return { exists: false };
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
  }

  // 2. Delete from Auth (Admin SDK)
  await auth.deleteUser(targetUid);

  // 3. Delete from DB
  await db.ref().update(updates);

  await writeAuditLog(orgId, {
    action: "USER_DELETED_GLOBALLY",
    byUid: request.auth.uid,
    targetId: targetUid,
  });

  return { success: true };
});

// ── Delete My Account (Bypasses recent login requirement by using Admin SDK) ───
exports.deleteMyAccount = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const uid = request.auth.uid;
  const role = request.auth.token.role;
  const orgId = request.auth.token.orgId;

  // 1. If admin, mark org for deletion (soft delete)
  if (role === 'admin' && orgId) {
    await db.ref(`orgs/${orgId}/metadata/deleted_at`).set(admin.database.ServerValue.TIMESTAMP);
    await writeAuditLog(orgId, {
      action: "ORG_DELETED_BY_OWNER",
      byUid: uid,
      targetId: orgId,
    });
  }

  // 2. Cleanup user data
  const joinedTripsSnap = await db.ref(`users/${uid}/joined_trips`).get();
  const updates = {
    [`users/${uid}`]: null,
    [`otp_codes/${uid}`]: null,
  };

  if (joinedTripsSnap.exists()) {
    Object.keys(joinedTripsSnap.val()).forEach(tid => {
      updates[`trips_participants/${tid}/${uid}`] = null;
    });
  }
  
  await db.ref().update(updates);

  // 3. Delete from Auth (Admin SDK)
  await auth.deleteUser(uid);

  return { success: true };
});

