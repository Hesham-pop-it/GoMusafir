// Database and storage side of the passport data (phase 5). Every step is one encrypted blob at
// passport/{org}/{trip}/{uid}/steps/{step}; the plain, non-sensitive progress lives apart in
// passport_status/{org}/{trip}/{uid} so it survives the retention clean-up. Documents sit in the private
// bucket path passport_docs/{org}/{trip}/{uid}/. No client rule allows any of these paths.
const { HttpsError } = require('firebase-functions/v2/https');
const { admin, db, auth } = require('../../admin');
const kms = require('../kmsService');
const { STEPS, MEDICAL_CONSENT_VERSION, maskPassportNumber, statusMap } = require('./passportValidation');

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const dataRef = (org, trip, uid) => db.ref(`passport/${org}/${trip}/${uid}`);
const statusRef = (org, trip, uid) => db.ref(`passport_status/${org}/${trip}/${uid}`);
const tripSettingsRef = trip => db.ref(`passport_trip_settings/${trip}`);
const docPrefix = (org, trip, uid) => `passport_docs/${org}/${trip}/${uid}/`;

// kmsService falls back to a built-in key when ENCRYPTION_KEY is missing. Outside the emulator the passport data
// is never encrypted or read with that fallback: the key must be set and 64 hex characters. Nothing of the key
// is ever put in a message.
function assertEncryptionKey(env = process.env) {
  if (env.FUNCTIONS_EMULATOR === 'true') return;
  if (!/^[0-9a-fA-F]{64}$/.test(env.ENCRYPTION_KEY || '')) throw new HttpsError('failed-precondition', 'Passport storage is not configured.');
}
const encrypt = text => { assertEncryptionKey(); return kms.encrypt(text); };
const decrypt = text => { assertEncryptionKey(); return kms.decrypt(text); };

const encryptStep = data => encrypt(JSON.stringify(data));
function decryptStep(enc) {
  const text = decrypt(enc);
  try { return JSON.parse(text); } catch (_) { throw new HttpsError('internal', 'Stored passport data could not be read.'); }
}

async function tripNeedsCopy(trip) {
  return (await tripSettingsRef(trip).child('needs_copy').get()).val() === true;
}

// Name, email and phone the account already has; used for the first step and for the code mail.
async function accountContact(uid) {
  const [userSnap, record] = await Promise.all([db.ref(`users/${uid}`).get(), auth.getUser(uid).catch(() => null)]);
  const user = userSnap.val() || {};
  let secret = {};
  if (user.p_profile) {
    assertEncryptionKey();
    try { secret = JSON.parse(kms.decrypt(user.p_profile)) || {}; } catch (_) { /* fall back to plain fields */ }
  }
  const profile = user.profile || {};
  const pick = (...values) => values.find(v => typeof v === 'string' && v.trim() && v.trim() !== '***') || '';
  const first = pick(secret.firstName, profile.firstName, profile.first_name, user.first_name);
  const last = pick(secret.lastName, profile.lastName, profile.last_name, user.last_name);
  return {
    name: `${first} ${last}`.trim() || pick(record?.displayName),
    email: pick(record?.email, secret.email, profile.email, user.email).toLowerCase(),
    phone: pick(secret.phone, profile.phone, profile.phoneNumber, record?.phoneNumber, user.phone),
  };
}

async function loadRecord(org, trip, uid) {
  const record = (await dataRef(org, trip, uid).get()).val() || {};
  const stored = {};
  for (const step of STEPS) if (record.steps?.[step]?.enc) stored[step] = decryptStep(record.steps[step].enc);
  return { stored, docs: record.docs || {} };
}

// Recomputes and writes the plain progress after any change; returns it.
async function refreshStatus(org, trip, uid, loaded, now = Date.now()) {
  const { stored, docs } = loaded || await loadRecord(org, trip, uid);
  const status = statusMap(stored, { needsCopy: await tripNeedsCopy(trip), docs });
  await statusRef(org, trip, uid).update({ ...status, updated_at: now });
  return status;
}

// The day the data must be gone: 30 days after the trip's end. It is only ever brought forward here; the job also
// rechecks it against the trip's current end date (see passportRetention.effectiveDeadline).
async function registerRetention(org, trip, now = Date.now()) {
  const end = (await db.ref(`orgs/${org}/trips/${trip}/end_date`).get()).val();
  const due = (Number.isFinite(end) ? end : now) + RETENTION_MS;
  await db.ref(`passport_retention/${trip}`).transaction(cur => ({ org_id: org, delete_after: Number.isFinite(cur?.delete_after) ? Math.min(cur.delete_after, due) : due }), undefined, false);
}

async function saveStep(org, trip, uid, step, data, { now = Date.now(), consentAt } = {}) {
  const updates = { [`passport/${org}/${trip}/${uid}/steps/${step}`]: { enc: encryptStep(data), updated_at: now } };
  if (step === 'medisch' && data.consent === true) {
    updates[`passport_status/${org}/${trip}/${uid}/medical_consent_at`] = consentAt || now;
    updates[`passport_status/${org}/${trip}/${uid}/medical_consent_version`] = MEDICAL_CONSENT_VERSION;
  }
  await db.ref().update(updates);
  await registerRetention(org, trip, now);
  return refreshStatus(org, trip, uid, null, now);
}

// The six steps as the pilgrim page receives them; the passport number is always masked.
async function stepsView(org, trip, uid, loaded) {
  const { stored, docs } = loaded || await loadRecord(org, trip, uid);
  const needsCopy = await tripNeedsCopy(trip);
  const status = statusMap(stored, { needsCopy, docs });
  const out = {};
  for (const step of STEPS) {
    let data = stored[step] ? { ...stored[step] } : {};
    if (step === 'gegevens' && !stored.gegevens) data = await accountContact(uid);
    if (step === 'paspoort' && data.number) data.number = maskPassportNumber(data.number);
    if (step === 'paspoort') data.uploaded_at = docs.passport?.uploaded_at || null;
    if (step === 'visum') data.uploaded_at = docs.visa?.uploaded_at || null;
    out[step] = { status: status[step], data };
  }
  return out;
}

async function storeDocument(org, trip, uid, kind, { bytes, contentType, ext }, now = Date.now()) {
  const bucket = admin.storage().bucket();
  const prefix = docPrefix(org, trip, uid);
  const path = `${prefix}${kind}.${ext}`;
  const previous = (await dataRef(org, trip, uid).child(`docs/${kind}`).get()).val();
  await bucket.file(path).save(bytes, { resumable: false, contentType, metadata: { cacheControl: 'private, no-store' } });
  if (previous?.path && previous.path !== path) await bucket.file(previous.path).delete({ ignoreNotFound: true }).catch(() => {});
  await dataRef(org, trip, uid).child(`docs/${kind}`).set({ path, content_type: contentType, size: bytes.length, uploaded_at: now });
  await registerRetention(org, trip, now);
  await refreshStatus(org, trip, uid, null, now);
  return now;
}

module.exports = {
  RETENTION_MS, assertEncryptionKey, dataRef, statusRef, tripSettingsRef, docPrefix, encryptStep, decryptStep, tripNeedsCopy, accountContact,
  loadRecord, refreshStatus, registerRetention, saveStep, stepsView, storeDocument,
};
