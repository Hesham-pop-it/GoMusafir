// ─── Audit Service ───────────────────────────────────────────────────────────
// S20: All admin/critical actions write an immutable append-only log entry.
// S22: RTDB rule `.write: "!data.exists()"` on each log node ensures no overwrites.

const { db } = require("../admin");
const crypto = require("crypto");

/**
 * Writes an immutable audit log entry under /orgs/{orgId}/logs/{logId}
 * @param {string} orgId
 * @param {object} params - { action, byUid, targetId, ipAddress, extra }
 */
async function writeAuditLog(orgId, { action, byUid, targetId = null, ipAddress = null, extra = {} }) {
  const logRef = db.ref(`orgs/${orgId}/logs`).push();
  const entry = {
    action,
    by: byUid,
    target: targetId,
    ip_hash: ipAddress ? crypto.createHash("sha256").update(ipAddress).digest("hex") : null,
    timestamp: admin.database.ServerValue.TIMESTAMP,
    ...extra,
  };
  // Strip nulls so RTDB rules don't reject missing keys
  Object.keys(entry).forEach((k) => entry[k] === null && delete entry[k]);
  await logRef.set(entry);
}

// Lazy require to avoid circular dep
const { admin } = require("../admin");

module.exports = { writeAuditLog };
