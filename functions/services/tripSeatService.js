const { db } = require('../admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { seatUsage } = require('./tripSeatMath');
const crypto = require('crypto');
const { tripTimeZoneFields } = require('./tripTimeZoneService');

const operationKey = value => crypto.createHash('sha256').update(value).digest('hex');
async function transactOrganization(orgId, mutate) {
  let failure = null;
  const result = await db.ref(`orgs/${orgId}`).transaction(org => {
    failure = null;
    try { return mutate(org); }
    catch (error) {
      // Firebase may invoke this callback from an asynchronous retry. Abort
      // instead of throwing there; propagate the error from the awaited call.
      failure = error;
      return undefined;
    }
  });
  if (!result.committed && failure) throw failure;
  if (!result.committed) throw new HttpsError('aborted', 'Seat allocation changed. Please try again.');
  return result;
}
function usageFor(start, end, participants) {
  try { return seatUsage(start, end, participants); }
  catch (error) { throw new HttpsError('invalid-argument', error.message); }
}
function allocatedSeats(trip) {
  // Historical trips paid one seat per capacity slot. Do not assume that a
  // legacy long trip already paid for extra periods.
  return Number.isSafeInteger(trip.seats_allocated) ? trip.seats_allocated : Number(trip.total_seats || 15);
}
function topupUsage(trip, increment) {
  usageFor(trip.start_date, trip.end_date, increment);
  const usage = usageFor(trip.start_date, trip.end_date, Number(trip.total_seats || 15) + Number(increment));
  return { ...usage, requiredSeats: Math.max(0, usage.requiredSeats - allocatedSeats(trip)) };
}
function applyAllocation(org, trip, usage, paidCredit = 0) {
  const allocated = trip ? allocatedSeats(trip) : 0;
  const additional = Math.max(0, usage.requiredSeats - allocated);
  const balance = Number(org.prepaid_seats || 0) + paidCredit;
  if (!Number.isSafeInteger(balance) || balance < additional) {
    throw new HttpsError('failed-precondition', `Not enough seats. ${additional} additional seats required; ${balance} available.`,
      { requiredSeats: usage.requiredSeats, additionalSeats: additional, availableSeats: balance });
  }
  org.prepaid_seats = balance - additional;
  return { duration_days: usage.durationDays, seat_periods: usage.seatPeriods,
    seats_required: usage.requiredSeats, seats_allocated: Math.max(allocated, usage.requiredSeats) };
}

async function changeTripSeats({ orgId, tripId, startDate, endDate, destination, increment = 0, operationId, paidCredit = 0 }) {
  if (!Number.isSafeInteger(increment) || increment < 0 || !Number.isSafeInteger(paidCredit) || paidCredit < 0) {
    throw new HttpsError('invalid-argument', 'Invalid seat quantity.');
  }
  const key = operationId ? operationKey(operationId) : null;
  const result = await transactOrganization(orgId, org => {
    if (!org) return org;
    if (key && org.seat_operations?.[key]) return org;
    const trip = org.trips?.[tripId];
    if (!trip) throw new HttpsError('not-found', 'Trip not found.');
    const start = startDate ?? trip.start_date, end = endDate ?? trip.end_date;
    // Resolve inside the transaction so a concurrent edit cannot leave a stale zone.
    // Seat-only top-ups preserve legacy records without requiring a location edit.
    const zoneFields = startDate !== undefined || endDate !== undefined || destination !== undefined
      ? tripTimeZoneFields(destination ?? trip.location) : {};
    const capacity = Number(trip.total_seats || 15) + increment;
    const usage = usageFor(start, end, capacity);
    Object.assign(trip, applyAllocation(org, trip, usage, paidCredit), {
      ...zoneFields,
      ...(destination !== undefined ? { location: destination.trim() } : {}),
      start_date: start, end_date: end, total_seats: capacity,
      date: formatRange(start, end), invite_expires_at: end,
    });
    if (key) {
      org.seat_operations ||= {};
      org.seat_operations[key] = { tripId, seats: usage.requiredSeats };
    }
    return org;
  });
  const trip = result.snapshot.val()?.trips?.[tripId];
  if (!trip) throw new HttpsError('not-found', 'Trip not found.');
  if (trip.invitation_code) await db.ref(`invites/${trip.invitation_code}/expires_at`).set(trip.end_date);
  return { requiredSeats: trip.seats_required, allocatedSeats: trip.seats_allocated,
    availableSeats: result.snapshot.val().prepaid_seats, tripId };
}
function formatRange(start, end) {
  const format = ts => new Date(ts).toISOString().slice(0, 10).split('-').reverse().join('/');
  return `${format(start)} - ${format(end - 1)}`;
}
async function requireOrgStaff(orgId, uid) {
  if (!orgId || !uid || !['admin', 'co-host', 'manager'].includes((await db.ref(`orgs/${orgId}/staff/${uid}`).get()).val())) {
    throw new HttpsError('permission-denied', 'Organization staff access is required.');
  }
}
module.exports = { transactOrganization, topupUsage, usageFor, allocatedSeats, applyAllocation, changeTripSeats, formatRange, operationKey, requireOrgStaff };
