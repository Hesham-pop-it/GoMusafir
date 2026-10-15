// Phone approval for web sign-in (S11). Email code stays the fallback.
const { HttpsError } = require("firebase-functions/v2/https");
const { onCall } = require("../middleware/participantAccessMiddleware");
const { db, auth } = require("../admin");
const { verifyAppCheck, requireAuth } = require("../middleware/appCheckMiddleware");
const { sendPushNotification } = require("../services/notificationService");
const { isStaff, createApproval, answerApproval, sanitizeBrowser } = require("../services/loginApprovalService");

const KNOWN = ["resource-exhausted", "not-found", "permission-denied"];
const rethrow = (e) => { throw KNOWN.includes(e.code) ? new HttpsError(e.code, e.message) : e; };

// Called by the web right after password sign-in. Only the web session gets the
// correct number back; it is never stored where a client can read it.
exports.requestLoginApproval = onCall({ enrollment: true, region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);
  const uid = request.auth.uid;
  if (!(await isStaff(db, uid, request.auth.token.role))) {
    throw new HttpsError("permission-denied", "Staff accounts only.");
  }
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
  const browser = sanitizeBrowser(request.data?.browser);
  const result = await createApproval({
    db, uid, browser, authTime: request.auth.token.auth_time, minGapMs: isEmulator ? 1000 : 10000,
  }).catch(rethrow);
  const sent = await sendPushNotification(uid, "Login request", `Did you try to sign in on the web? ${browser}`,
    { type: "login_approval", id: result.id },
    { interruptionLevel: "critical", skipDbSave: true });
  // sendPushNotification returns the FCM message id, or nothing when there is no token or the send failed.
  return { ...result, pushed: Boolean(sent) };
});

// Called by the app. Approving also completes the second factor the same way a
// correct email code does: the Auth account is marked emailVerified.
exports.answerLoginApproval = onCall({ region: "europe-west1" }, async (request) => {
  verifyAppCheck(request);
  requireAuth(request);
  const { id, number, deny } = request.data || {};
  if (typeof id !== "string" || !/^[-\w]{1,64}$/.test(id)) throw new HttpsError("invalid-argument", "A valid id is required.");
  if (deny !== true && !Number.isInteger(number)) throw new HttpsError("invalid-argument", "A number or deny is required.");
  const uid = request.auth.uid;
  const result = await answerApproval({
    db, uid, id, number, deny: deny === true, authTime: request.auth.token.auth_time,
  }).catch(rethrow);
  if (result.status === "approved") await auth.updateUser(uid, { emailVerified: true });
  return result;
});
