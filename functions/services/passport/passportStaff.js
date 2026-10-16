// Staff side of the passport (phase 5 part 2): the trip overview with the Vertrekklaar meter, the dossier, opening
// a document or a hidden value behind the fresh phone approval (F1), and the reminder. Staff only ever get masked
// values; the passport number and medical notes leave only through openDocument, which is audited without values.
const { HttpsError } = require('firebase-functions/v2/https');
const { admin, db } = require('../../admin');
const { writeAuditLog } = require('../auditService');
const inv = require('../invitations/invitationService');
const approval = require('../sensitiveApprovalService');
const links = require('./passportLinks');
const mail = require('./passportMail');
const store = require('./passportStore');
const send = require('./passportSend');
const { maskEmail } = require('./passportTokens');
const { STEPS, maskPassportNumber } = require('./passportValidation');

const HOUR = 60 * 60 * 1000;
const REMIND_GAP_MS = 24 * HOUR;
const URL_TTL_MS = 5 * 60 * 1000;
const DOCUMENT_KINDS = ['passport', 'visa'];
const VALUE_KINDS = ['passport_number', 'medical'];
const PURPOSE = { passport: 'passport_document', visa: 'passport_document', passport_number: 'passport_number', medical: 'medical' };
const MS = value => (Number.isFinite(value) ? value : null);

const blankStatus = () => ({ ...Object.fromEntries(STEPS.map(step => [step, 'todo'])), complete: false });
function cleanStatus(raw) {
  const out = blankStatus();
  for (const step of STEPS) if (raw?.[step] === 'done') out[step] = 'done';
  out.complete = raw?.complete === true;
  return out;
}
// Vertrekklaar (F11): passport, visa and one emergency contact. Family and the rest never hold anyone back.
const isReady = status => status.paspoort === 'done' && status.visum === 'done' && status.noodcontact === 'done';

// Everyone on the trip who is not organisation staff.
async function participantsOf(orgId, tripId) {
  const [members, staff] = await Promise.all([
    db.ref(`trips_participants/${tripId}`).get().then(s => s.val() || {}),
    db.ref(`orgs/${orgId}/staff`).get().then(s => s.val() || {}),
  ]);
  return Object.keys(members).filter(uid => !staff[uid]);
}
async function requireParticipant(orgId, tripId, uid) {
  if (!(await participantsOf(orgId, tripId)).includes(uid)) throw new HttpsError('not-found', 'This person is not on the trip.', { reason: 'not_participant' });
}

