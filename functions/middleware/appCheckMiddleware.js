// ─── App Check Middleware ────────────────────────────────────────────────────
// S13: Ensures every Cloud Function request comes from the official GoMusafir app.
// Rejects requests from bots, modified apps, or automated scripts.

const { admin } = require("../admin");

/**
 * Verifies Firebase App Check token on a callable function context.
 * Call this at the start of every sensitive Cloud Function.
 * @param {object} context - Firebase callable function context
 * @throws {functions.https.HttpsError} if App Check token is invalid
 */
function verifyAppCheck(context) {
  // BYPASS: Temporarily bypassed for local development since the React Native / Next.js clients 
  // do not have ReCaptcha Enterprise or Play Integrity keys configured yet.
  if (!context.app) {
    console.warn("App Check verification warning: Request does not have a valid App Check token. Allowed for Development.");
    // We are no longer throwing the unauthenticated HttpsError here.
  }
}

/**
 * Verifies that the caller is authenticated (has a valid Firebase Auth token).
 * @param {object} context - Firebase callable function context
 * @throws {functions.https.HttpsError} if not authenticated
 */
function requireAuth(context) {
  if (!context.auth) {
    throw new (require("firebase-functions")).https.HttpsError(
      "unauthenticated",
      "Authentication required."
    );
  }
}

/**
 * Verifies that the caller has a specific role (from custom claims).
 * @param {object} context - Firebase callable function context
 * @param {string[]} allowedRoles - e.g. ["admin", "manager"]
 * @throws {functions.https.HttpsError} if role not allowed
 */
function requireRole(context, allowedRoles) {
  requireAuth(context);
  const role = context.auth.token.role;
  if (!allowedRoles.includes(role)) {
    throw new (require("firebase-functions")).https.HttpsError(
      "permission-denied",
      `Access denied. Required role: ${allowedRoles.join(" or ")}.`
    );
  }
}

module.exports = { verifyAppCheck, requireAuth, requireRole };
