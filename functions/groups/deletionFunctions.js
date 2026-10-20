// ─── Deletion: cancel and restore links, restore callable, daily account purge ──
// The request side lives in deleteMyAccount (authFunctions) and deleteOrganization
// (orgFunctions). Both only deactivate; the wipe happens after the 30 day grace period.

const { onCall } = require("../middleware/participantAccessMiddleware");
const { onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db } = require("../admin");
const { verifyAppCheck, requireAuth } = require("../middleware/appCheckMiddleware");
const { getDeletionService } = require("../services/deletionService");
const { pages } = require("../services/deletionTexts");

const REGION = "europe-west1";

const secureHeaders = (res) => res.set({
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
});

// A mail scanner may open the link, so GET only shows a confirm page; the POST does the work.
function linkHandler({ params, isValid, perform, confirmPage, donePage }) {
  return async (req, res) => {
    secureHeaders(res);
    const { values, query } = params(req);
    try {
      if (req.method === "GET" || req.method === "HEAD") {
        if (!(await isValid(...values))) return res.status(404).send(pages.invalidLink());
        return res.status(200).send(confirmPage(`?${query}`));
      }
      if (req.method !== "POST") return res.status(405).send(pages.invalidLink());
      await perform(...values, req.ip);
      return res.status(200).send(donePage());
    } catch (error) {
      if (error instanceof HttpsError && error.code !== "internal") return res.status(404).send(pages.invalidLink());
      console.error("Deletion link failed", { message: error.message });
      return res.status(500).send(pages.invalidLink());
    }
  };
}

const text = (v) => (typeof v === "string" ? v.slice(0, 200) : "");

// One-time link in the account deletion mail.
const cancelAccountDeletionHandler = linkHandler({
  params: (req) => {
    const uid = text(req.query.uid); const token = text(req.query.token);
    return { values: [uid, token], query: `uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}` };
  },
  isValid: (uid, token) => getDeletionService().isAccountLinkValid(uid, token),
  perform: (uid, token, ip) => getDeletionService().cancelAccountDeletion({ uid, token, ip }),
  confirmPage: pages.confirmCancelAccount,
  donePage: pages.accountCancelled,
});
exports.cancelAccountDeletion = onRequest(
  { region: REGION, secrets: ["SENDGRID_API_KEY"], cors: false },
  cancelAccountDeletionHandler
);

// One-time link in the organisation deletion mail.
const restoreOrganizationLinkHandler = linkHandler({
  params: (req) => {
    const org = text(req.query.org); const token = text(req.query.token);
    return { values: [org, token], query: `org=${encodeURIComponent(org)}&token=${encodeURIComponent(token)}` };
  },
  isValid: (orgId, token) => getDeletionService().isOrganizationLinkValid(orgId, token),
  perform: (orgId, token, ip) => getDeletionService().restoreOrganization({ orgId, token, ip }),
  confirmPage: pages.confirmRestoreOrganization,
  donePage: pages.organizationRestored,
});
exports.restoreOrganizationByLink = onRequest(
  { region: REGION, secrets: ["SENDGRID_API_KEY"], cors: false },
  restoreOrganizationLinkHandler
);

// The organisation of the caller: the token claim, or the staff link on the account (claims can be stale).
async function callerOrgId(request) {
  return request.auth.token.orgId || (await db.ref(`users/${request.auth.uid}/staff_org_id`).get()).val() || null;
}

// Owner restores in the app. Enrollment-class: a deactivated organisation fails the normal
// access check, and the owner must be able to reach this after signing in again.
exports.restoreOrganization = onCall({ enrollment: true, region: REGION, secrets: ["SENDGRID_API_KEY"] }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);
  const orgId = await callerOrgId(request);
  return getDeletionService().restoreOrganization({ orgId, uid: request.auth.uid, ip: request.rawRequest?.ip });
});

// Tells the app after sign-in whether the caller's organisation is scheduled for deletion.
exports.getDeletionStatus = onCall({ enrollment: true, region: REGION }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);
  return getDeletionService().organizationDeletionStatus({ uid: request.auth.uid, orgId: await callerOrgId(request) });
});

// Daily: wipe the accounts whose 30 days are over. An indexed, bounded read of account_deletions.
exports.purgeDeletedAccounts = onSchedule(
  { schedule: "every 24 hours", region: REGION, secrets: ["SENDGRID_API_KEY"], timeoutSeconds: 540 },
  async () => {
    const result = await getDeletionService().purgeDueAccounts();
    console.log("purgeDeletedAccounts", JSON.stringify({ due: result.due.length, purged: result.purged.length, blocked: result.blocked.length, failed: result.failed.length }));
  }
);

exports._handlers = { cancelAccountDeletionHandler, restoreOrganizationLinkHandler };
