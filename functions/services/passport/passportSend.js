// Settings, sending and the send queue of the passport links (phase 5, F9). Each organisation chooses when the
// link goes out after someone joins: direct, after X hours, after X days, or only when staff press send.
// Existing participants are never sent anything automatically; only joins that happen after the setting count.
const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('../../admin');
const { writeAuditLog } = require('../auditService');
const inv = require('../invitations/invitationService');
const links = require('./passportLinks');
const mail = require('./passportMail');
const store = require('./passportStore');
const { LANGS } = require('../deen/deenParser');

const HOUR = 60 * 60 * 1000, DAY = 24 * HOUR;
const MODES = ['direct', 'hours', 'days', 'manual'];
const MAX_AMOUNT = { hours: 24 * 14, days: 60 };
const RESEND_GAP_MS = 10 * 60 * 1000;
const CLAIM_MS = 10 * 60 * 1000;
const DEFAULT_SETTINGS = { mode: 'manual', amount: 0, lang: 'en' };
const settingsRef = org => db.ref(`passport_settings/${org}`);

async function getSettings(orgId) {
  return { ...DEFAULT_SETTINGS, ...((await settingsRef(orgId).get()).val() || {}) };
}
// Cleans a settings change; throws invalid-argument for a mode, amount or language that does not exist.
function cleanSettings(input, current = DEFAULT_SETTINGS) {
  const mode = input.mode ?? current.mode;
  if (!MODES.includes(mode)) throw new HttpsError('invalid-argument', 'Unknown send timing.');
  let amount = 0;
  if (mode === 'hours' || mode === 'days') {
    amount = Number(input.amount ?? current.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT[mode]) throw new HttpsError('invalid-argument', `The delay must be a whole number from 1 to ${MAX_AMOUNT[mode]} ${mode}.`);
  }
  const lang = input.lang ?? current.lang ?? 'en';
  if (!LANGS.includes(lang)) throw new HttpsError('invalid-argument', 'Unknown language.');
  return { mode, amount, lang };
}
// When the link of someone who joined at `joinedAt` is due; null when staff send by hand.
function dueAt(settings, joinedAt) {
  if (settings.mode === 'direct') return joinedAt;
  if (settings.mode === 'hours') return joinedAt + settings.amount * HOUR;
  if (settings.mode === 'days') return joinedAt + settings.amount * DAY;
  return null;
}

const queueKey = (tripId, uid) => `${tripId}_${uid}`;
const queueRef = key => db.ref(`passport_queue/${key}`);

// A person joined: queue their link unless the organisation sends by hand, they are staff, or a link exists.
async function enqueueJoin({ orgId, tripId, uid, now = Date.now() }) {
  if ((await db.ref(`orgs/${orgId}/staff/${uid}`).get()).exists()) return null;
  const due = dueAt(await getSettings(orgId), now);
  if (due === null || await links.linkIsActive(tripId, uid, now)) return null;
  await queueRef(queueKey(tripId, uid)).set({ org_id: orgId, trip_id: tripId, uid, send_at: due });
  return due;
}

async function orgName(orgId) { return (await db.ref(`orgs/${orgId}/metadata/name`).get()).val() || ''; }

