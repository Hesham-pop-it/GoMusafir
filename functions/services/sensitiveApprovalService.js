// Re-confirmation before sensitive data (F1). A phone approval of any kind, including
// the login approval, or an email code, stamps the user's last approval. Callables that
// return passport or medical data call requireFreshApproval and refuse when the stamp
// is older than 15 minutes. The stamp lives in a server-only node.
const { HttpsError } = require('firebase-functions/v2/https');
const { z } = require('zod');

const FRESH_MS = 15 * 60 * 1000;
const LOGIN_PURPOSE = 'login';
const SENSITIVE_PURPOSES = ['passport_document', 'passport_number', 'medical'];
const AUDIT_ACTIONS = {
  requested: 'SENSITIVE_APPROVAL_REQUESTED',
  granted: 'SENSITIVE_APPROVAL_GRANTED',
  denied: 'SENSITIVE_APPROVAL_DENIED',
  documentOpened: 'SENSITIVE_DOCUMENT_OPENED',
};
const stateRef = (db, uid) => db.ref(`sensitive_approval_state/${uid}`);

const sensitiveRequestSchema = z.object({
  purpose: z.enum(SENSITIVE_PURPOSES),
  browser: z.string().optional(),
});
const normalizePurpose = (value) => (value === undefined || value === LOGIN_PURPOSE ? LOGIN_PURPOSE
  : SENSITIVE_PURPOSES.includes(value) ? value : null);

// Keeps the newest approval; concurrent answers cannot move the stamp backwards.
async function markApproved(db, uid, { purpose = LOGIN_PURPOSE, method = 'phone', now = Date.now() } = {}) {
  await stateRef(db, uid).transaction(cur =>
    (cur && Number.isFinite(cur.last_approved_at) && cur.last_approved_at >= now ? cur
      : { last_approved_at: now, purpose, method }));
}

// Returns the moment the current approval stops being fresh, or null when it already has.
async function freshUntil(db, uid, { now = Date.now(), windowMs = FRESH_MS } = {}) {
  const last = (await stateRef(db, uid).child('last_approved_at').get()).val();
  return Number.isFinite(last) && last + windowMs > now ? last + windowMs : null;
}

// Gate for callables that open a passport, visa, passport number or medical data.
async function requireFreshApproval(db, uid, opts = {}) {
  const until = await freshUntil(db, uid, opts);
  if (until === null) {
    throw new HttpsError('failed-precondition', 'A recent approval on your phone is required.', { reason: 'approval_required' });
  }
  return until;
}

// The organisation an audit entry belongs to: the token claim, else the staff mapping.
async function auditOrgId(db, uid, claim) {
  return claim || (await db.ref(`users/${uid}/staff_org_id`).get()).val() || null;
}

module.exports = {
  FRESH_MS, LOGIN_PURPOSE, SENSITIVE_PURPOSES, AUDIT_ACTIONS, sensitiveRequestSchema,
  normalizePurpose, markApproved, freshUntil, requireFreshApproval, auditOrgId,
};
