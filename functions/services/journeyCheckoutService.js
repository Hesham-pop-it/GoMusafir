const { db } = require('../admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { randomUUID } = require('node:crypto');
const { transactOrganization, operationKey, usageFor } = require('./tripSeatService');
const { createTripRecord } = require('../groups/tripCreationHelper');
const { tripTimeZoneFields } = require('./tripTimeZoneService');
const sameDraft = (a, b) => ['title', 'destination', 'startDate', 'endDate', 'image'].every(key => (a[key] ?? null) === (b[key] ?? null));

async function releaseJourneyCheckout(orgId, key, session) {
  if (session.status !== 'expired' || session.payment_status === 'paid') return;
  await transactOrganization(orgId, org => {
    const quote = org?.journey_checkouts?.[key];
    if (!quote || quote.state !== 'reserved' || quote.attempt !== session.metadata?.journeyAttempt) return org;
    org.prepaid_seats = Number(org.prepaid_seats || 0) + quote.reservedSeats;
    quote.state = 'released';
    return org;
  });
}

async function completeJourneyCheckout(session) {
  const { orgId, journeyCheckoutKey: key, journeyAttempt: attempt } = session.metadata || {};
  if (session.payment_status !== 'paid') throw new HttpsError('failed-precondition', 'Payment is not complete.');
  const quote = (await db.ref(`orgs/${orgId}/journey_checkouts/${key}`).get()).val();
  if (!quote || quote.attempt !== attempt || quote.state === 'released') {
    throw new HttpsError('failed-precondition', 'Journey checkout was not found.');
  }
  if (session.currency !== quote.currency || !Number.isSafeInteger(session.amount_total) || session.amount_total < 0 || session.amount_total > quote.paidSeats * quote.unitAmount) {
    throw new HttpsError('failed-precondition', 'Journey payment details do not match.');
  }
  return createTripRecord({ ...quote.tripData, orgId, uid: quote.uid, totalSeats: quote.participants,
    operationId: `create:${quote.linkToken}`, paidCredit: quote.paidSeats,
    checkoutKey: key, checkoutAttempt: attempt });
}

async function startJourneyCheckout({ stripe, orgId, uid, linkToken, tripData, participants, planId, pricing, origin, shippingCountries }) {
  // Keep only trusted input fields. Never accept client-provided seat credits.
  const draft = { title: tripData?.title, destination: tripData?.destination,
    startDate: tripData?.startDate, endDate: tripData?.endDate, image: tripData?.image || null };
  if (typeof draft.title !== 'string' || !draft.title.trim() || draft.title.length > 200 ||
      (draft.image !== null && (typeof draft.image !== 'string' || !draft.image.startsWith('https://')))) {
    throw new HttpsError('invalid-argument', 'Enter valid journey details.');
  }
  tripTimeZoneFields(draft.destination);
  const usage = usageFor(draft.startDate, draft.endDate, participants);
  const key = operationKey(`create:${linkToken}`);
  let existing = (await db.ref(`orgs/${orgId}/journey_checkouts/${key}`).get()).val();
  if (existing?.state === 'reserved' && existing.sessionId) {
    const session = await stripe.checkout.sessions.retrieve(existing.sessionId);
    if (session.payment_status === 'paid') return { instant: true, ...await completeJourneyCheckout(session) };
    if (session.status === 'expired') {
      await releaseJourneyCheckout(orgId, key, session);
      existing = null;
    } else {
      if (!sameDraft(existing.tripData, draft) || existing.participants !== participants || existing.planId !== planId) {
        throw new HttpsError('failed-precondition', 'A checkout is already open for this journey. Finish it or wait for it to expire before changing the journey.');
      }
      if (session.url) return { url: session.url };
      throw new HttpsError('failed-precondition', 'Your payment is processing. Please wait for confirmation.');
    }
  }
  if (!existing || existing.state === 'released' || existing.state === 'consumed') {
    try {
      return { instant: true, ...await createTripRecord({ ...draft, orgId, uid, totalSeats: participants, operationId: `create:${linkToken}` }) };
    } catch (error) {
      if (error.code !== 'failed-precondition' && error.code !== 'already-exists') throw error;
      if (error.code === 'failed-precondition' && !error.details?.additionalSeats) throw error;
    }
  }
  const attempt = randomUUID();
  const result = await transactOrganization(orgId, org => {
    if (!org) return org;
    if (org.seat_operations?.[key]) return org;
    org.journey_checkouts ||= {};
    if (org.journey_checkouts[key]?.state === 'reserved') return org;
    const balance = Number(org.prepaid_seats || 0);
    if (!Number.isSafeInteger(balance) || balance < 0) throw new HttpsError('failed-precondition', 'Invalid seat balance.');
    const reservedSeats = Math.min(balance, usage.requiredSeats);
    org.prepaid_seats = balance - reservedSeats;
    org.journey_checkouts[key] = { state: 'reserved', attempt, uid, linkToken, tripData: draft,
      participants, planId, currency: pricing.currency, unitAmount: Math.round(pricing.price * 100),
      reservedSeats, paidSeats: usage.requiredSeats - reservedSeats, origin, shippingCountries,
      expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    return org;
  });
  const org = result.snapshot.val();
  if (org?.seat_operations?.[key]) {
    return { instant: true, ...await createTripRecord({ ...draft, orgId, uid, totalSeats: participants, operationId: `create:${linkToken}` }) };
  }
  const quote = org?.journey_checkouts?.[key];
  if (!quote) throw new HttpsError('not-found', 'Organization not found.');
  if (!sameDraft(quote.tripData, draft) || quote.participants !== participants || quote.planId !== planId) {
    throw new HttpsError('failed-precondition', 'A checkout is already being prepared for different journey details. Please retry your original selection.');
  }
  if (quote.paidSeats === 0) {
    return { instant: true, ...await createTripRecord({ ...quote.tripData, orgId, uid, totalSeats: participants,
      operationId: `create:${linkToken}`, checkoutKey: key, checkoutAttempt: quote.attempt }) };
  }
  // Stable parameters + idempotency key recover a session after a network timeout.
  const sessionData = {
    mode: 'payment', line_items: [{ price_data: { currency: quote.currency,
      unit_amount: quote.unitAmount, product_data: { name: `Journey Creation — ${quote.tripData.title}`,
        description: `${quote.paidSeats} seat credits to purchase; ${quote.reservedSeats} prepaid credits applied.` } }, quantity: quote.paidSeats }],
    phone_number_collection: { enabled: true },
    shipping_address_collection: { allowed_countries: quote.shippingCountries },
    billing_address_collection: 'required', allow_promotion_codes: true, invoice_creation: { enabled: true },
    expires_at: quote.expiresAt,
    metadata: { orgId, uid, action: 'CREATE_TRIP', linkToken, planId: quote.planId,
      journeyCheckoutKey: key, journeyAttempt: quote.attempt, seatsToIncr: String(quote.paidSeats),
      prepaidSeatsDeducted: String(quote.reservedSeats), participantIncrement: String(quote.participants) },
    success_url: `${quote.origin}/create-journey?status=success&session_id={CHECKOUT_SESSION_ID}&token=${encodeURIComponent(linkToken)}`,
    cancel_url: `${quote.origin}/create-journey?status=cancel&token=${encodeURIComponent(linkToken)}`,
  };
  let session;
  try {
    session = await stripe.checkout.sessions.create(sessionData, { idempotencyKey: `journey:${quote.attempt}` });
  } catch (error) {
    // A rejected request cannot have created a payable session. Network/server
    // failures keep the reservation so an idempotent retry can recover it safely.
    if (error.type === 'StripeInvalidRequestError') {
      await releaseJourneyCheckout(orgId, key, { status: 'expired', metadata: { journeyAttempt: quote.attempt } });
    }
    throw error;
  }
  await db.ref(`orgs/${orgId}/journey_checkouts/${key}/sessionId`).set(session.id);
  return { url: session.url };
}
module.exports = { startJourneyCheckout, completeJourneyCheckout, releaseJourneyCheckout };
