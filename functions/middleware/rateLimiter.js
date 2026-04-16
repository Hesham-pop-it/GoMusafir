// ─── Rate Limiter Middleware ──────────────────────────────────────────────────
// S14: Protects join/alert endpoints from bot abuse.
// Stores per-IP or per-UID hit counts in memory (or RTDB for multi-instance).

const hitMap = new Map(); // ip -> { count, resetAt }

const WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Checks rate limit for a given key (IP or UID).
 * @param {string} key - IP address or user UID
 * @param {number} maxHits - Max allowed hits per window
 * @throws {Error} If rate limit exceeded
 */
function checkRateLimit(key, maxHits = 10) {
  const now = Date.now();
  const record = hitMap.get(key);

  if (!record || now > record.resetAt) {
    hitMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  record.count += 1;
  if (record.count > maxHits) {
    throw Object.assign(new Error("Too many requests. Please try again later."), {
      code: "RATE_LIMITED",
      httpStatus: 429,
    });
  }
}

module.exports = { checkRateLimit };
