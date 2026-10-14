// ─── Deleted Organisation Purge ───────────────────────────────────────────────
// Organisations that only carry metadata/deleted_at keep all their data. This job
// purges them once the 30 day grace period after deleted_at has passed.
//
// NOT EXPORTED from index.js on purpose: turning it on is a developer decision.
// Even when exported it only logs what it would do, unless the environment variable
// ORG_PURGE_ENABLED is exactly "true". Nothing is ever purged before the grace period.
// Safe to re-run: purged orgs are marked metadata/purged_at and skipped, and every step is idempotent.
// Payments, Stripe ids, prepaid seats, consents and audit logs are never deleted.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getAccountCleanup, runOrganizationPurge } = require("../services/accountCleanupService");

exports.purgeDeletedOrganizations = onSchedule(
  { schedule: "every 24 hours", region: "europe-west1" },
  async () => {
    const result = await runOrganizationPurge(getAccountCleanup(), { enabled: process.env.ORG_PURGE_ENABLED === "true" });
    console.log("purgeDeletedOrganizations", JSON.stringify(result));
  }
);
