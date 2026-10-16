// The passport link, its e-mail code and the short session that follows (phase 5). The pilgrim has no Firebase
// login: the link (14 days, revocable) names one participant of one trip, a 6-digit code mailed to the account
// address (10 minutes, 5 tries; 25 wrong codes in all lock the link) proves it is them, and a session token (60 minutes) carries the rest of the visit.
// Server-only nodes: passport_links/{hash}, passport_link_index/{trip}/{uid}, passport_codes/{hash}, passport_sessions/{hash}.
const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../../admin');
const t = require('./passportTokens');

const MIN = 60 * 1000, DAY = 24 * 60 * MIN;
const LINK_TTL_MS = 14 * DAY;
const CODE_TTL_MS = 10 * MIN;
const CODE_MAX_TRIES = 5;
const CODE_COOLDOWN_MS = 60 * 1000;
const CODES_PER_HOUR = 5;
const SESSION_TTL_MS = 60 * MIN;
const UPLOADS_PER_SESSION = 10;
const LINK_MAX_FAILED_TRIES = 25; // wrong codes over the whole life of one link, across all the codes it was given
const RETENTION_MS = 30 * DAY;

const linkRef = hash => db.ref(`passport_links/${hash}`);
const indexRef = (trip, uid) => db.ref(`passport_link_index/${trip}/${uid}`);
const codeRef = hash => db.ref(`passport_codes/${hash}`);
const sessionRef = hash => db.ref(`passport_sessions/${hash}`);
const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });

// A new link takes the place of the one before it in the index. The earlier link keeps working until the caller has
// sent the mail and then calls revokeHash(previous.hash); if the mail fails, restoreLink puts the earlier one back.
// The swap is one transaction on the index entry, so two sends at once each get a different earlier link back.
// -> { token, hash, expires_at, previous: the index entry before (or null) }
async function createLink({ orgId, tripId, uid, by, lang, now = Date.now() }) {
  const token = t.newToken(), hash = t.hashToken(token);
  await linkRef(hash).set({ org_id: orgId, trip_id: tripId, uid, created_at: now, expires_at: now + LINK_TTL_MS, by: by || null, lang: lang || null });
  let previous = null;
  await indexRef(tripId, uid).transaction(cur => {
    previous = cur || null;
    return { hash, org_id: orgId, created_at: now, expires_at: now + LINK_TTL_MS, sent_at: null, sent_count: cur?.sent_count || 0, lang: lang || null };
  }, undefined, false);
  return { token, hash, expires_at: now + LINK_TTL_MS, previous };
}
const markSent = (tripId, uid, now = Date.now()) => indexRef(tripId, uid).transaction(cur => (cur ? { ...cur, sent_at: now, sent_count: (cur.sent_count || 0) + 1 } : cur));

// Withdraws one link (and its code) by its hash; the index entry is left alone.
async function revokeHash(hash, now = Date.now()) {
  if (!hash) return;
  await db.ref().update({ [`passport_links/${hash}/revoked_at`]: now, [`passport_codes/${hash}`]: null });
}

// The mail for a new link failed: drop that link and, when it is still the current one, put the earlier entry back.
async function restoreLink({ tripId, uid, link, now = Date.now() }) {
  const earlier = link.previous && !link.previous.revoked_at ? link.previous : null;
  if (!earlier) { await revokeLink({ tripId, uid, now }); return; }
  await indexRef(tripId, uid).transaction(cur => (cur?.hash === link.hash ? earlier : cur), undefined, false);
  await db.ref().update({ [`passport_links/${link.hash}`]: null, [`passport_codes/${link.hash}`]: null });
}

async function revokeLink({ tripId, uid, now = Date.now() }) {
  const entry = (await indexRef(tripId, uid).get()).val();
  if (!entry?.hash || entry.revoked_at) return false;
  await db.ref().update({
    [`passport_links/${entry.hash}/revoked_at`]: now,
    [`passport_link_index/${tripId}/${uid}/revoked_at`]: now,
    [`passport_codes/${entry.hash}`]: null,
  });
  return true;
}

// token -> { hash, link } or the error the page shows: invalid (not-found), revoked (permission-denied), expired (failed-precondition).
async function resolveLink(token, now = Date.now()) {
  if (!t.isTokenShape(token)) throw fail('not-found', 'This link is not valid.', 'invalid');
  const hash = t.hashToken(token);
  const link = (await linkRef(hash).get()).val();
  if (!link) throw fail('not-found', 'This link is not valid.', 'invalid');
  return { hash, link: assertLinkUsable(link, now) };
}
function assertLinkUsable(link, now) {
  if (link.revoked_at) throw fail('permission-denied', 'This link was withdrawn. Ask your travel organisation for a new one.', 'revoked');
  if (link.locked_at) throw fail('permission-denied', 'This link is locked after too many wrong codes. Ask your travel organisation for a new one.', 'locked');
  if (link.expires_at <= now) throw fail('failed-precondition', 'This link has expired. Ask your travel organisation for a new one.', 'expired');
  return link;
}

