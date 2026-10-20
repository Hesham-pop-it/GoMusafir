// ─── Deleted Organisation Purge ───────────────────────────────────────────────
// Organisations in the org_deletions queue keep all their data for 30 days (their
// purge_after). This daily job purges the ones whose time has passed: an indexed read
// of the queue, at most 50 organisations per run.
//
// The job is exported, but it only logs what it would do unless the environment variable
// ORG_PURGE_ENABLED is exactly "true". It is off by default; the developers switch it on at
// deploy, after one dry run. Nothing is ever purged before purge_after.
// Safe to re-run: purged orgs leave the queue and are marked metadata/purged_at, and every step is idempotent.
// Payments, Stripe ids, prepaid seats, consents and audit logs are never deleted.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getAccountCleanup, runOrganizationPurge } = require("../services/accountCleanupService");

exports.purgeDeletedOrganizations = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1", timeoutSeconds: 540 },
  async () => {
    const result = await runOrganizationPurge(getAccountCleanup(), { enabled: process.env.ORG_PURGE_ENABLED === "true" });
    console.log("purgeDeletedOrganizations", JSON.stringify(result));
  }
);
