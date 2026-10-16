// Face ID / fingerprint on the passport page (P13): WebAuthn passkeys as a faster way than the mailed code to start a session.
// Server-only nodes: passport_passkeys/{trip}/{uid}/{credId} (public key, counter) and passport_passkey_challenges/{sha256(challenge)}
// (5 minutes, single use, bound to one person and one purpose). The mailed code stays the fallback.
const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../../admin');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PER_PERSON = 5;
const RP_NAME = 'GoMusafir';
const EMULATOR_RP_ID = 'join.gomusafir.app';
const EMULATOR_ORIGINS = ['https://join.gomusafir.app', 'http://localhost:3100'];

const credsRef = (trip, uid) => db.ref(`passport_passkeys/${trip}/${uid}`);
const challengeRef = hash => db.ref(`passport_passkey_challenges/${hash}`);
const fail = (code, message, reason) => new HttpsError(code, message, { reason });
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const lib = () => require('@simplewebauthn/server');
const b64u = bytes => Buffer.from(bytes).toString('base64url');

// rp id and origins come from PASSKEY_RP_ID / PASSKEY_ORIGINS (comma separated); the defaults exist only in the emulator.
function config(env = process.env) {
  const emulator = env.FUNCTIONS_EMULATOR === 'true';
  const rpID = (env.PASSKEY_RP_ID || (emulator ? EMULATOR_RP_ID : '')).trim();
  const origins = (env.PASSKEY_ORIGINS ? env.PASSKEY_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : (emulator ? EMULATOR_ORIGINS : []));
  if (!rpID || !origins.length) throw fail('failed-precondition', 'Passkeys are not configured.', 'not_configured');
  return { rpID, origins };
}

// An opaque, stable handle for one person on one trip; it reveals neither the uid nor the trip.
const userHandle = (trip, uid) => crypto.createHash('sha256').update(`passport-passkey|${trip}|${uid}`).digest();

async function list(trip, uid) {
  return (await credsRef(trip, uid).get()).val() || {};
}
async function hasPasskey(trip, uid) {
  return Object.keys(await list(trip, uid)).length > 0;
}

async function saveChallenge(challenge, { kind, trip, uid }, now) {
  await challengeRef(sha(challenge)).set({ kind, trip_id: trip, uid, expires_at: now + CHALLENGE_TTL_MS });
}

