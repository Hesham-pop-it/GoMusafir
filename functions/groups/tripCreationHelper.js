const { db, admin } = require("../admin");
const { v4: uuidv4 } = require("uuid");
const { HttpsError } = require('firebase-functions/v2/https');
const { usageFor, applyAllocation, operationKey, formatRange, transactOrganization } = require('../services/tripSeatService');

const { tripTimeZoneFields } = require('../services/tripTimeZoneService');

const createTripRecord = async ({ orgId, uid, title, destination, startDate, endDate, image, totalSeats, operationId, paidCredit = 0, checkoutKey, checkoutAttempt }) => {
  if (!title || !destination || !uid || !Number.isSafeInteger(paidCredit) || paidCredit < 0) {
    throw new HttpsError('invalid-argument', 'Missing or invalid trip fields.');
  }
  const usage = usageFor(startDate, endDate, totalSeats);
  const key = operationId ? operationKey(operationId) : null;
  let tripId = db.ref(`orgs/${orgId}/trips`).push().key;
  let inviteCode = uuidv4();

  const tripData = {
    title,
    ...tripTimeZoneFields(destination),
    location: destination.trim(),
    date: formatRange(startDate, endDate),
    participants: 1,
    total_seats: usage.participants,
    image: image || null,
    status: "active",
    invitation_code: inviteCode,
    start_date: startDate,
    end_date: endDate,
    invite_expires_at: endDate,
    created_by: uid || "system",
    created_at: admin.database.ServerValue.TIMESTAMP,
    voice_state: {
      mute_all: false,
      recording: false,
    },
  };

  // Balance, allocation, trip and deduplication commit together. Concurrent
  // creations cannot spend the same organization balance.
  const result = await transactOrganization(orgId, org => {
    if (!org) return org;
    if (key && org.seat_operations?.[key]) return org;
    const reservation = org.journey_checkouts?.[key];
    let reservedCredit = 0;
    if (checkoutKey) {
      if (checkoutKey !== key || !reservation || reservation.state !== 'reserved' ||
          reservation.attempt !== checkoutAttempt || reservation.uid !== uid ||
          reservation.paidSeats !== paidCredit || reservation.reservedSeats + paidCredit !== usage.requiredSeats) {
        throw new HttpsError('failed-precondition', 'Invalid journey checkout reservation.');
      }
      reservedCredit = reservation.reservedSeats;
      reservation.state = 'consumed';
    } else if (reservation?.state === 'reserved') {
      throw new HttpsError('already-exists', 'A payment checkout is already open for this journey.');
    }
    const allocation = applyAllocation(org, null, usage, paidCredit + reservedCredit);
    org.trips ||= {};
    org.trips[tripId] = { ...tripData, ...allocation };
    if (key) {
      org.seat_operations ||= {};
      org.seat_operations[key] = { tripId, inviteCode };
    }
    return org;
  });
  const org = result.snapshot.val();
  if (!org) throw new HttpsError('not-found', 'Organization not found.');
  if (key) ({ tripId, inviteCode } = org.seat_operations[key]);
  const saved = org.trips[tripId];
  // Repairable projections: retrying the operation repeats these writes without
  // deducting seats twice or replacing an existing trip.
  await db.ref().update({
    [`invites/${inviteCode}/org_id`]: orgId,
    [`invites/${inviteCode}/trip_id`]: tripId,
    [`invites/${inviteCode}/role`]: 'participant',
    [`invites/${inviteCode}/expires_at`]: saved.end_date,
    [`trips_orgs/${tripId}`]: orgId,
    [`trips_participants/${tripId}/${uid}`]: true,
    [`users/${uid}/joined_trips/${tripId}/org_id`]: orgId,
    [`users/${uid}/joined_trips/${tripId}/status`]: 'organizer',
    [`users/${uid}/joined_trips/${tripId}/joined_at`]: saved.created_at,
  });
  return { tripId, inviteCode, requiredSeats: saved.seats_required };
};

module.exports = { createTripRecord };
