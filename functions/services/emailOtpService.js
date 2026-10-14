// Staff email OTP: code generation, hashed storage, attempt lockout and
// resend limits. All state lives server-side in RTDB (no client rules exist
// for these paths, so only the Admin SDK can read or write them).
//
//   otp_codes/{uid}                 { digest, salt, expiresAt, lastSent, attempts, lockedUntil }
//   otp_email_rate/{sha256(email)}  { start, count }
const crypto = require('crypto');

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_EMAIL_WINDOW = 5;

const seconds = ms => Math.max(1, Math.ceil(ms / 1000));
const generateCode = () => crypto.randomInt(100000, 1000000).toString();
const newSalt = () => crypto.randomBytes(16).toString('hex');
const hashCode = (uid, salt, code) =>
  crypto.createHash('sha256').update(`${uid}:${salt}:${code}`).digest('hex');
const emailKey = email => crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

function digestsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Pure decision for one verification attempt against the stored record.
function evaluateAttempt(current, uid, code, now) {
  if (!current || !current.digest) return { outcome: 'not-found' };
  if (current.lockedUntil && current.lockedUntil > now) {
    return { outcome: 'locked', retryAfterSeconds: seconds(current.lockedUntil - now) };
  }
  if (now > current.expiresAt) return { outcome: 'expired' };
  if (digestsMatch(current.digest, hashCode(uid, current.salt, code))) {
    return { outcome: 'ok', next: null };
  }
  const attempts = (current.attempts || 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    return {
      outcome: 'locked', retryAfterSeconds: seconds(LOCKOUT_MS),
      next: { ...current, attempts: 0, lockedUntil: now + LOCKOUT_MS },
    };
  }
  return { outcome: 'wrong', attemptsLeft: MAX_ATTEMPTS - attempts, next: { ...current, attempts } };
}

function createEmailOtpService(db, clock = Date.now) {
  // Claims the per-user resend slot. Returns {ok} or {ok:false, locked, retryAfterSeconds}.
  async function claimSend(uid, cooldownMs) {
    const now = clock();
    let blocked = null;
    await db.ref(`otp_codes/${uid}`).transaction(current => {
      blocked = null;
      if (current && current.lockedUntil > now) {
        blocked = { locked: true, retryAfterSeconds: seconds(current.lockedUntil - now) };
        return;
      }
      if (current && current.lastSent && now - current.lastSent < cooldownMs) {
        blocked = { locked: false, retryAfterSeconds: seconds(cooldownMs - (now - current.lastSent)) };
        return;
      }
      return { ...(current || {}), lastSent: now };
    }, undefined, false);
    return blocked ? { ok: false, ...blocked } : { ok: true };
  }

  // Counts one send against the per-email hourly limit.
  async function countEmailSend(email) {
    const now = clock();
    let blocked = null;
    await db.ref(`otp_email_rate/${emailKey(email)}`).transaction(current => {
      blocked = null;
      const fresh = !current || now - current.start >= EMAIL_WINDOW_MS;
      const state = fresh ? { start: now, count: 0 } : current;
      if (state.count >= MAX_SENDS_PER_EMAIL_WINDOW) {
        blocked = { retryAfterSeconds: seconds(state.start + EMAIL_WINDOW_MS - now) };
        return;
      }
      return { start: state.start, count: state.count + 1 };
    }, undefined, false);
    return blocked ? { ok: false, ...blocked } : { ok: true };
  }

  // Stores a fresh hashed code. Keeps lockedUntil so a resend cannot reset a lockout.
  async function storeCode(uid, code) {
    const now = clock();
    const salt = newSalt();
    await db.ref(`otp_codes/${uid}`).update({
      digest: hashCode(uid, salt, code), salt, expiresAt: now + CODE_TTL_MS, lastSent: now, attempts: 0,
    });
  }

  async function checkCode(uid, code) {
    let result = { outcome: 'not-found' };
    await db.ref(`otp_codes/${uid}`).transaction(current => {
      if (current === null) { result = { outcome: 'not-found' }; return null; }
      result = evaluateAttempt(current, uid, code, clock());
      return result.next;
    }, undefined, false);
    return result;
  }

  return { claimSend, countEmailSend, storeCode, checkCode };
}

module.exports = {
  createEmailOtpService, evaluateAttempt, generateCode, hashCode, emailKey,
  CODE_TTL_MS, MAX_ATTEMPTS, LOCKOUT_MS, MAX_SENDS_PER_EMAIL_WINDOW, EMAIL_WINDOW_MS,
};
