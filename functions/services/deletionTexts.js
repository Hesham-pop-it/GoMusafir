// ─── Texts of the deletion mails and the cancel / restore pages ──────────────
// English only. These texts need product approval before merge. They are kept in
// this one file so they can be reviewed and translated in one place.

const escapeHtml = (value) => String(value == null ? "" : value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const formatDate = (ms) => new Date(ms).toISOString().slice(0, 10);

const wrap = (title, paragraphs, link) => `
  <div style="font-family: Arial, sans-serif; color: #333; max-width: 520px; margin: 0 auto;">
    <h2 style="color: #B99A4A;">${escapeHtml(title)}</h2>
    ${paragraphs.map((p) => `<p>${p}</p>`).join("\n    ")}
    ${link ? `<p><a href="${escapeHtml(link.url)}" style="background: #B99A4A; color: #1A1814; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">${escapeHtml(link.label)}</a></p>` : ""}
  </div>`;

const KEPT = "Payment, invoice and seat records are kept for 7 years as the law requires. Nothing else is kept.";

function accountDeletionRequested({ purgeAfter, cancelUrl }) {
  return {
    subject: "Your GoMusāfir account is scheduled for deletion",
    html: wrap("Account deletion requested", [
      "We received a request to delete your GoMusāfir account. Your account is deactivated and you have been signed out.",
      `Your account and personal data will be deleted permanently on ${formatDate(purgeAfter)}. Until then you can cancel the deletion.`,
      KEPT,
      "If you did not ask for this, cancel the deletion now and change your password.",
    ], { url: cancelUrl, label: "Cancel the deletion" }),
  };
}

function accountDeletionCancelled() {
  return {
    subject: "Your GoMusāfir account deletion was cancelled",
    html: wrap("Deletion cancelled", [
      "The deletion of your GoMusāfir account was cancelled. You can sign in again.",
      "If you did not do this, contact support and change your password.",
    ]),
  };
}

function organizationDeletionRequested({ name, purgeAfter, restoreUrl }) {
  return {
    subject: "Your GoMusāfir organisation is scheduled for deletion",
    html: wrap("Organisation deletion requested", [
      `We received a request to delete the organisation ${escapeHtml(name)}. It is deactivated: the team and the pilgrims can no longer use it.`,
      `Its journeys, chats and files will be deleted permanently on ${formatDate(purgeAfter)}. Until then you can restore the organisation.`,
      KEPT,
      "If you did not ask for this, restore the organisation now and change your password.",
    ], { url: restoreUrl, label: "Restore the organisation" }),
  };
}

function organizationRestored({ name }) {
  return {
    subject: "Your GoMusāfir organisation was restored",
    html: wrap("Organisation restored", [
      `The organisation ${escapeHtml(name)} was restored. The team and the pilgrims need to sign in again.`,
      "If you did not do this, contact support and change your password.",
    ]),
  };
}

// Plain pages served by the cancel and restore links.
const page = (title, body, formAction, buttonLabel) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{font-family:Arial,sans-serif;background:#1A1814;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
main{max-width:420px;padding:24px;text-align:center}h1{color:#B99A4A;font-size:22px}button{background:#B99A4A;color:#1A1814;border:0;border-radius:6px;padding:12px 20px;font-size:16px}</style>
</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>
${formAction ? `<form method="post" action="${escapeHtml(formAction)}"><button type="submit">${escapeHtml(buttonLabel)}</button></form>` : ""}
</main></body></html>`;

const pages = {
  confirmCancelAccount: (action) => page("Cancel account deletion", "Confirm that you want to keep your GoMusāfir account.", action, "Keep my account"),
  accountCancelled: () => page("Deletion cancelled", "Your account is active again. You can sign in to the app."),
  confirmRestoreOrganization: (action) => page("Restore organisation", "Confirm that you want to restore your organisation.", action, "Restore the organisation"),
  organizationRestored: () => page("Organisation restored", "Your organisation is active again. Sign in to the app to continue."),
  invalidLink: () => page("Link not valid", "This link is no longer valid. The deletion may already be cancelled or finished."),
};

module.exports = {
  escapeHtml, formatDate,
  mails: { accountDeletionRequested, accountDeletionCancelled, organizationDeletionRequested, organizationRestored },
  pages,
};
