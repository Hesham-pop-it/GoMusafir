const { db } = require('../admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { tripExpiry } = require('./participantAccessService');

// A durable per-UID seat marker makes concurrent and interrupted joins retryable.
// Write membership immediately afterwards; retrying a partial join reuses its seat.
async function reserveParticipantJoinSeat(orgId, tripId, uid) {
  let failure;
  const result = await db.ref(`orgs/${orgId}/trips/${tripId}`).transaction(trip => {
    failure = null;
    // RTDB transactions may first run against an empty local cache. Returning
    // null lets the server supply the current trip and retry the callback.
    if (trip === null) return null;
    if (!tripExpiry(trip)) {
      failure = new HttpsError('permission-denied', 'This trip has ended or is invalid.');
      return;
    }
    if (trip.participant_join_seats?.[uid]) return trip;
    const count = Number(trip.participants || 0);
    const capacity = Number(trip.total_seats || 15);
    if (count >= capacity) {
      failure = new HttpsError('resource-exhausted', `This trip is full. Maximum capacity is ${capacity} participants.`);
      return;
    }
    return { ...trip, participants: count + 1,
      participant_join_seats: { ...trip.participant_join_seats, [uid]: true } };
  });
  if (result.committed && !tripExpiry(result.snapshot.val())) {
    throw new HttpsError('permission-denied', 'This trip has ended or is invalid.');
  }
  if (!result.committed) throw failure || new HttpsError('aborted', 'Please retry joining the trip.');
}
module.exports = { reserveParticipantJoinSeat };
