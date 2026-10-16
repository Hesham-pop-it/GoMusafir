// Database side of Deen: drafts, the seat quote, seat credits, template copy and the checkout session.
// The conversation rules live in deenMachine.js; this file owns persistence and money.
const { HttpsError } = require('firebase-functions/v2/https');
const { db, admin } = require('../../admin');
const { seatUsage } = require('../tripSeatMath');
const { getPlanPricing } = require('../pricingService');
const { transactOrganization, operationKey } = require('../tripSeatService');
const { tripTimeZoneFields } = require('../tripTimeZoneService');

// Origins Stripe and the fake checkout may send the organiser back to.
const ALLOWED_ORIGINS = ['https://app.gomusafir.app', 'https://go-musafir.web.app', 'https://go-musafir.firebaseapp.com',
  'https://join.gomusafir.app', 'https://gomusafir.app', 'http://localhost:3100'];
function resolveOrigin(origin) {
  if (!ALLOWED_ORIGINS.includes(origin)) throw new HttpsError('invalid-argument', 'This origin is not allowed.');
  return origin;
}
const returnUrl = (origin, draftId, extra = '') => `${resolveOrigin(origin)}/admin/deen?draft=${encodeURIComponent(draftId)}${extra}`;

const draftRef = (uid, id) => db.ref(`deen_drafts/${uid}/${id}`);
const plain = value => JSON.parse(JSON.stringify(value));
const SAFE_ID = /^[-\w]{1,64}$/;

async function loadDraft(uid, draftId, orgId, now = Date.now()) {
  if (typeof draftId !== 'string' || !SAFE_ID.test(draftId)) throw new HttpsError('invalid-argument', 'A valid draft is required.');
  const draft = (await draftRef(uid, draftId).get()).val();
  if (!draft || (orgId && draft.org_id !== orgId)) throw new HttpsError('not-found', 'This conversation no longer exists.');
  if (now > draft.expires_at) {
    await draftRef(uid, draftId).remove();
    throw new HttpsError('not-found', 'This conversation has expired.');
  }
  draft.messages = Array.isArray(draft.messages) ? draft.messages : Object.values(draft.messages || {});
  // The database drops null values, so give every field back its explicit null.
  const empty = { title: null, image: null, destination: null, start_date: null, end_date: null, start_day: null, end_day: null, participants: null };
  draft.fields = { ...empty, ...(draft.fields || {}) };
  for (const key of ['editing', 'pending_start_day', 'seats']) if (draft[key] === undefined) draft[key] = null;
  return draft;
}

// Writes only if nobody changed the draft since it was read, so two tabs cannot interleave turns.
async function saveDraft(uid, draft, previousRev) {
  draft.rev = (previousRev ?? 0) + 1;
  const next = plain(draft);
  const result = await draftRef(uid, draft.id).transaction(cur => {
    if (cur === null) return previousRev === undefined ? next : cur;
    return (cur.rev ?? 0) === previousRev ? next : undefined;
  });
  if (!result.committed) throw new HttpsError('aborted', 'The conversation changed in another tab. Please try again.');
  return draft;
}

async function pruneExpiredDrafts(uid, now = Date.now()) {
  const all = (await db.ref(`deen_drafts/${uid}`).get()).val() || {};
  const updates = {};
  for (const [id, d] of Object.entries(all)) if (!d || !(now <= d.expires_at)) updates[`deen_drafts/${uid}/${id}`] = null;
  if (Object.keys(updates).length) await db.ref().update(updates);
}

async function quoteSeats({ orgId, uid, fields }) {
  const usage = seatUsage(fields.start_date, fields.end_date, fields.participants);
  const [available, country] = await Promise.all([
    db.ref(`orgs/${orgId}/prepaid_seats`).get().then(s => Number(s.val() || 0)),
    db.ref(`users/${uid}/country`).get().then(s => s.val()),
  ]);
  const code = typeof country === 'object' ? country?.code : country;
  const pricing = getPlanPricing(code, 'seat_only');
  const missing = Math.max(0, usage.requiredSeats - available);
  return { required: usage.requiredSeats, available, missing, periods: usage.seatPeriods, price: { amount: pricing.price, currency: pricing.currency },
    currency: pricing.currency, symbol: pricing.symbol, total: Math.round(missing * pricing.price * 100) / 100 };
}

