// Phase 5: the passport. Pilgrims are not Firebase users: they open a personal link, prove themselves with a
// mailed code and then work with a short session token (passport* callables, no auth). Staff create, send and
// withdraw the links and set the timing; they never read the data here (the staff read screens are phase 5 part 2).
const { HttpsError } = require('firebase-functions/v2/https');
const { onValueCreated } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { z } = require('zod');
const { onCall } = require('../middleware/participantAccessMiddleware');
const { db } = require('../admin');
const { verifyAppCheck, requireAuth, requireRole } = require('../middleware/appCheckMiddleware');
const { writeAuditLog } = require('../services/auditService');

const STAFF = ['admin', 'co-host'];
const ID = z.string().regex(/^[-\w]{1,64}$/);
const TOKEN = z.string().max(100);
const LANG = z.string().max(10);

function parse(schema, data) {
  const result = schema.safeParse(data || {});
  if (!result.success) throw new HttpsError('invalid-argument', result.error.issues[0]?.message || 'Invalid request.');
  return result.data;
}
const svc = {
  links: () => require('../services/passport/passportLinks'),
  store: () => require('../services/passport/passportStore'),
  send: () => require('../services/passport/passportSend'),
  family: () => require('../services/passport/passportFamily'),
  mail: () => require('../services/passport/passportMail'),
  valid: () => require('../services/passport/passportValidation'),
  inv: () => require('../services/invitations/invitationService'),
};
const ip = request => request.rawRequest?.ip;

// Staff: admin or co-host of the organisation named in the request, by token and by the staff map; managers only read settings.
async function staffContext(request, orgId, roles = STAFF) {
  verifyAppCheck(request);
  requireAuth(request);
  requireRole(request, roles);
  if (request.auth.token.orgId !== orgId) throw new HttpsError('permission-denied', 'Organization staff access is required.');
  const { requireOrgStaff } = require('../services/tripSeatService');
  await requireOrgStaff(orgId, request.auth.uid, roles);
  return { uid: request.auth.uid, role: request.auth.token.role };
}

// Pilgrim: the session names the trip and the person; every callable takes these from the session, never from the request.
async function sessionContext(request) {
  const { session } = parse(z.object({ session: TOKEN }), request.data);
  const found = await svc.links().resolveSession(session);
  const { org_id: org, trip_id: trip, uid } = found.record;
  const stillThere = (await db.ref(`trips_participants/${trip}/${uid}`).get()).val();
  if (!stillThere) throw new HttpsError('unauthenticated', 'Start again with your link.', { reason: 'session' });
  return { org, trip, uid, sessionHash: found.hash, link: found.link };
}
async function audit(ctx, action, request, extra = {}) {
  await writeAuditLog(ctx.org, { action, byUid: ctx.uid, targetId: ctx.trip, ipAddress: ip(request), extra: { via: 'passport_link', ...extra } });
}

async function mailCode({ link, uid, code }) {
  const contact = await svc.store().accountContact(uid);
  if (!contact.email) throw new HttpsError('failed-precondition', 'There is no email address on this account.', { reason: 'no_email' });
  const built = svc.mail().buildCodeMail({ lang: link.lang || 'en', code });
  await require('../services/emailService').sendEmail({ to: contact.email, subject: built.subject, html: built.html, customArgs: { kind: 'passport_code' } });
  return contact.email;
}
const PILGRIM = { region: 'europe-west1', secrets: ['SENDGRID_API_KEY'] };

// -> { email_masked, needs_code, org_name, trip_title, lang? }. Sends the first code when none is waiting.
exports.passportOpen = onCall(PILGRIM, async request => {
  const { t } = parse(z.object({ t: TOKEN }), request.data);
  const { hash, link } = await svc.links().resolveLink(t);
  const [member, trip, orgName, contact] = await Promise.all([
    db.ref(`trips_participants/${link.trip_id}/${link.uid}`).get().then(s => s.val()),
    db.ref(`orgs/${link.org_id}/trips/${link.trip_id}`).get().then(s => s.val()),
    svc.send().orgName(link.org_id), svc.store().accountContact(link.uid),
  ]);
  if (!member || !trip) throw new HttpsError('not-found', 'This link is not valid.', { reason: 'invalid' });
  if (!contact.email) throw new HttpsError('failed-precondition', 'There is no email address on this account.', { reason: 'no_email' });
  const issued = await svc.links().issueCode(hash, { auto: true });
  if (issued.code) {
    try { await mailCode({ link, uid: link.uid, code: issued.code }); } catch (error) { console.warn('Passport code mail failed', { message: error.message }); }
  }
  return { email_masked: require('../services/passport/passportTokens').maskEmail(contact.email), needs_code: true, org_name: orgName, trip_title: trip.title || '', ...(link.lang ? { lang: link.lang } : {}) };
});

