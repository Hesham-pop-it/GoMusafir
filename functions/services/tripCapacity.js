// Trip staff and enrolled participants share capacity; count each UID once.
function occupiedSeatUids(members = {}, staff = {}) {
  const participants = Array.isArray(members)
    ? members.filter(uid => typeof uid === 'string' && uid)
    : Object.keys(members || {}).filter(uid => members[uid]);
  const organizers = Object.keys(staff || {}).filter(uid =>
    ['admin', 'manager', 'co-host'].includes(staff[uid]));
  return [...new Set([...participants, ...organizers])];
}
function tripCapacity(trip = {}) {
  return Number(trip.total_seats ?? trip.capacity ?? trip.participants_limit ?? 15);
}
module.exports = { occupiedSeatUids, tripCapacity };
