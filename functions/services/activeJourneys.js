// ─── Active and upcoming journeys of an organisation ─────────────────────────
// Used by organisation deletion (requestOrganizationDeletion; an owner must delete or hand over
// the organisation before deleting their account). A journey blocks deletion while it is active
// and has not ended yet, so upcoming journeys count too. Same rule as tripExpiry and database.rules.json.

// Same test as tripExpiry in participantAccessService (kept here so this file loads without Firebase).
const isActive = (trip, now) => trip && trip.status === "active" && Number.isFinite(trip.end_date) && trip.end_date > now;

// Returns [{ tripId, title, start_date, end_date }] ordered by start date.
async function findActiveJourneys(db, orgId, now = Date.now()) {
  const snap = await db.ref(`orgs/${orgId}/trips`).get();
  const trips = snap.exists() ? snap.val() : {};
  return Object.keys(trips)
    .filter((tripId) => trips[tripId] && isActive(trips[tripId], now))
    .map((tripId) => ({
      tripId,
      title: typeof trips[tripId].title === "string" ? trips[tripId].title : "",
      start_date: Number.isFinite(trips[tripId].start_date) ? trips[tripId].start_date : null,
      end_date: trips[tripId].end_date,
    }))
    .sort((a, b) => (a.start_date || 0) - (b.start_date || 0));
}

module.exports = { findActiveJourneys };
