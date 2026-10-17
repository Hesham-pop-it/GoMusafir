const { onValueWritten } = require('firebase-functions/v2/database');
const { db } = require('../admin');
const { occupiedSeatUids } = require('../services/tripCapacity');

// Keeps a plain member count per trip, so the invite preview does not read the
// whole membership list. The count is recomputed from the list each time (never
// incremented), so a repeated event cannot make it drift.
exports.onTripMembersCounted = onValueWritten({ ref: '/trips_participants/{tripId}', region: 'europe-west1', retry: true }, async event => {
  const members = event.data.after.val();
  const countRef = db.ref(`trip_seat_counts/${event.params.tripId}`);
  if (!members) return countRef.remove();
  return countRef.set(occupiedSeatUids(members).length);
});
