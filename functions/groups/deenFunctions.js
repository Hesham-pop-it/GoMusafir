// Deen: create a trip as a conversation (T1, T2, T3). Admin and co-host only; managers are refused.
// The draft lives in deen_drafts/{uid}/{draftId} (owner read, server write).
const { HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { z } = require('zod');
const { onCall } = require('../middleware/participantAccessMiddleware');
const { db } = require('../admin');
const { verifyAppCheck, requireAuth, requireRole } = require('../middleware/appCheckMiddleware');
const { requireOrgStaff } = require('../services/tripSeatService');
const { writeAuditLog } = require('../services/auditService');
const { createTripRecord } = require('./tripCreationHelper');
const { decodeTripPhoto, saveTripPhoto } = require('../services/tripPhotoService');
const { LANGS } = require('../services/deen/deenParser');
const machine = require('../services/deen/deenMachine');
const svc = require('../services/deen/deenService');
const { createModel } = require('../services/deen/deenModel');
const { getPlanPricing } = require('../services/pricingService');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const STAFF = ['admin', 'co-host'];
const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

const startSchema = z.object({ copyFrom: z.string().regex(/^[-\w]{1,64}$/).optional(), lang: z.enum(LANGS) });
const saySchema = z.object({
  draftId: z.string().regex(/^[-\w]{1,64}$/),
  text: z.string().max(1000).optional(),
  action: z.enum(machine.ACTIONS).optional(),
  lang: z.enum(LANGS).optional(),
}).refine(v => (v.text !== undefined) !== (v.action !== undefined), { message: 'Send either text or an action.' });
const bannerSchema = z.object({ draftId: z.string().regex(/^[-\w]{1,64}$/).optional(), dataUrl: z.string() });
const checkoutSchema = z.object({ draftId: z.string().regex(/^[-\w]{1,64}$/), origin: z.string().max(100) });
const createSchema = z.object({ draftId: z.string().regex(/^[-\w]{1,64}$/) });

function parse(schema, data) {
  const result = schema.safeParse(data || {});
  if (!result.success) throw new HttpsError('invalid-argument', result.error.issues[0]?.message || 'Invalid request.');
  return result.data;
}
// Role from the token, membership and role from the organisation's staff map (managers never pass).
async function staffContext(request) {
  verifyAppCheck(request);
  requireAuth(request);
  requireRole(request, STAFF);
  const orgId = request.auth.token.orgId, uid = request.auth.uid;
  await requireOrgStaff(orgId, uid, STAFF);
  return { orgId, uid };
}
const secretValue = () => { try { return ANTHROPIC_API_KEY.value(); } catch (_) { return ''; } };
const publicState = draft => { const { first_name, ...state } = draft; return state; };
const turnContext = ({ orgId, uid, now = Date.now() }) => ({
  now,
  model: createModel({ apiKey: secretValue(), isEmulator: isEmulator() }),
  validateDestination: svc.validateDestination,
  quote: fields => svc.quoteSeats({ orgId, uid, fields }),
});

exports.deenStart = onCall({ region: 'europe-west1' }, async request => {
  const { orgId, uid } = await staffContext(request);
  const { copyFrom, lang } = parse(startSchema, request.data);
  const now = Date.now();
  await svc.pruneExpiredDrafts(uid, now);
  const source = copyFrom ? await svc.copySource(orgId, copyFrom) : null;
  const profile = (await db.ref(`users/${uid}`).get()).val() || {};
  const firstName = String(profile.first_name || profile.profile?.firstName || '').slice(0, 60);
  const id = db.ref(`deen_drafts/${uid}`).push().key;
  const draft = machine.newDraft({ id, lang, now, copyFrom: source, firstName });
  draft.org_id = orgId;
  const reply = source
    ? { key: 'copied', params: { title: source.title, name: firstName, templates_count: source.templatesCount, copy_title: draft.fields.title } }
    : { key: 'greeting', params: { name: firstName } };
  machine.pushMessage(draft, { role: 'deen', text: '', key: reply.key, params: reply.params }, now);
  if (source) {
    const next = await machine.advance(draft, turnContext({ orgId, uid, now }), null);
    machine.pushMessage(draft, { role: 'deen', text: '', key: next.key, params: next.params || {} }, now);
  }
  await svc.saveDraft(uid, draft);
  return { draftId: id, state: publicState(draft), reply };
});

exports.deenSay = onCall({ region: 'europe-west1', secrets: [ANTHROPIC_API_KEY] }, async request => {
  const { orgId, uid } = await staffContext(request);
  const input = parse(saySchema, request.data);
  const draft = await svc.loadDraft(uid, input.draftId, orgId);
  const previousRev = draft.rev ?? 0;
  if (input.lang) draft.lang = input.lang;
  const { reply, replies } = await machine.say(draft, { text: input.text, action: input.action }, turnContext({ orgId, uid }));
  await svc.saveDraft(uid, draft, previousRev);
  return { state: publicState(draft), reply, replies };
});

exports.uploadTripBanner = onCall({ region: 'europe-west1' }, async request => {
  const { orgId, uid } = await staffContext(request);
  const { draftId, dataUrl } = parse(bannerSchema, request.data);
  const bytes = decodeTripPhoto(dataUrl);
  const draft = draftId ? await svc.loadDraft(uid, draftId, orgId) : null;
  const url = await saveTripPhoto(bytes);
  if (draft) {
    const previousRev = draft.rev ?? 0;
    draft.fields.image = url;
    draft.banner_done = true;
    const wasBanner = draft.step === 'banner';
    const ctx = turnContext({ orgId, uid });
    const reply = wasBanner ? await machine.advance(draft, ctx, null) : { key: 'ask_' + draft.step, params: {} };
    machine.pushMessage(draft, { role: 'deen', text: '', key: reply.key, params: reply.params || {} }, ctx.now);
    draft.updated_at = ctx.now;
    await svc.saveDraft(uid, draft, previousRev);
  }
  return { url };
});

exports.deenCheckout = onCall({ region: 'europe-west1' }, async request => {
  const { orgId, uid } = await staffContext(request);
  const { draftId, origin } = parse(checkoutSchema, request.data);
  svc.resolveOrigin(origin);
  const draft = await svc.loadDraft(uid, draftId, orgId);
  const f = draft.fields;
  if (!f.start_date || !f.end_date || !f.participants) throw new HttpsError('failed-precondition', 'Dates and participants come first.');
  const quote = await svc.quoteSeats({ orgId, uid, fields: f });
  const url = svc.returnUrl(origin, draftId);
  if (quote.missing < 1) return { instant: true, url };
  if (isEmulator()) {
    // Emulator only: no payment provider is called; the seats are credited and the organiser returns.
    const credited = await svc.creditDeenSeats({ orgId, uid, operationId: `deen-fake:${draftId}:${draft.rev ?? 0}`, seats: quote.missing, source: 'emulator' });
    await writeAuditLog(orgId, { action: 'DEEN_SEATS_PURCHASED', byUid: uid, targetId: draftId, extra: { seats: quote.missing, source: 'emulator' } });
    return { url, fake: true, credited: credited.credited };
  }
  const country = (await db.ref(`users/${uid}/country`).get()).val();
  const countryCode = typeof country === 'object' ? country?.code : country;
  const pricing = getPlanPricing(countryCode, 'seat_only');
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create(
    svc.seatsSessionParams({ orgId, uid, draftId, missing: quote.missing, pricing, origin, countryCode }),
    { idempotencyKey: `deen-${draftId}-${quote.missing}-${draft.rev ?? 0}` });
  await db.ref(`orgs/${orgId}/checkout_sessions/${session.id}`).set({ status: 'pending', created_at: Date.now() });
  return { url: session.url };
});

exports.deenCreate = onCall({ region: 'europe-west1' }, async request => {
  const { orgId, uid } = await staffContext(request);
  const { draftId } = parse(createSchema, request.data);
  const draft = await svc.loadDraft(uid, draftId, orgId);
  if (draft.status === 'created' && draft.trip_id) return { tripId: draft.trip_id, trip_id: draft.trip_id };
  const f = draft.fields;
  if (!f.title || !f.destination || !f.start_date || !f.end_date || !f.participants) {
    throw new HttpsError('failed-precondition', 'The conversation is not finished yet.');
  }
  const previousRev = draft.rev ?? 0;
  // Same record, seat check and seat deduction as the form; a missing balance fails here too.
  const created = await createTripRecord({ orgId, uid, title: f.title, destination: f.destination, startDate: f.start_date,
    endDate: f.end_date, image: f.image || null, totalSeats: f.participants, operationId: `deen:${draftId}` });
  let copied = 0;
  if (draft.copy_from?.trip_id) {
    copied = await svc.copyTemplates({ orgId, fromTripId: draft.copy_from.trip_id, toTripId: created.tripId, uid });
  }
  await writeAuditLog(orgId, { action: 'TRIP_CREATED', byUid: uid, targetId: created.tripId, ipAddress: request.rawRequest?.ip,
    extra: { via: 'deen', draft_id: draftId, copied_from: draft.copy_from?.trip_id, templates_copied: copied } });
  draft.status = 'created';
  draft.trip_id = created.tripId;
  machine.setStep(draft, 'created');
  machine.pushMessage(draft, { role: 'deen', text: '', key: 'created', params: { title: f.title, trip_id: created.tripId, templates_copied: copied } }, Date.now());
  draft.updated_at = Date.now();
  await svc.saveDraft(uid, draft, previousRev);
  return { tripId: created.tripId, trip_id: created.tripId };
});