// Mails a fresh link to each person; a new link withdraws the earlier one.
// uids: the people asked for; null means everyone on the trip. onlyNew skips people who are finished or hold a usable link.
async function sendLinks({ orgId, tripId, uids, onlyNew = !uids, by = null, lang, source = 'staff', ip, now = Date.now() }) {
  const { tripExpiry } = require('../participantAccessService');
  const trip = await inv.loadTrip(orgId, tripId);
  if (!tripExpiry(trip, now)) throw new HttpsError('failed-precondition', 'This trip has ended or is invalid.');
  const [members, staff, settings] = await Promise.all([
    db.ref(`trips_participants/${tripId}`).get().then(s => s.val() || {}),
    db.ref(`orgs/${orgId}/staff`).get().then(s => s.val() || {}),
    getSettings(orgId),
  ]);
  const everyone = Object.keys(members).filter(uid => !staff[uid]);
  const targets = uids || everyone;
  const language = lang || settings.lang || 'en';
  const skipped = {}, ready = [];
  for (const uid of [...new Set(targets)]) {
    if (!members[uid] || staff[uid]) { skipped[uid] = 'not_participant'; continue; }
    const [index, status] = await Promise.all([links.indexRef(tripId, uid).get().then(s => s.val()), store.statusRef(orgId, tripId, uid).child('complete').get().then(s => s.val())]);
    const active = index && !index.revoked_at && index.expires_at > now;
    if (onlyNew && (status === true || active)) { skipped[uid] = status === true ? 'complete' : 'already_sent'; continue; }
    if (!onlyNew && index?.sent_at && now - index.sent_at < RESEND_GAP_MS) { skipped[uid] = 'recent'; continue; }
    const contact = await store.accountContact(uid);
    if (!contact.email) { skipped[uid] = 'no_email'; continue; }
    ready.push({ uid, email: contact.email });
  }
  if (ready.length) await inv.takeMailBudget(orgId, ready.length, now);
  const org = await orgName(orgId);
  const { sendEmail } = require('../emailService');
  let sent = 0, failed = 0, fallback = false;
  await inv.mapLimit(ready, 10, async ({ uid, email }) => {
    const link = await links.createLink({ orgId, tripId, uid, by, lang: language, now });
    try {
      const built = mail.buildLinkMail({ lang: language, org, trip, token: link.token });
      fallback = built.fallback;
      await sendEmail({ to: email, subject: built.subject, html: built.html, customArgs: { org_id: orgId, trip_id: tripId, kind: 'passport_link' } });
      await links.markSent(tripId, uid, now);
      sent++;
    } catch (error) {
      failed++;
      console.warn('Passport link mail failed', { tripId, uid, message: error.message });
      await links.revokeLink({ tripId, uid, now });
      skipped[uid] = 'send_failed';
    }
  });
  await writeAuditLog(orgId, { action: 'PASSPORT_LINKS_SENT', byUid: by, targetId: tripId, ipAddress: ip,
    extra: { sent, failed, skipped: Object.keys(skipped).length - failed, source, lang: language } });
  return { sent, skipped: Object.keys(skipped).length - failed, failed, reasons: skipped, lang_fallback: fallback };
}

// Sends every queued link that is due. Claims each entry first so two overlapping runs cannot mail twice.
async function processDue({ now = Date.now(), limit = 100 } = {}) {
  const due = (await db.ref('passport_queue').orderByChild('send_at').endAt(now).limitToFirst(limit).get()).val() || {};
  const result = { sent: 0, dropped: 0, held: 0 };
  for (const [key, entry] of Object.entries(due)) {
    const claim = await queueRef(key).transaction(cur => (!cur ? cur : cur.claimed_at && now - cur.claimed_at < CLAIM_MS ? undefined : { ...cur, claimed_at: now }));
    if (!claim.committed || !claim.snapshot.val()) continue;
    try {
      const out = await sendLinks({ orgId: entry.org_id, tripId: entry.trip_id, uids: [entry.uid], onlyNew: true, source: 'queue', now });
      result.sent += out.sent;
      if (!out.sent && !out.failed) result.dropped++;
      if (out.failed) { await queueRef(key).update({ claimed_at: null, send_at: now + RESEND_GAP_MS }); result.held++; continue; }
    } catch (error) {
      const retry = error.code === 'resource-exhausted';
      console.warn('Passport queue entry not sent', { key, message: error.message });
      if (retry) { await queueRef(key).update({ claimed_at: null }); result.held++; break; }
      result.dropped++; // the trip ended or vanished: nothing left to send
    }
    await queueRef(key).remove();
  }
  return result;
}

module.exports = { MODES, DEFAULT_SETTINGS, RESEND_GAP_MS, getSettings, cleanSettings, dueAt, queueKey, enqueueJoin, sendLinks, processDue, settingsRef, orgName };
