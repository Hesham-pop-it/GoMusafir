// ─── Account and organisation deletion (request, cancel, restore, purge) ─────
// deleteMyAccount and deleteOrganization are requests: they deactivate at once and
// queue the real deletion for 30 days later. Until then the person can cancel with the
// link in the confirmation mail. The wipe itself is accountCleanupService.
//
// Queues (server-only nodes, indexed by purge_after):
//   account_deletions/{uid}  { requested_at, purge_after, token_hash, org_id }
//   org_deletions/{orgId}    written by accountCleanupService.markOrganizationDeleted
// Audit: orgs/{org}/logs through writeAuditLog, plus deletion_audit for every event.
// Only uids, org ids and hashes are logged; the cancel token is stored as a hash.
//
// Dependencies are injected so the logic is unit-testable.

const crypto = require("crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { mails } = require("./deletionTexts");

const DAY = 24 * 60 * 60 * 1000;
const GRACE_MS = 30 * DAY;
const REAUTH_MS = 5 * 60 * 1000;
const STAFF_ROLES = ["admin", "co-host", "manager"];
const PURGE_BATCH = 200;

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const sameHash = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const invalidLink = () => new HttpsError("not-found", "This link is no longer valid.");

function createDeletionService({
  db, auth, cleanup, sendEmail, writeAuditLog, findActiveJourneys, revokeSessions,
  linkBase, now = () => Date.now(), newToken = () => crypto.randomBytes(32).toString("hex"),
}) {
  const val = async (path) => {
    const snap = await db.ref(path).get();
    return snap.exists() ? snap.val() : null;
  };

  // ── Audit ───────────────────────────────────────────────────────────────────
  // Every event goes to deletion_audit (server-only) and, when an organisation is
  // involved, to that organisation's append-only log. A failing log never blocks the flow.
  async function audit(event, { uid = null, orgId = null, by = null, ip = null, extra = {} } = {}) {
    const entry = { event, uid, org_id: orgId, by, at: now(), ip_hash: ip ? sha256(ip) : null, ...extra };
    Object.keys(entry).forEach((k) => (entry[k] === null || entry[k] === undefined) && delete entry[k]);
    try {
      await db.ref("deletion_audit").push(entry);
    } catch (e) {
      console.error("deletion_audit write failed", { event, message: e.message });
    }
    if (orgId) {
      try {
        await writeAuditLog(orgId, { action: event, byUid: by || uid, targetId: orgId, ipAddress: ip, extra });
      } catch (e) {
        console.error("org audit write failed", { event, orgId, message: e.message });
      }
    }
  }

  // Mail failures are reported to the caller; the caller decides whether to roll back.
  async function mail(to, { subject, html }) {
    await sendEmail({ to, subject, html });
  }

  async function emailOf(uid) {
    try {
      return (await auth.getUser(uid)).email || null;
    } catch (e) {
      if (e.code === "auth/user-not-found") return null;
      throw e;
    }
  }

  // ── Re-authentication ───────────────────────────────────────────────────────
  // A sign-in within the last 5 minutes (password, Google, Apple), or a one-time email code
  // verified within the last 5 minutes (participants). The code stamp is used up by the request.
  async function requireRecentAuth(uid, authTimeSeconds) {
    const t = now();
    if (Number.isFinite(authTimeSeconds) && t - authTimeSeconds * 1000 <= REAUTH_MS) return;
    const stamp = await val(`deletion_reauth/${uid}`);
    if (stamp && typeof stamp.at === "number" && t - stamp.at <= REAUTH_MS) {
      await db.ref(`deletion_reauth/${uid}`).remove();
      return;
    }
    throw new HttpsError("failed-precondition", "Please re-authenticate to confirm your identity before deleting.", { reason: "reauth-required" });
  }

  async function stampEmailCodeVerified(uid) {
    await db.ref(`deletion_reauth/${uid}`).set({ at: now() });
  }

  // ── Organisations owned by a user ───────────────────────────────────────────
  async function ownedOrganizations(uid, claimOrgId) {
    const candidates = new Set([claimOrgId, await val(`users/${uid}/staff_org_id`)].filter(Boolean));
    const owned = [];
    for (const orgId of candidates) {
      if ((await val(`orgs/${orgId}/staff/${uid}`)) === "admin") owned.push(orgId);
    }
    return owned;
  }

  async function organizationsOf(uid, claimOrgId) {
    const ids = new Set([claimOrgId, await val(`users/${uid}/staff_org_id`)].filter(Boolean));
    const joined = (await val(`users/${uid}/joined_trips`)) || {};
    for (const tripId of Object.keys(joined)) {
      const orgId = (joined[tripId] && (joined[tripId].org_id || joined[tripId].orgId)) || (await val(`trips_orgs/${tripId}`));
      if (orgId) ids.add(orgId);
    }
    return [...ids];
  }

  // ── Account: request ────────────────────────────────────────────────────────
  async function requestAccountDeletion({ uid, claimOrgId = null, authTime, ip = null }) {
    const existing = await val(`account_deletions/${uid}`);
    if (existing) return { success: true, purge_after: existing.purge_after, already_requested: true };

    await requireRecentAuth(uid, authTime);

    // An owner must delete or hand over the organisation first (decision 1).
    const owned = await ownedOrganizations(uid, claimOrgId);
    if (owned.length) {
      await audit("ACCOUNT_DELETE_BLOCKED", { uid, orgId: owned[0], by: uid, ip, extra: { reason: "owns-organization" } });
      throw new HttpsError("failed-precondition",
        "You own an organisation. Delete it or hand it over before you delete your account.",
        { reason: "owns-organization", orgId: owned[0] });
    }

    const requestedAt = now();
    const purgeAfter = requestedAt + GRACE_MS;
    const token = newToken();
    const orgIds = await organizationsOf(uid, claimOrgId);
    const staffOrgId = (await val(`users/${uid}/staff_org_id`)) || claimOrgId || null;
    await db.ref(`account_deletions/${uid}`).set({
      requested_at: requestedAt, purge_after: purgeAfter, token_hash: sha256(token), org_id: staffOrgId,
    });

    // The mail comes first: if it cannot be sent nothing has been deactivated and the person can retry.
    const email = await emailOf(uid);
    if (email) {
      try {
        await mail(email, mails.accountDeletionRequested({
          purgeAfter, cancelUrl: `${linkBase}/cancelAccountDeletion?uid=${encodeURIComponent(uid)}&token=${token}`,
        }));
      } catch (e) {
        await db.ref(`account_deletions/${uid}`).remove();
        console.error("Deletion confirmation mail failed", { uid, message: e.message });
        throw new HttpsError("internal", "We couldn't send the confirmation email, so nothing was changed. Please try again.");
      }
    }

    await auth.updateUser(uid, { disabled: true });
    await revokeSessions(uid);
    await db.ref(`deletion_reauth/${uid}`).remove();

    await audit("ACCOUNT_DELETE_REQUESTED", { uid, by: uid, ip, extra: { purge_after: purgeAfter } });
    for (const orgId of orgIds) await audit("ACCOUNT_DELETE_REQUESTED", { uid, orgId, by: uid, ip });
    await audit(email ? "ACCOUNT_DELETE_MAILED" : "ACCOUNT_DELETE_MAIL_SKIPPED", { uid, by: uid });
    return { success: true, purge_after: purgeAfter };
  }

  // ── Account: cancel (from the mailed link) ─────────────────────────────────
  async function cancelAccountDeletion({ uid, token, ip = null }) {
    if (typeof uid !== "string" || !uid || typeof token !== "string" || token.length < 32) throw invalidLink();
    const entry = await val(`account_deletions/${uid}`);
    if (!entry || !sameHash(entry.token_hash, sha256(token)) || now() > entry.purge_after) throw invalidLink();

    await auth.updateUser(uid, { disabled: false });
    await db.ref(`account_deletions/${uid}`).remove();
    await audit("ACCOUNT_DELETE_CANCELLED", { uid, by: uid, ip });
    const email = await emailOf(uid);
    if (email) {
      try {
        await mail(email, mails.accountDeletionCancelled());
        await audit("ACCOUNT_DELETE_CANCEL_MAILED", { uid, by: uid });
      } catch (e) {
        console.error("Cancel confirmation mail failed", { uid, message: e.message });
      }
    }
    return { success: true };
  }

  // The link must name a live request; used to decide between the confirm page and the invalid page.
  async function isAccountLinkValid(uid, token) {
    if (typeof uid !== "string" || !uid || typeof token !== "string" || token.length < 32) return false;
    const entry = await val(`account_deletions/${uid}`);
    return !!entry && sameHash(entry.token_hash, sha256(token)) && now() <= entry.purge_after;
  }

  // ── Account: purge ──────────────────────────────────────────────────────────
  // `force` skips the waiting period: only the audited GDPR script passes it.
  async function purgeAccount(uid, { force = false, actor = null } = {}) {
    const entry = await val(`account_deletions/${uid}`);
    if (!entry) return { uid, status: "not-queued" };
    if (!force && entry.purge_after > now()) return { uid, status: "not-due" };

    // Nobody who still owns an organisation is wiped: the organisation purge removes the staff record first.
    const owned = await ownedOrganizations(uid, entry.org_id);
    if (owned.length) {
      await audit("ACCOUNT_PURGE_BLOCKED", { uid, orgId: owned[0], by: actor, extra: { reason: "owns-organization" } });
      return { uid, status: "blocked" };
    }
    const orgIds = await organizationsOf(uid, entry.org_id);
    await cleanup.removeUserCompletely(uid, { staffOrgId: entry.org_id });
    try {
      await auth.deleteUser(uid);
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
    }
    await db.ref(`account_deletions/${uid}`).remove();
    await db.ref(`deletion_reauth/${uid}`).remove();
    await audit(force ? "ACCOUNT_PURGED_EARLY" : "ACCOUNT_PURGED", { uid, by: actor, extra: { orgs: orgIds.length } });
    for (const orgId of orgIds) await audit(force ? "ACCOUNT_PURGED_EARLY" : "ACCOUNT_PURGED", { uid, orgId, by: actor });
    return { uid, status: "purged" };
  }

  // ── Account: earlier deletion under the GDPR ───────────────────────────────
  // Only the audited developer script (scripts/eraseAccountNow.js) calls this, on a support
  // request. There is no button in the app (decision 2). It deactivates the account, skips
  // the 30 days and runs the same wipe as the daily job; the legal data is kept the same way.
  async function eraseAccountNow(uid, { actor, reason, ticket }) {
    if (!actor || !reason || !ticket) throw new Error("actor, reason and ticket are required");
    if (!(await val(`account_deletions/${uid}`))) {
      const claimOrg = (await auth.getUser(uid)).customClaims?.orgId || null;
      const owned = await ownedOrganizations(uid, claimOrg);
      if (owned.length) {
        await audit("ACCOUNT_PURGE_BLOCKED", { uid, orgId: owned[0], by: actor, extra: { reason: "owns-organization", ticket } });
        return { uid, status: "blocked" };
      }
      await db.ref(`account_deletions/${uid}`).set({
        requested_at: now(), purge_after: now(), token_hash: sha256(newToken()),
        org_id: (await val(`users/${uid}/staff_org_id`)) || claimOrg,
      });
      await auth.updateUser(uid, { disabled: true });
      await revokeSessions(uid);
    }
    await audit("ACCOUNT_ERASE_EARLY_REQUESTED", { uid, by: actor, extra: { reason, ticket } });
    return purgeAccount(uid, { force: true, actor });
  }

  // Daily job: an indexed, bounded read of the queue. Failures stay queued for the next run.
  async function purgeDueAccounts({ limit = PURGE_BATCH } = {}) {
    const snap = await db.ref("account_deletions").orderByChild("purge_after").endAt(now()).limitToFirst(limit).get();
    const result = { due: [], purged: [], blocked: [], failed: [] };
    if (!snap.exists()) return result;
    snap.forEach((child) => { result.due.push(child.key); });
    for (const uid of result.due) {
      try {
        const out = await purgeAccount(uid);
        if (out.status === "purged") result.purged.push(uid);
        else if (out.status === "blocked") result.blocked.push(uid);
      } catch (e) {
        console.error("Account purge failed", { uid, message: e.message });
        result.failed.push(uid);
      }
    }
    return result;
  }

  // ── Organisation: request ───────────────────────────────────────────────────
  async function requestOrganizationDeletion({ uid, orgId, confirmName, authTime, ip = null }) {
    if (!orgId) throw new HttpsError("failed-precondition", "No organisation found for this account.");
    // The token claim can be stale: the staff record is the source of truth.
    if ((await val(`orgs/${orgId}/staff/${uid}`)) !== "admin") {
      throw new HttpsError("permission-denied", "Only the owner can delete the organisation.");
    }
    const meta = (await val(`orgs/${orgId}/metadata`)) || {};
    if (typeof meta.deleted_at === "number") {
      return { success: true, purge_after: meta.purge_after, already_requested: true };
    }
    if (typeof confirmName !== "string" || !confirmName.trim()) {
      throw new HttpsError("failed-precondition", "Type the full name of the organisation to confirm.", { reason: "confirm-name-required" });
    }
    if (confirmName.trim() !== String(meta.name || "").trim()) {
      throw new HttpsError("failed-precondition", "The name you typed does not match the organisation.", { reason: "name-mismatch" });
    }
    await requireRecentAuth(uid, authTime);

    const journeys = await findActiveJourneys(db, orgId, now());
    if (journeys.length) {
      await audit("ORG_DELETE_BLOCKED", { uid, orgId, by: uid, ip, extra: { reason: "active-journeys", journeys: journeys.length } });
      throw new HttpsError("failed-precondition",
        "This organisation has active or upcoming journeys. End or delete them first.",
        { reason: "active-journeys", journeys });
    }

    const requestedAt = now();
    const purgeAfter = requestedAt + GRACE_MS;
    const token = newToken();
    const email = await emailOf(uid);
    if (email) {
      try {
        await mail(email, mails.organizationDeletionRequested({
          name: meta.name, purgeAfter,
          restoreUrl: `${linkBase}/restoreOrganizationByLink?org=${encodeURIComponent(orgId)}&token=${token}`,
        }));
      } catch (e) {
        console.error("Deletion confirmation mail failed", { orgId, message: e.message });
        throw new HttpsError("internal", "We couldn't send the confirmation email, so nothing was changed. Please try again.");
      }
    }
    await cleanup.markOrganizationDeleted(orgId, { at: requestedAt, by: uid, purgeAfter, tokenHash: sha256(token) });
    await cleanup.revokeMany(await cleanup.organizationMembers(orgId));
    await audit("ORG_DELETE_REQUESTED", { uid, orgId, by: uid, ip, extra: { purge_after: purgeAfter } });
    await audit(email ? "ORG_DELETE_MAILED" : "ORG_DELETE_MAIL_SKIPPED", { uid, orgId, by: uid });
    return { success: true, purge_after: purgeAfter };
  }

  // ── Organisation: restore (owner in the app, or the mailed link) ───────────
  async function restoreOrganization({ orgId, uid = null, token = null, ip = null }) {
    if (typeof orgId !== "string" || !orgId) throw invalidLink();
    const meta = (await val(`orgs/${orgId}/metadata`)) || {};
    const queue = await val(`org_deletions/${orgId}`);
    if (typeof meta.deleted_at !== "number" || meta.purged_at || !queue || now() > queue.purge_after) {
      throw new HttpsError("failed-precondition", "This organisation is not scheduled for deletion.", { reason: "not-deleted" });
    }
    let by;
    if (uid) {
      if ((await val(`orgs/${orgId}/staff/${uid}`)) !== "admin") {
        throw new HttpsError("permission-denied", "Only the owner can restore the organisation.");
      }
      by = uid;
    } else {
      if (typeof token !== "string" || token.length < 32 || !sameHash(queue.token_hash, sha256(token))) throw invalidLink();
      by = meta.deleted_by || null;
    }
    await cleanup.restoreOrganization(orgId);
    await audit("ORG_RESTORED", { uid: by, orgId, by, ip, extra: { via: uid ? "app" : "link" } });
    const ownerUid = meta.admin_uid || by;
    const email = ownerUid ? await emailOf(ownerUid) : null;
    if (email) {
      try {
        await mail(email, mails.organizationRestored({ name: meta.name }));
        await audit("ORG_RESTORE_MAILED", { orgId, by });
      } catch (e) {
        console.error("Restore confirmation mail failed", { orgId, message: e.message });
      }
    }
    return { success: true };
  }

  async function isOrganizationLinkValid(orgId, token) {
    if (typeof orgId !== "string" || !orgId || typeof token !== "string" || token.length < 32) return false;
    const queue = await val(`org_deletions/${orgId}`);
    return !!queue && sameHash(queue.token_hash, sha256(token)) && now() <= queue.purge_after;
  }

  // What the app needs after sign-in to show the restore screen.
  async function organizationDeletionStatus({ uid, orgId }) {
    if (!orgId) return { organization: null };
    const meta = (await val(`orgs/${orgId}/metadata`)) || {};
    if (typeof meta.deleted_at !== "number") return { organization: null };
    return { organization: {
      orgId, name: meta.name || "", deleted_at: meta.deleted_at, purge_after: meta.purge_after || null,
      is_owner: (await val(`orgs/${orgId}/staff/${uid}`)) === "admin",
    } };
  }

  return {
    requestAccountDeletion, cancelAccountDeletion, isAccountLinkValid, purgeAccount, purgeDueAccounts, eraseAccountNow,
    requestOrganizationDeletion, restoreOrganization, isOrganizationLinkValid, organizationDeletionStatus,
    stampEmailCodeVerified, requireRecentAuth, audit,
  };
}

// Default instance bound to the real services. Created lazily so tests can load this file without Firebase.
let shared;
function getDeletionService() {
  if (!shared) {
    const { db, auth } = require("../admin");
    const { getAccountCleanup } = require("./accountCleanupService");
    const { sendEmail } = require("./emailService");
    const { writeAuditLog } = require("./auditService");
    const { findActiveJourneys } = require("./activeJourneys");
    const { revokeUserSessions } = require("./participantAccessService");
    const project = process.env.GCLOUD_PROJECT || "go-musafir";
    shared = createDeletionService({
      db, auth, cleanup: getAccountCleanup(), sendEmail, writeAuditLog, findActiveJourneys,
      revokeSessions: revokeUserSessions,
      linkBase: process.env.DELETION_LINK_BASE || `https://europe-west1-${project}.cloudfunctions.net`,
    });
  }
  return shared;
}

module.exports = { createDeletionService, getDeletionService, GRACE_MS, REAUTH_MS, STAFF_ROLES };
