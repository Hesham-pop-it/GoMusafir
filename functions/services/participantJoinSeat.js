const { db } = require('../admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { tripExpiry } = require('./participantAccessService');
const { occupiedSeatUids, tripCapacity } = require('./tripCapacity');

// The seat check and the membership write are one transaction on the trip's
// membership node, so two people cannot take the last seat. The remaining paths
// (user records, consent, seat counter) are written right after in one update; if
// that update fails, the membership added here is taken out again.
async function commitParticipantJoin(orgId, tripId, uid, updates) {
  const joinedPath = `users/${uid}/joined_trips/${tripId}`;
  const tripPath = `orgs/${orgId}/trips/${tripId}`;
  const [tripSnap, staffSnap, previousSnap] = await Promise.all([
    db.ref(tripPath).get(), db.ref(`orgs/${orgId}/staff`).get(), db.ref(joinedPath).get(),
  ]);
  const trip = tripSnap.val();
  if (!tripExpiry(trip)) throw new HttpsError('permission-denied', 'This trip has ended or is invalid.');
  const staff = staffSnap.val() || {};
  const capacity = tripCapacity(trip);

  let failure, added;
  const result = await db.ref(`trips_participants/${tripId}`).transaction(current => {
    failure = null; added = false;
    // The SDK first calls this with an empty local cache; a wrong guess is retried by the server.
    const members = Array.isArray(current)
      ? Object.fromEntries(occupiedSeatUids(current).map(member => [member, true]))
      : { ...(current || {}) };
    const occupied = occupiedSeatUids(members, staff);
    if (!occupied.includes(uid) && occupied.length >= capacity) {
      failure = new HttpsError('resource-exhausted', `This trip is full. Maximum capacity is ${capacity} participants.`);
      return;
    }
    added = members[uid] !== true;
    members[uid] = true;
    return members;
  });
  if (!result.committed) throw failure || new HttpsError('aborted', 'Please retry joining the trip.');

  try {
    const next = { ...updates };
    // Preserve the original enrollment timestamp when a participant retries.
    const previous = previousSnap.val();
    if (previous && next[joinedPath]) {
      next[joinedPath] = { ...previous, ...next[joinedPath],
        ...(previous.joined_at != null ? { joined_at: previous.joined_at } : {}) };
    }
    // Old interrupted reservations must not consume seats or bypass capacity.
    if (trip.participant_join_seats) next[`${tripPath}/participant_join_seats`] = null;
    await db.ref().update(next);
    const members = (await db.ref(`trips_participants/${tripId}`).get()).val();
    await db.ref(`${tripPath}/participants`).set(occupiedSeatUids(members, staff).length);
  } catch (error) {
    if (added) {
      await db.ref(`trips_participants/${tripId}`).transaction(current => {
        if (!current || current[uid] !== true) return current ?? null;
        delete current[uid];
        return Object.keys(current).length ? current : null;
      }).catch(() => {});
    }
    throw error;
  }
}
module.exports = { commitParticipantJoin };