// -> { session, expires_at }
exports.passportVerify = onCall({ region: 'europe-west1' }, async request => {
  const { t, code } = parse(z.object({ t: TOKEN, code: z.string().max(20) }), request.data);
  const { hash, link } = await svc.links().resolveLink(t);
  await svc.links().verifyCode(hash, code);
  const out = await svc.links().createSession({ hash, link });
  await audit({ org: link.org_id, trip: link.trip_id, uid: link.uid }, 'PASSPORT_SESSION_STARTED', request);
  return out;
});

// -> { ok: true, cooldown_s }; refused with reason cooldown (retry_after_s) or hourly_limit.
exports.passportResend = onCall(PILGRIM, async request => {
  const { t } = parse(z.object({ t: TOKEN }), request.data);
  const { hash, link } = await svc.links().resolveLink(t);
  const issued = await svc.links().issueCode(hash);
  if (!issued.code) {
    throw new HttpsError('resource-exhausted', issued.reason === 'cooldown' ? 'Wait a moment before asking for another code.' : 'Too many codes requested. Try again later.',
      { reason: issued.reason, ...(issued.retry_after_s ? { retry_after_s: issued.retry_after_s } : {}) });
  }
  await mailCode({ link, uid: link.uid, code: issued.code });
  return { ok: true, cooldown_s: Math.round(svc.links().CODE_COOLDOWN_MS / 1000) };
});

// -> { steps{gegevens, visum, paspoort, medisch, noodcontact, familie: {status, data}}, trip{needs_copy}, family{incoming[], outgoing[]} }
exports.passportGet = onCall({ region: 'europe-west1' }, async request => {
  const ctx = await sessionContext(request);
  const [steps, needsCopy, family] = await Promise.all([
    svc.store().stepsView(ctx.org, ctx.trip, ctx.uid), svc.store().tripNeedsCopy(ctx.trip), svc.family().view(ctx)]);
  // One audit entry per session for reading one's own sensitive data.
  const first = await svc.links().sessionRef(ctx.sessionHash).child('read_logged').transaction(v => (v ? undefined : true));
  if (first.committed) await audit(ctx, 'PASSPORT_DATA_READ', request);
  return { steps, trip: { needs_copy: needsCopy }, family };
});