const validateDestination = value => tripTimeZoneFields(value);

// Credits prepaid seats once per operation id (stripe session or emulator checkout).
async function creditDeenSeats({ orgId, uid, operationId, seats, source }) {
  if (!Number.isSafeInteger(seats) || seats < 1 || seats > 100000) throw new HttpsError('invalid-argument', 'Invalid seat quantity.');
  const key = operationKey(operationId);
  let applied = false;
  await transactOrganization(orgId, org => {
    if (!org) return org;
    applied = false;
    if (org.seat_operations?.[key]) return org;
    org.prepaid_seats = Number(org.prepaid_seats || 0) + seats;
    org.seat_operations ||= {};
    org.seat_operations[key] = { deen_seats: seats };
    applied = true;
    return org;
  });
  if (applied) {
    await db.ref('seatTransactions').push({ orgId, userId: uid || 'system', tripId: null, action: 'DEEN_SEATS', source, seats,
      timestamp: admin.database.ServerValue.TIMESTAMP });
  }
  return { credited: applied ? seats : 0 };
}

async function copySource(orgId, tripId) {
  if (typeof tripId !== 'string' || !SAFE_ID.test(tripId)) throw new HttpsError('invalid-argument', 'Select a trip to copy.');
  const trip = (await db.ref(`orgs/${orgId}/trips/${tripId}`).get()).val();
  if (!trip) throw new HttpsError('not-found', 'That trip does not belong to your organisation.');
  const templates = (await db.ref(`trips_active/${orgId}/${tripId}/templates`).get()).val() || {};
  return { tripId, title: String(trip.title || '').slice(0, 100), image: typeof trip.image === 'string' ? trip.image : null,
    destination: trip.location || null, templatesCount: Object.keys(templates).length };
}

// Message templates only; participants, documents and chat stay behind.
async function copyTemplates({ orgId, fromTripId, toTripId, uid }) {
  const target = db.ref(`trips_active/${orgId}/${toTripId}/templates`);
  if ((await target.get()).exists()) return 0;
  const source = (await db.ref(`trips_active/${orgId}/${fromTripId}/templates`).get()).val() || {};
  const rows = Object.values(source).filter(t => t && typeof t.name === 'string' && typeof t.message === 'string')
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const updates = {};
  rows.forEach(t => {
    updates[target.push().key] = { name: t.name, message: t.message, created_by: uid, timestamp: admin.database.ServerValue.TIMESTAMP };
  });
  if (rows.length) await target.update(updates);
  return rows.length;
}

// Stripe Checkout parameters for the missing seats; the webhook credits them (action DEEN_SEATS).
function seatsSessionParams({ orgId, uid, draftId, missing, pricing, origin, countryCode }) {
  return {
    line_items: [{
      price_data: { currency: pricing.currency, product_data: { name: 'Extra seats', description: `${missing} seats at ${pricing.symbol}${pricing.price.toFixed(2)}/seat` },
        unit_amount: Math.round(pricing.price * 100) },
      quantity: missing,
    }],
    mode: 'payment',
    billing_address_collection: 'required',
    allow_promotion_codes: true,
    invoice_creation: { enabled: true },
    metadata: { orgId, uid, action: 'DEEN_SEATS', draftId, seats: String(missing), planId: 'seat_only', countryCode: countryCode || '' },
    success_url: returnUrl(origin, draftId, '&status=success&session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: returnUrl(origin, draftId, '&status=cancel'),
  };
}

module.exports = {
  ALLOWED_ORIGINS, resolveOrigin, returnUrl, loadDraft, saveDraft, pruneExpiredDrafts, quoteSeats, validateDestination,
  creditDeenSeats, copySource, copyTemplates, seatsSessionParams, draftRef,
};
