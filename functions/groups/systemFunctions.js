// ─── System Functions ─────────────────────────────────────────────────────────
// Covers: S20 (audit trigger), S22 (log integrity check), daily cleanup cron

const functions = require("firebase-functions/v2");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated } = require("firebase-functions/v2/database");
const { db } = require("../admin");

// ── Audit Logger Trigger ──────────────────────────────────────────────────────
// S20/S22: Triggered on any new write to the logs node.
// Validates the log format and flags tampering if entry already existed.
exports.auditLogger = onValueCreated(
  { ref: "/orgs/{orgId}/logs/{logId}", region: "europe-west1" },
  async (event) => {
    const log = event.data.val();
    if (!log || !log.action || !log.by || !log.timestamp) {
      // Malformed log — flag it in a system alert node
      await db.ref(`system_alerts/malformed_logs/${event.params.logId}`).set({
        orgId: event.params.orgId,
        flaggedAt: Date.now(),
        raw: JSON.stringify(log),
      });
    }
    // S22: The RTDB rule ".write": "!data.exists()" on log nodes prevents overwrites.
    // This function just monitors for malformed entries.
  }
);

// ── Daily Cleanup Cron ────────────────────────────────────────────────────────
// Purges expired invites and old data
exports.dataCleanupCron = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1" },
  async () => {
    const now = Date.now();

    // 1. Remove expired invites using targeted query
    try {
      const invitesSnap = await db.ref("invites").orderByChild("expires_at").endAt(now).once("value");
      if (invitesSnap.exists()) {
        const updates = {};
        invitesSnap.forEach((child) => {
          const invite = child.val();
          if (invite && invite.expires_at && invite.expires_at < now) {
            updates[`invites/${child.key}`] = null;
          }
        });
        if (Object.keys(updates).length > 0) await db.ref().update(updates);
      }
    } catch (e) {
      console.log("Error cleaning up invites:", e.message);
    }
  }
);
// ── Secure Cleanup PII (Maintenance) ──────────────────────────────────────────
// S12/S22: One-off function to encrypt all legacy plaintext PII in the database.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { verifyAppCheck, requireRole } = require("../middleware/appCheckMiddleware");

exports.secureCleanupPII = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireRole(request, ["admin"]); // Only top-level admins can run this

  const { encrypt } = require("../services/kmsService");
  const usersSnap = await db.ref("users").get();
  
  if (!usersSnap.exists()) return { message: "No users found." };

  const updates = {};
  let count = 0;

  usersSnap.forEach((child) => {
    const uid = child.key;
    const userData = child.val();
    
    // Check for plaintext profile
    if (userData.profile && !userData.p_profile) {
      const profile = userData.profile;
      const profileBlob = JSON.stringify({
        firstName: profile.firstName || "",
        lastName: profile.lastName || "",
        phone: profile.phone || "",
        photoURL: profile.photoURL || "",
        email: userData.email || ""
      });
      
      updates[`users/${uid}/p_profile`] = encrypt(profileBlob);
      updates[`users/${uid}/profile`] = null; // Delete plaintext
      
      // Mask full_name
      if (userData.full_name) {
        const parts = userData.full_name.split(" ");
        const masked = parts.map(p => `${p.charAt(0)}***`).join(" ");
        updates[`users/${uid}/full_name`] = masked;
      }
      
      count++;
    }
  });

  if (count > 0) {
    await db.ref().update(updates);
  }

  return { success: true, processedCount: count };
});
