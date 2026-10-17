const { db } = require('../admin');
const { directory } = require('./tripVisibilityService');

// trip_view/{tripId}/member/{uid} and trip_view/{tripId}/staff/{uid}: the
// directory entry fellow pilgrims and staff may see, with the same redaction as
// getVisibleTripData. Phones listen to these instead of polling the callable.
// A person's own entry equals the staff entry (visibility treats self like
// staff), so the rules let each person read their own staff entry.
// The audiences are synthetic viewers: no grants, no own record.
const AUDIENCES = { member: { uid: '~member', staff: false }, staff: { uid: '~staff', staff: true } };

async function tripContext(tripId) {
  const orgId = (await db.ref(`trips_orgs/${tripId}`).get()).val();
  if (!orgId) return null;
  const trip = (await db.ref(`orgs/${orgId}/trips/${tripId}`).get()).val();
  return trip ? { orgId, trip } : null;
}

// Rewrites the entries of `uids` (all members and staff when null) and removes
// entries of people who no longer belong to the trip.
async function writeTripView(tripId, uids = null) {
  const context = await tripContext(tripId);
  if (!context) return { written: 0 };
  const [members, staff] = await Promise.all([db.ref(`trips_participants/${tripId}`).get(), db.ref(`orgs/${context.orgId}/staff`).get()]);
  const everyone = new Set(Object.keys(members.val() || {}));
  Object.keys(staff.val() || {}).forEach(uid => everyone.add(uid));
  const only = new Set(uids || everyone);
  const update = {};
  for (const [audience, viewer] of Object.entries(AUDIENCES)) {
    const data = await directory({ auth: { uid: viewer.uid }, data: { tripId } },
      { orgId: context.orgId, trip: context.trip, staff: viewer.staff }, only, true);
    for (const uid of only) update[`${audience}/${uid}`] = data.users[uid] || null;
  }
  await db.ref(`trip_view/${tripId}`).update(update);
  return { written: only.size };
}

// Every trip a person belongs to, as a participant or as staff of its organisation.
async function tripsOf(uid) {
  const [joined, staffOrg] = await Promise.all([db.ref(`users/${uid}/joined_trips`).get(), db.ref(`users/${uid}/staff_org_id`).get()]);
  const tripIds = new Set(Object.keys(joined.val() || {}));
  if (staffOrg.val()) Object.keys((await db.ref(`orgs/${staffOrg.val()}/trips`).get()).val() || {}).forEach(id => tripIds.add(id));
  return tripIds;
}

async function refreshUserViews(uid) {
  for (const tripId of await tripsOf(uid)) await writeTripView(tripId, [uid]);
}

module.exports = { writeTripView, refreshUserViews, AUDIENCES };
