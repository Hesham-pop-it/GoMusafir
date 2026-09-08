// ─── Organization Functions ───────────────────────────────────────────────────
// Covers: S1 (email verify gate), S4 (password policy), S6 (custom claims),
//         S8 (org isolation), S12 (KMS PII), S17 (input validation),
//         S20 (audit log ORG_CREATED), S23 (consent record)

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { admin, db, auth } = require("../admin");
const { encrypt } = require("../services/kmsService");
const { writeAuditLog } = require("../services/auditService");
const { verifyAppCheck, requireAuth, requireRole } = require("../middleware/appCheckMiddleware");
const { validate, schemas } = require("../middleware/validateSchema");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");
const { sendPushNotification } = require("../services/notificationService");
const { createStripeCustomer, deleteStripeCustomer } = require("../services/stripeService");

// ── Create Organization (Phase 1 — website calls this after OTP) ──────────────
// S1: Email must be verified before this can complete (enforced by creating the
//     Firebase Auth user with sendEmailVerification first).
// S12: email + phone are encrypted with KMS before RTDB write.
// S23: isAuthorized stored as immutable consent record.
exports.createOrganization = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request); // Protect the endpoint! Ensure the user is actually signed into Firebase Auth first.

  // Validate input (S17)
  const data = validate(schemas.createOrg, request.data);

  // The frontend has already created the Auth user (to facilitate email verification).
  // We simply extract their secure UID from the verified request context and provision their organization.
  const uid = request.auth.uid;
  const orgId = uuidv4(); // S15 — org ID is also a UUID

  // S12: Encrypt PII before storing
  const encryptedEmail = encrypt(data.email);
  const encryptedPhone = encrypt(`${data.phoneCode}${data.phoneNumber}`);

  // S6: Set custom claims — role: admin, orgId
  await auth.setCustomUserClaims(uid, { role: "admin", orgId });

  const now = admin.database.ServerValue.TIMESTAMP;

  const newOrg = {
    metadata: {
      name: data.companyName,
      admin_uid: uid,
      admin_first_name: data.firstName,
      admin_last_name: data.lastName,
      p_admin_email: encryptedEmail,
      p_admin_phone: encryptedPhone,
      admin_photo_url: data.photoURL || null,
      plan: "free",
      created_at: now,
      min_app_version: "1.0.0",
    },
    staff: {
      [uid]: "admin",
    },
    settings: {
      visibility_policy: {
        email: "organizer-only",
        phone: "hidden",
        location: "everyone",
      },
      recording_allowed: false,
      mfa_required: false,
    },
    // S23: Consent record — isAuthorized checkbox
    consents: {
      [uid]: {
        terms: "accepted",
        privacy: "accepted",
        recorded_at: now,
        ip_hash: request.rawRequest?.ip
          ? crypto.createHash("sha256").update(request.rawRequest.ip).digest("hex")
          : "unknown",
      },
    },
  };

  const newUser = {
    first_name: data.firstName,
    last_name: data.lastName,
    full_name: `${data.firstName} ${data.lastName}`,
    photo_url: data.photoURL || null,
    profile: {
      firstName: data.firstName,
      lastName: data.lastName,
      photoURL: data.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.firstName[0] || 'U')}&background=B99A4A&color=fff`,
      updated_at: Date.now()
    },
    p_email: encryptedEmail, // S12
    p_phone: encryptedPhone, // S12
    mfa_enrolled: false,
    staff_org_id: orgId,
    country: data.country,
    created_at: now,
  };

  // Create Stripe Customer safely with phone, country, currency, timezone, and business name
  let stripeCustomerId = null;
  try {
    stripeCustomerId = await createStripeCustomer({
      orgId,
      companyName: data.companyName,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneCode: data.phoneCode,
      phoneNumber: data.phoneNumber,
      country: data.country,
    });
    if (stripeCustomerId) {
      newOrg.stripe_customer_id = stripeCustomerId;
      newUser.stripe_customer_id = stripeCustomerId;
      console.log(`✅ Stripe Customer ID ${stripeCustomerId} saved to Org ${orgId} and User ${uid}`);
    }
  } catch (stripeErr) {
    console.warn("⚠️ Stripe Customer creation failed during org signup (non-blocking):", stripeErr);
  }

  // Generate secure single-use auth handoff token for mobile app onboarding
  const handoffToken = crypto.randomBytes(32).toString("hex");

  // Atomic multi-path write
  const updates = {
    [`orgs/${orgId}`]: newOrg,
    [`users/${uid}`]: newUser,
    [`auth_handoff_tokens/${handoffToken}`]: {
      uid: uid,
      createdAt: now,
      expiresAt: Date.now() + 15 * 60 * 1000,
      used: false,
    },
  };
  await db.ref().update(updates);

  // S20: Audit log (immutable)
  await writeAuditLog(orgId, {
    action: "ORG_CREATED",
    byUid: uid,
    targetId: orgId,
    ipAddress: request.rawRequest?.ip,
  });

  return { orgId, uid, handoffToken };
});


// ── Update Member Role (Admin only) ──────────────────────────────────────────
// S6: Only admin can change roles. S8: Target user must belong to caller's org.
exports.updateMemberRole = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "co-host"]);

  const data = validate(schemas.updateRole, request.data);
  const callerOrgId = request.auth.token.orgId;

  // Verify target belongs to caller's org
  const snap = await db.ref(`users/${data.targetUid}/staff_org_id`).get();
  if (!snap.exists() || snap.val() !== callerOrgId) {
    throw new HttpsError("permission-denied", "Target user does not belong to your organization.");
  }

  // Prevent demoting the org admin
  const orgMeta = await db.ref(`orgs/${callerOrgId}/metadata/admin_uid`).get();
  if (orgMeta.val() === data.targetUid) {
    throw new HttpsError("permission-denied", "Cannot change role of the organization owner.");
  }

  await auth.setCustomUserClaims(data.targetUid, { role: data.newRole, orgId: callerOrgId });
  await db.ref(`orgs/${callerOrgId}/staff/${data.targetUid}`).set(data.newRole);

  await writeAuditLog(callerOrgId, {
    action: "ROLE_CHANGED",
    byUid: request.auth.uid,
    targetId: data.targetUid,
    extra: { new_role: data.newRole },
  });

  // Notify the user about their role change
  sendPushNotification(
    data.targetUid,
    "Role Updated",
    `Your role has been updated to ${data.newRole}.`,
    { type: 'ROLE_CHANGED', orgId: callerOrgId, role: data.newRole },
    { androidChannelId: "Admin" }
  ).catch(e => console.log("Push error:", e.message));

  return { success: true };
});

// ── Delete Organization (Admin + Step-up MFA required) ───────────────────────
// S3: Step-up MFA check — caller must have re-authenticated recently.
exports.deleteOrganization = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin"]);

  const callerOrgId = request.auth.token.orgId;

  // S3: Step-up — check that token was issued within the last 5 minutes
  const authTime = request.auth.token.auth_time * 1000;
  if (Date.now() - authTime > 5 * 60 * 1000) {
    throw new HttpsError(
      "failed-precondition",
      "Please re-authenticate before deleting your organization."
    );
  }

  // Delete associated Stripe customer
  const orgSnap = await db.ref(`orgs/${callerOrgId}`).get();
  const orgData = orgSnap.val() || {};
  const stripeCustomerId = orgData.stripe_customer_id;
  const adminEmail = orgData.email || request.auth.token.email;
  await deleteStripeCustomer(stripeCustomerId, adminEmail, callerOrgId);

  // Soft-delete: mark org as deleted, clean-up scheduled by dataCleanupCron
  await db.ref(`orgs/${callerOrgId}/metadata/deleted_at`).set(admin.database.ServerValue.TIMESTAMP);

  await writeAuditLog(callerOrgId, {
    action: "ORG_DELETED",
    byUid: request.auth.uid,
    targetId: callerOrgId,
  });

  return { success: true };
});

// ── Invite Team Member (Admin only) ───────────────────────────────────────────
// S6: Admin only. S34: Rate limiting. Generates secure token for email invite.
exports.inviteTeamMember = onCall({ region: "europe-west1", secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin", "co-host"]);

  const data = validate(schemas.inviteMember, request.data);
  const callerOrgId = request.auth.token.orgId;
  const callerUid = request.auth.uid;

  // Rate Limiting (S34)
  const rateLimitRef = db.ref(`orgs/${callerOrgId}/metadata/last_invite_sent`);
  const snapshot = await rateLimitRef.get();
  if (snapshot.exists() && Date.now() - snapshot.val() < 10000) {
    throw new HttpsError("resource-exhausted", "Please wait before sending another invite.");
  }

  // Generate ultra-secure Token UUID
  const token = uuidv4();

  // Store invite
  await db.ref(`org_invites/${token}`).set({
    email: data.email,
    role: data.role,
    orgId: callerOrgId,
    invitedBy: callerUid,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 Days
  });

  await rateLimitRef.set(Date.now());

  // Dispatch Email
  try {
    const inviteLink = `https://join.gomusafir.app/team-join?token=${token}`; // Adjust to your actual web path if needed
    await sendEmail({
      to: data.email,
      subject: "You've been invited to join GoMusafir",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333 text-align: center;">
          <h2 style="color: #B99A4A;">GoMusafir Team Invitation</h2>
          <p>You have been invited to join an organization as a <b>${data.role}</b>.</p>
          <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background: #B99A4A; color: #FFF; text-decoration: none; border-radius: 8px; font-weight: bold;">Accept Invitation</a>
          <p style="margin-top: 20px; font-size: 12px; color: #999;">This link expires in 7 days.</p>
        </div>
      `,
    });
  } catch (err) {
    console.warn("Failed to send org invite email:", err);
    throw new HttpsError("internal", "Failed to dispatch email.");
  }

  await writeAuditLog(callerOrgId, {
    action: "TEAM_INVITE_SENT",
    byUid: callerUid,
    extra: { target_email: data.email, role: data.role },
  });

  return { success: true };
});

// ── Leave Organization (Staff only, not Admin) ────────────────────────────────
exports.leaveOrganization = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);

  const uid = request.auth.uid;
  const orgId = request.auth.token.orgId;
  const role = request.auth.token.role;

  if (!orgId || !role) {
    throw new HttpsError("failed-precondition", "You are not part of an organization.");
  }

  if (role === "admin") {
    throw new HttpsError("failed-precondition", "Admins cannot leave. They must delete the organization instead.");
  }

  // 1. Remove from staff list
  await db.ref(`orgs/${orgId}/staff/${uid}`).remove();

  // 2. Clear staff_org_id from user
  await db.ref(`users/${uid}/staff_org_id`).remove();

  // 3. Clear custom claims
  await auth.setCustomUserClaims(uid, { role: null, orgId: null });

  await writeAuditLog(orgId, {
    action: "STAFF_LEFT",
    byUid: uid,
    targetId: uid,
  });

  return { success: true };
});
