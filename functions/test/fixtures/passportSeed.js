// Seed additions phase 5 (passport) needs, as a flat RTDB update map, plus the plain tokens the website needs to
// open each seeded link. Tokens, codes and sessions are deterministic per label so the pilgrim page can be
// opened by hand: /paspoort?t=<links[uid].token>, code 123456, session tokens for the already verified people.
// Needs the demo emulators only; the encryption uses the same dev key as the functions' kmsService.
// people: [{ uid, label, state: 'sent'|'code'|'verified'|'expired'|'revoked', steps?: { gegevens: {...}, ... }, lang?, code? }]
//   steps hold the plain data per step (shapes as passportSave takes them); they are written encrypted.
const crypto = require('node:crypto');
const { encrypt } = require('../../services/kmsService');
const { hashToken, codeDigest } = require('../../services/passport/passportTokens');
const { statusMap, MEDICAL_CONSENT_VERSION } = require('../../services/passport/passportValidation');

const DAY = 86400000, MIN = 60000;
const devToken = label => crypto.createHash('sha256').update(`gomusafir-passport-dev:${label}`).digest('base64url'); // 43 chars, valid token shape

function passportSeed({ org, tripId, people, needsCopy = false, settings = { mode: 'manual', amount: 0, lang: 'nl' }, tripEnd, now = Date.now() }) {
  const u = {}, links = {};
  u[`passport_settings/${org}`] = { ...settings, updated_at: now };
  u[`passport_trip_settings/${tripId}`] = { org_id: org, needs_copy: needsCopy, updated_at: now };
  for (const p of people) {
    const token = devToken(p.label || p.uid), hash = hashToken(token);
    const expired = p.state === 'expired', revoked = p.state === 'revoked';
    const created = now - (expired ? 20 : 1) * DAY;
    const expires = created + 14 * DAY;
    u[`passport_links/${hash}`] = { org_id: org, trip_id: tripId, uid: p.uid, created_at: created, expires_at: expires, by: null, lang: p.lang || settings.lang || 'nl', ...(revoked ? { revoked_at: now - DAY } : {}) };
    u[`passport_link_index/${tripId}/${p.uid}`] = { hash, org_id: org, created_at: created, expires_at: expires, sent_at: created, sent_count: 1, lang: p.lang || settings.lang || 'nl', ...(revoked ? { revoked_at: now - DAY } : {}) };
    links[p.uid] = { token, hash };
    if (p.state === 'code') {
      u[`passport_codes/${hash}`] = { digest: codeDigest(hash, p.code || '123456'), expires_at: now + 10 * MIN, sent_at: now - 2 * MIN, tries: 0, window_start: now - 2 * MIN, issued: 1 };
      links[p.uid].code = p.code || '123456';
    }
    if (p.state === 'verified') {
      const session = devToken(`${p.label || p.uid}:session`);
      u[`passport_sessions/${hashToken(session)}`] = { link: hash, org_id: org, trip_id: tripId, uid: p.uid, created_at: now, expires_at: now + 60 * MIN, uploads: 0 };
      links[p.uid].session = session;
    }
    const stored = {};
    for (const [step, data] of Object.entries(p.steps || {})) {
      stored[step] = data;
      u[`passport/${org}/${tripId}/${p.uid}/steps/${step}`] = { enc: encrypt(JSON.stringify(data)), updated_at: now - DAY };
    }
    if (Object.keys(stored).length) {
      const docs = {};
      u[`passport_status/${org}/${tripId}/${p.uid}`] = { ...statusMap(stored, { needsCopy, docs }), updated_at: now - DAY,
        ...(stored.medisch ? { medical_consent_at: now - DAY, medical_consent_version: MEDICAL_CONSENT_VERSION } : {}) };
    }
  }
  if (people.some(p => p.steps)) u[`passport_retention/${tripId}`] = { org_id: org, delete_after: (tripEnd ?? now + 30 * DAY) + 30 * DAY };
  return { updates: u, links };
}

// A complete set of step data for tests and the website seed.
const sampleSteps = (now = Date.now()) => ({
  gegevens: { name: 'Fatima Zahra', phone: '+31612345678', email: 'fatima@example.test' },
  visum: { has_visa: false },
  paspoort: { number: 'NX4123458', nationality: 'Nederlandse', expiry: new Date(now + 900 * DAY).toISOString().slice(0, 10) },
  medisch: { consent: true, allergies: 'Pinda', notes: '' },
  noodcontact: { contacts: [{ name: 'Yusuf Zahra', relation: 'husband', phone: '+31698765432' }] },
});

module.exports = { passportSeed, devToken, sampleSteps };
