// Phone approval with number matching for web sign-in (S11). The public node
// login_approvals/{uid}/{id} is readable by its owner; the correct number and the
// requesting session live in login_approval_secrets/{uid}/{id}, which no client reads.
const crypto = require('crypto');

const TTL_MS = 120 * 1000;
const STALE_MS = 10 * 60 * 1000;
const STAFF_ROLES = ['admin', 'co-host', 'manager'];
const DEFAULT_BROWSER = 'Web browser';

// Three distinct 2-digit numbers and the index of the one shown on the web.
function generateChallenge(randomInt = crypto.randomInt) {
  const numbers = [];
  while (numbers.length < 3) {
    const n = randomInt(10, 100);
    if (!numbers.includes(n)) numbers.push(n);
  }
  return { numbers, correct: numbers[randomInt(0, 3)] };
}

// Browser label from the web, safe to show on the phone.
function sanitizeBrowser(value) {
  if (typeof value !== 'string') return DEFAULT_BROWSER;
  const clean = value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return clean || DEFAULT_BROWSER;
}

// Decides one answer. Pure: no clock, no database.
//
// Known limit of the same_session check: the server only sees the token's auth_time, so it
// refuses answers from the exact sign-in the request came from, but it cannot tell the phone
// from a second browser signed in with the same password. Anyone holding the password can
// still sign in elsewhere and answer. Closing that needs App Check attestation (enforced
// per request, see verifyAppCheck, which is bypassed today) to prove the answer comes from
// the real app. Until then phone approval is a convenience factor on top of the password,
// not a defence against a stolen password.
// outcomes: approved | denied | expired | answered | same_session | not_found
function evaluateAnswer({ approval, secret, callerAuthTime, number, deny, now }) {
  if (!approval || !secret) return 'not_found';
  if (approval.status !== 'pending') return 'answered';
  if (Number.isFinite(secret.requester_auth_time) && secret.requester_auth_time === callerAuthTime) return 'same_session';
  if (!Number.isFinite(approval.expires_at) || now > approval.expires_at) return 'expired';
  if (deny === true) return 'denied';
  return Number(number) === secret.correct && Number.isInteger(Number(number)) ? 'approved' : 'denied';
}

const isStaff = async (db, uid, role) =>
  STAFF_ROLES.includes(role) || !!(await db.ref(`users/${uid}/staff_org_id`).get()).val();

const fail = (code, message) => Object.assign(new Error(message), { code });

// Creates the approval and returns what only the requesting web session may see.
async function createApproval({ db, uid, browser, authTime, now = Date.now(), minGapMs = 10000, randomInt, newId }) {
  const gate = await db.ref(`login_approval_secrets/${uid}/last_request`).transaction(
    cur => (Number.isFinite(cur) && now - cur < minGapMs ? undefined : now));
  if (!gate.committed) throw fail('resource-exhausted', 'Please wait before requesting another approval.');

  // Drop this user's stale entries so the nodes do not grow without bound.
  const old = (await db.ref(`login_approvals/${uid}`).get()).val() || {};
  const updates = {};
  for (const [oldId, item] of Object.entries(old)) {
    if (!item || !(now - item.created_at < STALE_MS)) {
      updates[`login_approvals/${uid}/${oldId}`] = null;
      updates[`login_approval_secrets/${uid}/${oldId}`] = null;
    }
  }

  const secrets = (await db.ref(`login_approval_secrets/${uid}`).get()).val() || {};
  for (const secretId of Object.keys(secrets)) {
    if (secretId !== 'last_request' && !old[secretId]) updates[`login_approval_secrets/${uid}/${secretId}`] = null;
  }

  const { numbers, correct } = generateChallenge(randomInt);
  const id = newId || db.ref(`login_approvals/${uid}`).push().key;
  const expires_at = now + TTL_MS;
  updates[`login_approval_secrets/${uid}/${id}`] = { correct, requester_auth_time: authTime ?? null, created_at: now };
  updates[`login_approvals/${uid}/${id}`] = {
    created_at: now, expires_at, numbers, status: 'pending', client: { browser: sanitizeBrowser(browser) },
  };
  await db.ref().update(updates);
  return { id, number: correct, numbers, expires_at };
}

// Records one answer. The status transaction guarantees a single answer wins.
async function answerApproval({ db, uid, id, number, deny, authTime, now = Date.now() }) {
  const [approvalSnap, secretSnap] = await Promise.all([
    db.ref(`login_approvals/${uid}/${id}`).get(), db.ref(`login_approval_secrets/${uid}/${id}`).get()]);
  const outcome = evaluateAnswer({ approval: approvalSnap.val(), secret: secretSnap.val(), callerAuthTime: authTime, number, deny, now });
  if (outcome === 'not_found') throw fail('not-found', 'This login request no longer exists.');
  if (outcome === 'same_session') throw fail('permission-denied', 'Answer from your phone, not the requesting browser.');
  if (outcome === 'answered') return { status: approvalSnap.val().status };
  // Transact on the whole node so a deleted approval is never recreated as a bare status.
  // A null first pass is the unsynced local view: returning it unchanged lets the server
  // re-run us with the real value, and commits nothing if the node truly is gone.
  const tx = await db.ref(`login_approvals/${uid}/${id}`).transaction(
    cur => (cur === null ? cur : cur.status === 'pending' ? { ...cur, status: outcome, answered_at: now } : undefined));
  if (!tx.committed || !tx.snapshot.exists()) {
    const latest = (await db.ref(`login_approvals/${uid}/${id}/status`).get()).val();
    if (latest === null) throw fail('not-found', 'This login request no longer exists.');
    return { status: latest };
  }
  return { status: outcome };
}

module.exports = { TTL_MS, generateChallenge, sanitizeBrowser, evaluateAnswer, isStaff, createApproval, answerApproval };