// Creates a fresh code unless one is still usable (auto) or the limits are reached. -> { code } to mail, or { code: null, reason }.
async function issueCode(hash, { auto = false, now = Date.now() } = {}) {
  let outcome = null, code = null;
  await codeRef(hash).transaction(cur => {
    outcome = null; code = null;
    const live = cur && cur.expires_at > now && cur.tries < CODE_MAX_TRIES;
    if (auto && live) { outcome = { reason: 'active' }; return undefined; }
    if (cur && now - cur.sent_at < CODE_COOLDOWN_MS) { outcome = { reason: 'cooldown', retry_after_s: Math.ceil((CODE_COOLDOWN_MS - (now - cur.sent_at)) / 1000) }; return undefined; }
    if (auto && cur && cur.tries >= CODE_MAX_TRIES && cur.expires_at > now) { outcome = { reason: 'locked' }; return undefined; }
    const window = cur && now - cur.window_start < 60 * MIN ? { window_start: cur.window_start, issued: cur.issued } : { window_start: now, issued: 0 };
    if (window.issued >= CODES_PER_HOUR) { outcome = { reason: 'hourly_limit' }; return undefined; }
    code = t.newCode();
    return { digest: t.codeDigest(hash, code), expires_at: now + CODE_TTL_MS, sent_at: now, tries: 0, ...window, issued: window.issued + 1 };
  }, undefined, false);
  return code ? { code } : { code: null, ...outcome };
}

// Counts the try first, then compares; five tries use the code up. -> true, or throws wrong_code / too_many / code_expired.
async function verifyCode(hash, code, now = Date.now()) {
  let state = 'missing', left = 0;
  await codeRef(hash).transaction(cur => {
    if (!cur) { state = 'missing'; return cur; } // never abort on an empty first read; the server value follows
    if (cur.expires_at <= now) { state = 'expired'; return undefined; }
    if (cur.tries >= CODE_MAX_TRIES) { state = 'locked'; return undefined; }
    if (t.isCodeShape(code) && t.digestsMatch(cur.digest, t.codeDigest(hash, code))) { state = 'ok'; return null; }
    state = 'wrong'; left = CODE_MAX_TRIES - cur.tries - 1;
    return { ...cur, tries: cur.tries + 1 };
  }, undefined, false);
  if (state === 'ok') return true;
  if (state === 'missing') throw fail('failed-precondition', 'Request a new code first.', 'code_missing');
  if (state === 'expired') throw fail('failed-precondition', 'This code has expired. Request a new one.', 'code_expired');
  if (state === 'wrong') await countFailure(hash, now);
  if (state === 'locked' || left === 0) throw fail('resource-exhausted', 'Too many wrong codes. Request a new code.', 'too_many', { tries_left: 0 });
  throw fail('permission-denied', 'That code is not correct.', 'wrong_code', { tries_left: left });
}

// Every wrong code counts against the link itself; the 25th locks it (a new link from staff replaces it).
async function countFailure(hash, now) {
  const r = await linkRef(hash).child('failed_tries').transaction(n => (n || 0) + 1);
  if ((r.snapshot.val() || 0) < LINK_MAX_FAILED_TRIES) return;
  const link = (await linkRef(hash).get()).val();
  const updates = { [`passport_links/${hash}/locked_at`]: now, [`passport_codes/${hash}`]: null };
  if (link && (await indexRef(link.trip_id, link.uid).get()).val()?.hash === hash) updates[`passport_link_index/${link.trip_id}/${link.uid}/locked_at`] = now;
  await db.ref().update(updates);
  throw fail('permission-denied', 'This link is locked after too many wrong codes. Ask your travel organisation for a new one.', 'locked');
}

async function createSession({ hash, link, now = Date.now() }) {
  const token = t.newToken();
  const expires_at = now + SESSION_TTL_MS;
  await sessionRef(t.hashToken(token)).set({ link: hash, org_id: link.org_id, trip_id: link.trip_id, uid: link.uid, created_at: now, expires_at, uploads: 0 });
  return { session: token, expires_at };
}

// session -> { hash (of the session), record, link }; a withdrawn or expired link ends the session with it.
async function resolveSession(token, now = Date.now()) {
  if (!t.isTokenShape(token)) throw fail('unauthenticated', 'Start again with your link.', 'session');
  const hash = t.hashToken(token);
  const record = (await sessionRef(hash).get()).val();
  if (!record) throw fail('unauthenticated', 'Start again with your link.', 'session');
  if (record.expires_at <= now) throw fail('unauthenticated', 'Your session has ended. Open your link again.', 'session');
  const link = (await linkRef(record.link).get()).val();
  if (!link) throw fail('unauthenticated', 'Start again with your link.', 'session');
  try { assertLinkUsable(link, now); } catch (error) { throw fail('unauthenticated', error.message, ['revoked', 'locked'].includes(error.details?.reason) ? error.details.reason : 'session'); }
  return { hash, record, link };
}

// Counts an upload against the session; false when the session has used them all.
async function takeUpload(sessionHash) {
  const r = await sessionRef(sessionHash).child('uploads').transaction(n => ((n || 0) >= UPLOADS_PER_SESSION ? undefined : (n || 0) + 1));
  return r.committed;
}

async function linkIsActive(tripId, uid, now = Date.now()) {
  const entry = (await indexRef(tripId, uid).get()).val();
  return !!(entry && !entry.revoked_at && !entry.locked_at && entry.expires_at > now);
}

module.exports = {
  LINK_TTL_MS, CODE_TTL_MS, CODE_MAX_TRIES, LINK_MAX_FAILED_TRIES, CODE_COOLDOWN_MS, CODES_PER_HOUR, SESSION_TTL_MS, UPLOADS_PER_SESSION, RETENTION_MS,
  linkRef, indexRef, codeRef, sessionRef, createLink, markSent, revokeHash, restoreLink, revokeLink, resolveLink, issueCode, verifyCode, createSession,
  resolveSession, takeUpload, linkIsActive,
};
