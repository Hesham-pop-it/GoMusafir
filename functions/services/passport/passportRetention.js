// Retention (F10): 30 days after a trip ends, its passport documents, passport numbers and medical data are deleted.
// The plain progress (passport_status) stays, marked purged_at. passport_retention/{trip} says when each trip is due.
const { admin, db } = require('../../admin');
const links = require('./passportLinks');

// Deletes everything sensitive of one trip. Returns the number of people whose data was removed.
// The people come from the data, the link index and the plain progress, so nobody is missed whichever of them exists.
async function purgeTrip(orgId, tripId, now = Date.now()) {
  const [data, index, status] = await Promise.all(['passport', 'passport_link_index', 'passport_status'].map(async node =>
    (await db.ref(node === 'passport_link_index' ? `${node}/${tripId}` : `${node}/${orgId}/${tripId}`).get()).val() || {}));
  const uids = [...new Set([...Object.keys(data), ...Object.keys(index), ...Object.keys(status)])];
  const updates = {
    [`passport/${orgId}/${tripId}`]: null, [`passport_family/${orgId}/${tripId}`]: null,
    [`passport_link_index/${tripId}`]: null, [`passport_retention/${tripId}`]: null,
  };
  for (const entry of Object.values(index)) {
    if (!entry?.hash) continue;
    updates[`passport_links/${entry.hash}`] = null;
    updates[`passport_codes/${entry.hash}`] = null;
  }
  for (const uid of uids) {
    if (status[uid] || data[uid]) updates[`passport_status/${orgId}/${tripId}/${uid}/purged_at`] = now;
    updates[`passport_queue/${tripId}_${uid}`] = null;
  }
  await admin.storage().bucket().deleteFiles({ prefix: `passport_docs/${orgId}/${tripId}/`, force: true });
  await db.ref().update(updates);
  return uids.length;
}

// Account deletion: removes everything of one person on the trips they joined (steps, files, plain progress, family
// rows they sent or received, links with their index, codes and sessions, and queued sends). Other people's rows stay.
// joined: the person's users/{uid}/joined_trips when the caller has already read it (it is gone once the account is).
async function purgePerson(uid, joined) {
  const trips = joined || (await db.ref(`users/${uid}/joined_trips`).get()).val() || {};
  const updates = {}, hashes = new Set();
  for (const [tripId, entry] of Object.entries(trips)) {
    const orgId = entry?.org_id || entry?.orgId || (await db.ref(`trips_orgs/${tripId}`).get()).val();
    if (!orgId) continue;
    const [link, family] = await Promise.all([db.ref(`passport_link_index/${tripId}/${uid}`).get(), db.ref(`passport_family/${orgId}/${tripId}`).get()]);
    if (link.val()?.hash) hashes.add(link.val().hash);
    for (const [id, row] of Object.entries(family.val() || {})) {
      if (row?.from_uid === uid || row?.to_uid === uid) updates[`passport_family/${orgId}/${tripId}/${id}`] = null;
    }
    updates[`passport/${orgId}/${tripId}/${uid}`] = null;
    updates[`passport_status/${orgId}/${tripId}/${uid}`] = null;
    updates[`passport_link_index/${tripId}/${uid}`] = null;
    updates[`passport_queue/${tripId}_${uid}`] = null;
    await admin.storage().bucket().deleteFiles({ prefix: `passport_docs/${orgId}/${tripId}/${uid}/`, force: true });
  }
  for (const hash of hashes) { updates[`passport_links/${hash}`] = null; updates[`passport_codes/${hash}`] = null; }
  // Live sessions only (the index is on expires_at); expired ones hold no data and are swept by the daily job.
  const live = (await db.ref('passport_sessions').orderByChild('expires_at').startAt(Date.now()).get()).val() || {};
  for (const [hash, session] of Object.entries(live)) if (session?.uid === uid || hashes.has(session?.link)) updates[`passport_sessions/${hash}`] = null;
  if (Object.keys(updates).length) await db.ref().update(updates);
  return Object.keys(trips).length;
}

// The day a trip's data goes: the earlier of the stored deadline and 30 days after the trip's current end, so a
// shortened trip is cleaned sooner and extending the end date never keeps sensitive data longer than first promised.
function effectiveDeadline(stored, end) {
  const fromEnd = Number.isFinite(end) ? end + links.RETENTION_MS : Infinity;
  return Number.isFinite(stored) ? Math.min(stored, fromEnd) : fromEnd;
}

// limit: how many registered trips one run looks at (one small read each).
async function runRetention({ now = Date.now(), limit = 500 } = {}) {
  const all = (await db.ref('passport_retention').orderByChild('delete_after').limitToFirst(limit).get()).val() || {};
  const result = { trips: 0, people: 0, advanced: 0 };
  for (const [tripId, entry] of Object.entries(all)) {
    const end = (await db.ref(`orgs/${entry.org_id}/trips/${tripId}/end_date`).get()).val();
    const deadline = effectiveDeadline(entry.delete_after, end);
    if (deadline > now) {
      if (deadline < entry.delete_after) { await db.ref(`passport_retention/${tripId}/delete_after`).set(deadline); result.advanced++; }
      continue;
    }
    result.people += await purgeTrip(entry.org_id, tripId, now);
    result.trips++;
  }
  await dropExpiredSessions(now);
  return result;
}

// Sessions are short; the ones past their end are removed so the node does not grow.
async function dropExpiredSessions(now = Date.now()) {
  const old = (await db.ref('passport_sessions').orderByChild('expires_at').endAt(now).limitToFirst(500).get()).val() || {};
  const updates = {};
  for (const hash of Object.keys(old)) updates[`passport_sessions/${hash}`] = null;
  if (Object.keys(updates).length) await db.ref().update(updates);
  return Object.keys(updates).length;
}

module.exports = { purgeTrip, purgePerson, effectiveDeadline, runRetention, dropExpiredSessions };