// Reads the challenge out of the client's response and uses it up in one transaction: a second use, another purpose,
// another person or a late answer all end as challenge_invalid.
async function consumeChallenge(response, { kind, trip, uid }, now) {
  let challenge;
  try { challenge = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8')).challenge; } catch (_) { challenge = null; }
  if (typeof challenge !== 'string' || !challenge || challenge.length > 200) throw fail('invalid-argument', 'This passkey answer is not valid.', 'challenge_invalid');
  let good = false;
  await challengeRef(sha(challenge)).transaction(cur => {
    good = false;
    if (!cur) return cur;
    good = cur.expires_at > now && cur.kind === kind && cur.trip_id === trip && cur.uid === uid;
    return null; // any look at a stored challenge uses it up
  }, undefined, false);
  if (!good) throw fail('failed-precondition', 'This passkey request has expired. Try again.', 'challenge_invalid');
  return challenge;
}

function shapeCheck(response) {
  if (!response || typeof response !== 'object' || typeof response.id !== 'string' || !response.response || typeof response.response.clientDataJSON !== 'string') {
    throw fail('invalid-argument', 'This passkey answer is not valid.', 'response_invalid');
  }
}

// -> PublicKeyCredentialCreationOptionsJSON; credentials the person already has are excluded.
async function registerOptions({ trip, uid, name }, now = Date.now()) {
  const { rpID } = config();
  const existing = await list(trip, uid);
  if (Object.keys(existing).length >= MAX_PER_PERSON) throw fail('resource-exhausted', 'Remove a passkey before adding another.', 'passkey_limit');
  const options = await lib().generateRegistrationOptions({
    rpName: RP_NAME, rpID, userName: name || 'pilgrim', userDisplayName: name || 'pilgrim', userID: userHandle(trip, uid),
    attestationType: 'none', timeout: CHALLENGE_TTL_MS,
    excludeCredentials: Object.entries(existing).map(([id, c]) => ({ id, ...(c.transports ? { transports: c.transports } : {}) })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await saveChallenge(options.challenge, { kind: 'register', trip, uid }, now);
  return options;
}

// -> credential id. The verified public key is stored; at most MAX_PER_PERSON per person.
async function register({ trip, uid, response }, now = Date.now()) {
  shapeCheck(response);
  const { rpID, origins } = config();
  const expectedChallenge = await consumeChallenge(response, { kind: 'register', trip, uid }, now);
  let verified;
  try {
    verified = await lib().verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true });
  } catch (_) { throw fail('permission-denied', 'The passkey could not be verified.', 'verification_failed'); }
  if (!verified.verified || !verified.registrationInfo) throw fail('permission-denied', 'The passkey could not be verified.', 'verification_failed');
  const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
  const entry = {
    public_key: b64u(credential.publicKey), counter: credential.counter || 0, created_at: now, last_used_at: null,
    device_type: credentialDeviceType || null, backed_up: credentialBackedUp === true,
    ...(Array.isArray(credential.transports) && credential.transports.length ? { transports: credential.transports.map(String).slice(0, 8) } : {}),
  };
  let outcome = 'ok';
  await credsRef(trip, uid).transaction(cur => {
    outcome = 'ok';
    const all = cur || {};
    if (all[credential.id]) { outcome = 'exists'; return undefined; }
    if (Object.keys(all).length >= MAX_PER_PERSON) { outcome = 'limit'; return undefined; }
    return { ...all, [credential.id]: entry };
  }, undefined, false);
  if (outcome === 'limit') throw fail('resource-exhausted', 'Remove a passkey before adding another.', 'passkey_limit');
  if (outcome === 'exists') throw fail('already-exists', 'This passkey is already added.', 'passkey_exists');
  return credential.id;
}

// -> PublicKeyCredentialRequestOptionsJSON for this person's credentials; no_passkey when there are none.
async function loginOptions({ trip, uid }, now = Date.now()) {
  const { rpID } = config();
  const existing = await list(trip, uid);
  if (!Object.keys(existing).length) throw fail('failed-precondition', 'No passkey is set up on this link.', 'no_passkey');
  const options = await lib().generateAuthenticationOptions({
    rpID, userVerification: 'required', timeout: CHALLENGE_TTL_MS,
    allowCredentials: Object.entries(existing).map(([id, c]) => ({ id, ...(c.transports ? { transports: c.transports } : {}) })),
  });
  await saveChallenge(options.challenge, { kind: 'login', trip, uid }, now);
  return options;
}

// Verifies the assertion against one of the person's own credentials and moves the counter forward.
async function login({ trip, uid, response }, now = Date.now()) {
  shapeCheck(response);
  const { rpID, origins } = config();
  const expectedChallenge = await consumeChallenge(response, { kind: 'login', trip, uid }, now);
  const stored = (await list(trip, uid))[response.id];
  if (!stored) throw fail('permission-denied', 'The passkey could not be verified.', 'verification_failed');
  let verified;
  try {
    verified = await lib().verifyAuthenticationResponse({
      response, expectedChallenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: response.id, publicKey: new Uint8Array(Buffer.from(stored.public_key, 'base64url')), counter: stored.counter || 0, ...(stored.transports ? { transports: stored.transports } : {}) },
    });
  } catch (_) { throw fail('permission-denied', 'The passkey could not be verified.', 'verification_failed'); }
  if (!verified.verified) throw fail('permission-denied', 'The passkey could not be verified.', 'verification_failed');
  // Two answers at the same moment must not both move a counter that has to grow (a counter of 0 stays 0 on devices without one).
  const next = verified.authenticationInfo.newCounter || 0;
  let moved = false;
  await credsRef(trip, uid).child(response.id).transaction(cur => {
    moved = false;
    if (!cur) return cur;
    if (next !== 0 || (cur.counter || 0) !== 0) { if (next <= (cur.counter || 0)) return undefined; }
    moved = true;
    return { ...cur, counter: next, last_used_at: now };
  }, undefined, false);
  if (!moved) throw fail('permission-denied', 'The passkey could not be verified.', 'verification_failed');
  return response.id;
}

module.exports = { CHALLENGE_TTL_MS, MAX_PER_PERSON, config, userHandle, list, hasPasskey, credsRef, challengeRef, registerOptions, register, loginOptions, login };
