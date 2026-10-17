const { db } = require('../admin');
const { directory, sanitizeMessage, sendersOf } = require('./tripVisibilityService');

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
  let only;
  if (uids) only = new Set(uids);
  else {
    const [members, staff] = await Promise.all([db.ref(`trips_participants/${tripId}`).get(), db.ref(`orgs/${context.orgId}/staff`).get()]);
    only = new Set(Object.keys(members.val() || {}));
    Object.keys(staff.val() || {}).forEach(uid => only.add(uid));
  }
  const update = {};
  for (const [audience, viewer] of Object.entries(AUDIENCES)) {
    const data = await directory({ auth: { uid: viewer.uid }, data: { tripId } },
      { orgId: context.orgId, trip: context.trip, staff: viewer.staff }, only, true, true);
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

// trips_active/{org}/{trip}/chat_view/{messageId}: the chat line as fellow
// pilgrims may see it (member audience), so phones listen instead of polling.
// Phones replace the names with their own audience's names from trip_view.
async function mirrorChat(orgId, tripId, messageId, message) {
  const target = db.ref(`trips_active/${orgId}/${tripId}/chat_view/${messageId}`);
  if (!message || typeof message !== 'object') return target.remove();
  const users = {};
  await Promise.all([...sendersOf({ [messageId]: message })].map(async uid => {
    users[uid] = (await db.ref(`trip_view/${tripId}/member/${uid}`).get()).val() || undefined;
  }));
  return target.set(sanitizeMessage(message, users));
}

// Mirrors the newest `limit` chat lines of a trip (backfill for older trips).
async function mirrorRecentChat(tripId, limit = 200) {
  const context = await tripContext(tripId);
  if (!context) return 0;
  const messages = (await db.ref(`trips_active/${context.orgId}/${tripId}/chat`).orderByKey().limitToLast(limit).get()).val() || {};
  for (const [id, message] of Object.entries(messages)) await mirrorChat(context.orgId, tripId, id, message);
  return Object.keys(messages).length;
}

module.exports = { writeTripView, refreshUserViews, mirrorChat, mirrorRecentChat, AUDIENCES };
