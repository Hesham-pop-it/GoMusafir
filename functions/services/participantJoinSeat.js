const { db } = require('../admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { tripExpiry } = require('./participantAccessService');
const { occupiedSeatUids, tripCapacity } = require('./tripCapacity');

// Membership and user indexes live in separate top-level branches. Their common
// ancestor transaction is necessary to check capacity and publish the entire join
// together. A read followed by a multi-path update can oversubscribe the last seat.
async function commitParticipantJoin(orgId, tripId, uid, updates) {
  let failure;
  const result = await db.ref().transaction(root => {
    failure = null;
    // The SDK initially calls this with an empty local cache.
    if (root === null) return null;
    const org = root.orgs?.[orgId];
    const trip = org?.trips?.[tripId];
    if (!tripExpiry(trip)) {
      failure = new HttpsError('permission-denied', 'This trip has ended or is invalid.');
      return;
    }
    const occupied = occupiedSeatUids(root.trips_participants?.[tripId], org.staff);
    const capacity = tripCapacity(trip);
    if (!occupied.includes(uid) && occupied.length >= capacity) {
      failure = new HttpsError('resource-exhausted', `This trip is full. Maximum capacity is ${capacity} participants.`);
      return;
    }
    // Preserve the original enrollment timestamp when concurrent requests retry.
    const previousMembership = root.users?.[uid]?.joined_trips?.[tripId];
    if (Array.isArray(root.trips_participants?.[tripId])) {
      root.trips_participants[tripId] = Object.fromEntries(
        occupiedSeatUids(root.trips_participants[tripId]).map(member => [member, true]));
    }
    for (const [path, value] of Object.entries(updates)) {
      const parts = path.split('/');
      const key = parts.pop();
      const parent = parts.reduce((node, part) => (node[part] ||= {}), root);
      if (value === null) delete parent[key];
      else parent[key] = value;
    }
    if (previousMembership) {
      root.users[uid].joined_trips[tripId] = {
        ...previousMembership,
        ...root.users[uid].joined_trips[tripId],
        ...(previousMembership.joined_at != null ? {joined_at: previousMembership.joined_at} : {}),
      };
    }
    trip.participants = occupiedSeatUids(root.trips_participants?.[tripId], org.staff).length;
    // Old interrupted reservations must not consume seats or bypass capacity.
    delete trip.participant_join_seats;
    return root;
  });
  if (result.committed && !tripExpiry(result.snapshot.val()?.orgs?.[orgId]?.trips?.[tripId])) {
    throw new HttpsError('permission-denied', 'This trip has ended or is invalid.');
  }
  if (!result.committed) throw failure || new HttpsError('aborted', 'Please retry joining the trip.');
}
module.exports = { commitParticipantJoin };