// -> { steps }. The data is checked on the server for every step.
exports.passportSave = onCall({ region: 'europe-west1' }, async request => {
  const ctx = await sessionContext(request);
  const { step, data } = parse(z.object({ step: z.string().max(30), data: z.any() }), request.data);
  const { validateStep, maskPassportNumber } = svc.valid();
  const store = svc.store();
  let input = data;
  const isObject = data && typeof data === 'object' && !Array.isArray(data);
  if (isObject && ['gegevens', 'paspoort'].includes(step)) {
    const existing = (await store.loadRecord(ctx.org, ctx.trip, ctx.uid)).stored[step];
    if (step === 'gegevens') {
      // "Gegevens zijn correct" sends only the confirmation: the saved or account values are checked and kept.
      const { name, phone, email } = existing || await store.accountContact(ctx.uid);
      input = { name, phone, email, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
    } else if (existing && (data.number === undefined || data.number === maskPassportNumber(existing.number))) {
      // The number is only sent when changed; the masked one sent back unchanged keeps the stored one.
      input = { ...data, number: existing.number };
    }
  }
  const clean = validateStep(step, input);
  await store.saveStep(ctx.org, ctx.trip, ctx.uid, step, clean);
  await audit(ctx, 'PASSPORT_STEP_SAVED', request, { step });
  return { steps: await store.stepsView(ctx.org, ctx.trip, ctx.uid) };
});

// -> { ok: true, uploaded_at }
exports.passportUpload = onCall({ region: 'europe-west1', memory: '512MiB' }, async request => {
  const ctx = await sessionContext(request);
  const { kind, dataUrl } = parse(z.object({ kind: z.string().max(20), dataUrl: z.string().max(8 * 1024 * 1024) }), request.data);
  const doc = svc.valid().decodeDocument(dataUrl, kind);
  const store = svc.store();
  if (!(await store.tripNeedsCopy(ctx.trip))) throw new HttpsError('failed-precondition', 'Your travel organisation does not need a copy for this trip.', { reason: 'copy_not_needed' });
  if (!(await svc.links().takeUpload(ctx.sessionHash))) throw new HttpsError('resource-exhausted', 'Too many uploads. Open your link again later.', { reason: 'upload_limit' });
  const uploaded_at = await store.storeDocument(ctx.org, ctx.trip, ctx.uid, kind, doc);
  await audit(ctx, 'PASSPORT_DOCUMENT_UPLOADED', request, { kind });
  return { ok: true, uploaded_at };
});

// -> { ok: true, status: 'sent' }, the same for every well-formed request.
exports.familyRequest = onCall({ region: 'europe-west1' }, async request => {
  const ctx = await sessionContext(request);
  const { email, relation } = parse(z.object({ email: z.string().max(320), relation: z.string().max(20) }), request.data);
  const out = await svc.family().request({ org: ctx.org, trip: ctx.trip, uid: ctx.uid, email, relation });
  await audit(ctx, 'PASSPORT_FAMILY_REQUESTED', request);
  return out;
});

// -> { ok: true, family{incoming[], outgoing[]} }
exports.familyAnswer = onCall({ region: 'europe-west1' }, async request => {
  const ctx = await sessionContext(request);
  const { id, relation, decline } = parse(z.object({ id: z.string().max(64), relation: z.string().max(20).optional(), decline: z.boolean().optional() }), request.data);
  const out = await svc.family().answer({ org: ctx.org, trip: ctx.trip, uid: ctx.uid, id, relation, decline });
  await audit(ctx, decline ? 'PASSPORT_FAMILY_DECLINED' : 'PASSPORT_FAMILY_CONFIRMED', request);
  return out;
});

// ── Staff ────────────────────────────────────────────────────────────────────────

// -> { mode, amount, lang, trip?: { needs_copy } }
exports.getPassportSettings = onCall({ region: 'europe-west1' }, async request => {
  const { orgId, tripId } = parse(z.object({ orgId: ID, tripId: ID.optional() }), request.data);
  await staffContext(request, orgId, ['admin', 'co-host', 'manager']);
  const out = await svc.send().getSettings(orgId);
  if (tripId) {
    await svc.inv().loadTrip(orgId, tripId);
    out.trip = { needs_copy: await svc.store().tripNeedsCopy(tripId) };
  }
  return { mode: out.mode, amount: out.amount, lang: out.lang, ...(out.trip ? { trip: out.trip } : {}) };
});

// Timing and language are Admin only; "needs a copy" per trip is Admin or Co-Host. -> the settings as getPassportSettings.
exports.setPassportSettings = onCall({ region: 'europe-west1' }, async request => {
  const input = parse(z.object({ orgId: ID, mode: z.string().max(10).optional(), amount: z.number().optional(), lang: LANG.optional(),
    tripId: ID.optional(), needs_copy: z.boolean().optional() }), request.data);
  const { uid, role } = await staffContext(request, input.orgId);
  const touchesOrg = ['mode', 'amount', 'lang'].some(k => input[k] !== undefined);
  const touchesTrip = input.needs_copy !== undefined;
  if (!touchesOrg && !touchesTrip) throw new HttpsError('invalid-argument', 'Nothing to change.');
  if (touchesTrip && !input.tripId) throw new HttpsError('invalid-argument', 'A trip is required for the copy setting.');
  if (touchesOrg && role !== 'admin') throw new HttpsError('permission-denied', 'Only an admin can change when the links are sent.');
  const send = svc.send();
  const now = Date.now();
  if (touchesOrg) {
    const next = send.cleanSettings(input, await send.getSettings(input.orgId));
    await send.settingsRef(input.orgId).set({ ...next, updated_at: now, by: uid });
  }
  if (touchesTrip) {
    await svc.inv().loadTrip(input.orgId, input.tripId);
    await svc.store().tripSettingsRef(input.tripId).set({ org_id: input.orgId, needs_copy: input.needs_copy, updated_at: now, by: uid });
  }
  await writeAuditLog(input.orgId, { action: 'PASSPORT_SETTINGS_CHANGED', byUid: uid, targetId: input.tripId || null, ipAddress: ip(request),
    extra: { ...(touchesOrg ? { org: true } : {}), ...(touchesTrip ? { needs_copy: input.needs_copy } : {}) } });
  const s = await send.getSettings(input.orgId);
  return { mode: s.mode, amount: s.amount, lang: s.lang, ...(input.tripId ? { trip: { needs_copy: await svc.store().tripNeedsCopy(input.tripId) } } : {}) };
});

// uids: a list, or the word "all" (also all: true) for everyone on the trip without a usable link who is not finished.
// -> { sent, skipped, failed, reasons: { uid: reason }, lang_fallback }
exports.sendPassportLinks = onCall({ region: 'europe-west1', secrets: ['SENDGRID_API_KEY'], timeoutSeconds: 300 }, async request => {
  const input = parse(z.object({ orgId: ID, tripId: ID, uids: z.union([z.literal('all'), z.array(ID).min(1).max(500)]).optional(),
    all: z.boolean().optional(), lang: LANG.optional() }), request.data);
  const { uid } = await staffContext(request, input.orgId);
  const everyone = input.uids === 'all' || input.all === true;
  if (!everyone && !Array.isArray(input.uids)) throw new HttpsError('invalid-argument', 'Choose who to send to.');
  if (input.lang !== undefined && !require('../services/deen/deenParser').LANGS.includes(input.lang)) throw new HttpsError('invalid-argument', 'Unknown language.');
  return svc.send().sendLinks({ orgId: input.orgId, tripId: input.tripId, uids: everyone ? null : input.uids, by: uid, lang: input.lang, ip: ip(request) });
});

// -> { revoked: boolean }
exports.revokePassportLink = onCall({ region: 'europe-west1' }, async request => {
  const input = parse(z.object({ orgId: ID, tripId: ID, uid: ID }), request.data);
  const { uid } = await staffContext(request, input.orgId);
  await svc.inv().loadTrip(input.orgId, input.tripId);
  const revoked = await svc.links().revokeLink({ tripId: input.tripId, uid: input.uid });
  await writeAuditLog(input.orgId, { action: 'PASSPORT_LINK_REVOKED', byUid: uid, targetId: input.uid, ipAddress: ip(request), extra: { trip: input.tripId, revoked } });
  return { revoked };
});

// ── Triggers and schedules ─────────────────────────────────────────────────────────

// A person joined a trip: queue their link by the organisation's timing; "direct" goes out at once.
exports.onPassportParticipantJoined = onValueCreated({ ref: '/trips_participants/{tripId}/{uid}', region: 'europe-west1', secrets: ['SENDGRID_API_KEY'] }, async event => {
  const { tripId, uid } = event.params;
  const orgId = (await db.ref(`trips_orgs/${tripId}`).get()).val();
  if (!orgId) return;
  const due = await svc.send().enqueueJoin({ orgId, tripId, uid });
  if (due !== null && due <= Date.now()) await svc.send().processDue();
});
exports.sendDuePassportLinks = onSchedule({ schedule: 'every 5 minutes', region: 'europe-west1', retryCount: 2, secrets: ['SENDGRID_API_KEY'] }, async () => {
  await svc.send().processDue();
});
exports.passportRetention = onSchedule({ schedule: 'every day 03:30', timeZone: 'Europe/Amsterdam', region: 'europe-west1', retryCount: 2, timeoutSeconds: 540 }, async () => {
  const result = await require('../services/passport/passportRetention').runRetention();
  console.log('Passport retention', result);
});
