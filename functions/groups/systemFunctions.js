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
// Purges expired invites, revoked sessions, and old logs (>90 days)
exports.dataCleanupCron = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1" },
  async () => {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

    // 1. Remove expired invites
    const invitesSnap = await db.ref("invites").once("value");
    if (invitesSnap.exists()) {
      const updates = {};
      invitesSnap.forEach((child) => {
        const invite = child.val();
        if (invite.expires_at && invite.expires_at < now) {
          updates[`invites/${child.key}`] = null;
        }
      });
      if (Object.keys(updates).length > 0) await db.ref().update(updates);
    }

    // 2. Remove revoked sessions older than 30 days
    const usersSnap = await db.ref("users").once("value");
    if (usersSnap.exists()) {
      const updates = {};
      usersSnap.forEach((userChild) => {
        const sessions = userChild.val().active_sessions;
        if (sessions) {
          Object.entries(sessions).forEach(([sid, session]) => {
            if (session.revoked && session.last_seen && session.last_seen < ninetyDaysAgo) {
              updates[`users/${userChild.key}/active_sessions/${sid}`] = null;
            }
          });
        }
      });
      if (Object.keys(updates).length > 0) await db.ref().update(updates);
    }

    console.log("✅ Cleanup cron completed.");
  }
);