// Confirmed family links of a trip: [{ from, to, relation }], relation = what `to` is to `from`. A confirmed request
// gives two links, the sender's and the answer of the recipient.
async function confirmedLinks(orgId, tripId) {
  const records = (await db.ref(`passport_family/${orgId}/${tripId}`).get()).val() || {};
  const out = [];
  for (const [id, r] of Object.entries(records)) {
    if (r.status !== 'confirmed' || !r.from_uid || !r.to_uid) continue;
    out.push({ id, from: r.from_uid, to: r.to_uid, relation: r.relation });
    if (r.answer_relation) out.push({ id, from: r.to_uid, to: r.from_uid, relation: r.answer_relation });
  }
  return out;
}
// Groups the confirmed links into families (people connected through any chain of links).
function groupFamilies(all) {
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const l of all) for (const uid of [l.from, l.to]) if (!parent.has(uid)) parent.set(uid, uid);
  for (const l of all) parent.set(find(l.from), find(l.to));
  const groups = new Map();
  for (const l of all) {
    const root = find(l.from);
    if (!groups.has(root)) groups.set(root, { ids: new Set(), members: new Set(), links: [] });
    const g = groups.get(root);
    g.ids.add(l.id); g.members.add(l.from); g.members.add(l.to); g.links.push({ from: l.from, to: l.to, relation: l.relation });
  }
  return [...groups.values()].map(g => ({ id: [...g.ids].sort()[0], members: [...g.members].sort(), links: g.links }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

async function overview({ orgId, tripId, now = Date.now() }) {
  await inv.loadTrip(orgId, tripId);
  const uids = await participantsOf(orgId, tripId);
  const [needsCopy, statuses, index, all] = await Promise.all([
    store.tripNeedsCopy(tripId),
    db.ref(`passport_status/${orgId}/${tripId}`).get().then(s => s.val() || {}),
    db.ref(`passport_link_index/${tripId}`).get().then(s => s.val() || {}),
    confirmedLinks(orgId, tripId),
  ]);
  const waiting = uids.filter(uid => { const link = index[uid]; return !(link && !link.revoked_at && !link.locked_at && link.expires_at > now && link.sent_at); });
  const queued = {};
  await inv.mapLimit(waiting, 25, async uid => { queued[uid] = (await db.ref(`passport_queue/${send.queueKey(tripId, uid)}`).get()).val(); });
  const meter = { total: uids.length, ready: 0, passport: 0, visa: 0, emergency: 0 };
  const rows = uids.map(uid => {
    const status = cleanStatus(statuses[uid]);
    const link = index[uid];
    const usable = !!(link && !link.revoked_at && !link.locked_at && link.expires_at > now && link.sent_at);
    let state = 'not_sent', sentAt = null, sendAt = null;
    if (usable) { state = 'sent'; sentAt = MS(link.sent_at); }
    else if (queued[uid] && Number.isFinite(queued[uid].send_at)) { state = 'scheduled'; sendAt = queued[uid].send_at; }
    if (isReady(status)) meter.ready++;
    if (status.paspoort === 'done') meter.passport++;
    if (status.visum === 'done') meter.visa++;
    if (status.noodcontact === 'done') meter.emergency++;
    return { uid, send: state, sent_at: sentAt, send_at: sendAt, status, last_reminded_at: MS(statuses[uid]?.last_reminded_at) };
  });
  return { needs_copy: needsCopy, meter, rows, families: groupFamilies(all) };
}

// +31612345678 -> +31•••••78
function maskPhone(phone) {
  const chars = [...String(phone || '').replace(/[\s().-]/g, '')];
  if (!chars.length) return '';
  if (chars.length <= 4) return '•'.repeat(chars.length);
  const head = chars[0] === '+' ? 3 : 0;
  return chars.slice(0, head).join('') + '•'.repeat(chars.length - head - 2) + chars.slice(-2).join('');
}

// The trip the dossier shows: asked for, else the next one that starts, else the latest.
async function pickTrip(orgId, uid, tripId, now) {
  if (tripId) {
    const trip = await inv.loadTrip(orgId, tripId);
    await requireParticipant(orgId, tripId, uid);
    return { id: tripId, trip };
  }
  const trips = (await db.ref(`orgs/${orgId}/trips`).get()).val() || {};
  const mine = [];
  for (const [id, trip] of Object.entries(trips)) {
    if ((await db.ref(`trips_participants/${id}/${uid}`).get()).val()) mine.push({ id, trip });
  }
  if (!mine.length) throw new HttpsError('not-found', 'This person is not on a trip of your organisation.', { reason: 'not_participant' });
  const start = x => (Number.isFinite(x.trip.start_date) ? x.trip.start_date : 0);
  const upcoming = mine.filter(x => start(x) >= now).sort((a, b) => start(a) - start(b));
  const chosen = upcoming[0] || mine.sort((a, b) => start(b) - start(a))[0];
  await requireParticipant(orgId, chosen.id, uid);
  return chosen;
}

async function dossier({ orgId, uid, tripId, by, ip, now = Date.now() }) {
  const picked = await pickTrip(orgId, uid, tripId, now);
  if ((await db.ref(`orgs/${orgId}/staff/${uid}`).get()).exists()) throw new HttpsError('not-found', 'This person is not on the trip.', { reason: 'not_participant' });
  const trip = picked.id;
  const [loaded, contact, needsCopy, statusRaw, all] = await Promise.all([
    store.loadRecord(orgId, trip, uid), store.accountContact(uid), store.tripNeedsCopy(trip),
    db.ref(`passport_status/${orgId}/${trip}/${uid}`).get().then(s => s.val()), confirmedLinks(orgId, trip),
  ]);
  const { stored, docs } = loaded;
  const given = stored.gegevens || {};
  const family = [];
  for (const l of all) if (l.from === uid) family.push({ uid: l.to, relation: l.relation });
  const doc = d => (d && Number.isFinite(d.uploaded_at) ? { uploaded_at: d.uploaded_at } : null);
  const out = {
    trip_id: trip, trip_title: picked.trip.title || '', needs_copy: needsCopy,
    contact: { email_masked: maskEmail(given.email || contact.email || ''), phone_masked: maskPhone(given.phone || contact.phone) },
    status: cleanStatus(statusRaw),
    passport: stored.paspoort ? { number_masked: maskPassportNumber(stored.paspoort.number), nationality: stored.paspoort.nationality || '', expiry: stored.paspoort.expiry || '' } : null,
    has_visa: typeof stored.visum?.has_visa === 'boolean' ? stored.visum.has_visa : null,
    documents: { passport: doc(docs.passport), visa: doc(docs.visa) },
    allergies: stored.medisch?.allergies || '',
    has_medical_notes: !!String(stored.medisch?.notes || '').trim(),
    emergency_contacts: (stored.noodcontact?.contacts || []).map(c => ({ name: c.name, relation: c.relation, phone_masked: maskPhone(c.phone) })),
    family,
  };
  await writeAuditLog(orgId, { action: 'PASSPORT_DOSSIER_READ', byUid: by, targetId: uid, ipAddress: ip, extra: { trip } });
  return out;
}

// A link to the private file that works for five minutes and downloads instead of showing in the browser. The
// storage emulator cannot sign: there the file gets the download headers and a download token instead (local only).
async function signedUrl(file, filename, now) {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    if (!host) throw new HttpsError('failed-precondition', 'Storage is not available.');
    const token = require('crypto').randomUUID();
    await file.setMetadata({ contentDisposition: `attachment; filename="${filename}"`, metadata: { firebaseStorageDownloadTokens: token } });
    return `http://${host}/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
  }
  const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: now + URL_TTL_MS, responseDisposition: `attachment; filename="${filename}"` });
  return url;
}

// Gate: admin / co-host role is checked by the caller; here the fresh approval, then the value or the link.
async function openDocument({ orgId, tripId, uid, kind, by, ip, now = Date.now() }) {
  if (![...DOCUMENT_KINDS, ...VALUE_KINDS].includes(kind)) throw new HttpsError('invalid-argument', 'Unknown kind.', { reason: 'invalid_kind' });
  await inv.loadTrip(orgId, tripId);
  await requireParticipant(orgId, tripId, uid);
  await approval.requireFreshApproval(db, by, { now });
  let out;
  if (DOCUMENT_KINDS.includes(kind)) {
    const entry = (await store.dataRef(orgId, tripId, uid).child(`docs/${kind}`).get()).val();
    if (!entry?.path || !entry.path.startsWith(store.docPrefix(orgId, tripId, uid))) throw new HttpsError('not-found', 'No document was uploaded.', { reason: 'no_document' });
    const file = admin.storage().bucket().file(entry.path);
    if (!(await file.exists())[0]) throw new HttpsError('not-found', 'No document was uploaded.', { reason: 'no_document' });
    out = { url: await signedUrl(file, `${kind}.${entry.path.split('.').pop()}`, now) };
  } else {
    const { stored } = await store.loadRecord(orgId, tripId, uid);
    if (kind === 'passport_number') {
      if (!stored.paspoort?.number) throw new HttpsError('not-found', 'No passport number was saved.', { reason: 'no_value' });
      out = { value: stored.paspoort.number };
    } else {
      out = { value: String(stored.medisch?.notes || '') };
    }
  }
  await writeAuditLog(orgId, { action: approval.AUDIT_ACTIONS.documentOpened, byUid: by, targetId: uid, ipAddress: ip, extra: { trip: tripId, kind, purpose: PURPOSE[kind] } });
  return out;
}

const defaultPush = (uid, title, body, data) => require('../notificationService').sendPushNotification(uid, title, body, data, { tripId: data.tripId });

// Reminds everyone not Vertrekklaar who has not been reminded in the last 24 hours. A reminder carries a fresh link
// (an existing one cannot be read back from its hash), so the earlier link ends once the new mail is out.
// -> { reminded, skipped, reasons: { uid: 'ready'|'recent'|'no_email'|'not_participant'|'send_failed' } }
async function remind({ orgId, tripId, uids, by, ip, push = defaultPush, now = Date.now() }) {
  const { tripExpiry } = require('../participantAccessService');
  const trip = await inv.loadTrip(orgId, tripId);
  if (!tripExpiry(trip, now)) throw new HttpsError('failed-precondition', 'This trip has ended or is invalid.');
  const members = await participantsOf(orgId, tripId);
  const reasons = {}, ready = [];
  for (const uid of [...new Set(uids || members)]) {
    if (!members.includes(uid)) { reasons[uid] = 'not_participant'; continue; }
    const statusRaw = (await store.statusRef(orgId, tripId, uid).get()).val();
    if (isReady(cleanStatus(statusRaw))) { reasons[uid] = 'ready'; continue; }
    if (Number.isFinite(statusRaw?.last_reminded_at) && now - statusRaw.last_reminded_at < REMIND_GAP_MS) { reasons[uid] = 'recent'; continue; }
    const contact = await store.accountContact(uid);
    if (!contact.email) { reasons[uid] = 'no_email'; continue; }
    ready.push({ uid, email: contact.email, previous: statusRaw?.last_reminded_at ?? null });
  }
  if (ready.length) { await inv.takeMailBudget(orgId, ready.length, now); await store.registerRetention(orgId, tripId, now); }
  const [org, settings] = await Promise.all([send.orgName(orgId), send.getSettings(orgId)]);
  const { sendEmail } = require('../emailService');
  let reminded = 0;
  await inv.mapLimit(ready, 10, async ({ uid, email, previous }) => {
    // Claim the 24 hours first so two clicks at once mail once.
    const claim = await store.statusRef(orgId, tripId, uid).child('last_reminded_at').transaction(cur => (Number.isFinite(cur) && now - cur < REMIND_GAP_MS ? undefined : now));
    if (!claim.committed) { reasons[uid] = 'recent'; return; }
    const lang = await send.languageFor(uid, { indexLang: (await links.indexRef(tripId, uid).child('lang').get()).val(), settings });
    const link = await links.createLink({ orgId, tripId, uid, by, lang, now });
    try {
      const built = mail.buildReminderMail({ lang, org, trip, token: link.token });
      await sendEmail({ to: email, subject: built.subject, html: built.html, customArgs: { org_id: orgId, trip_id: tripId, kind: 'passport_reminder' } });
      if (process.env.FUNCTIONS_EMULATOR !== 'true' || push !== defaultPush) {
        await Promise.resolve(push(uid, built.push.title, built.push.body, { type: 'passport_reminder', tripId })).catch(() => {});
      }
    } catch (error) {
      console.warn('Passport reminder mail failed', { tripId, uid, message: error.message });
      await links.restoreLink({ tripId, uid, link, now });
      await store.statusRef(orgId, tripId, uid).child('last_reminded_at').set(previous);
      reasons[uid] = 'send_failed';
      return;
    }
    await links.markSent(tripId, uid, now);
    await links.revokeHash(link.previous?.revoked_at ? null : link.previous?.hash, now);
    reminded++;
  });
  await writeAuditLog(orgId, { action: 'PASSPORT_REMINDERS_SENT', byUid: by, targetId: tripId, ipAddress: ip, extra: { reminded, skipped: Object.keys(reasons).length } });
  return { reminded, skipped: Object.keys(reasons).length, reasons };
}

module.exports = { REMIND_GAP_MS, URL_TTL_MS, PURPOSE, isReady, maskPhone, groupFamilies, overview, dossier, openDocument, remind };
