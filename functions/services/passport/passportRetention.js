// Retention (F10): 30 days after a trip ends, its passport documents, passport numbers and medical data are deleted.
// The plain progress (passport_status) stays, marked purged_at. passport_retention/{trip} says when each trip is due.
const { admin, db } = require('../../admin');
const links = require('./passportLinks');

// Deletes everything sensitive of one trip. Returns the number of people whose data was removed.
async function purgeTrip(orgId, tripId, now = Date.now()) {
  const uids = Object.keys((await db.ref(`passport/${orgId}/${tripId}`).get()).val() || {});
  const index = (await db.ref(`passport_link_index/${tripId}`).get()).val() || {};
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
    updates[`passport_status/${orgId}/${tripId}/${uid}/purged_at`] = now;
    updates[`passport_queue/${tripId}_${uid}`] = null;
  }
  await admin.storage().bucket().deleteFiles({ prefix: `passport_docs/${orgId}/${tripId}/`, force: true });
  await db.ref().update(updates);
  return uids.length;
}

// Due trips: the stored deadline has passed AND the trip's current end date still agrees (an extended trip waits).
async function runRetention({ now = Date.now(), limit = 50 } = {}) {
  const due = (await db.ref('passport_retention').orderByChild('delete_after').endAt(now).limitToFirst(limit).get()).val() || {};
  const result = { trips: 0, people: 0, postponed: 0 };
  for (const [tripId, entry] of Object.entries(due)) {
    const end = (await db.ref(`orgs/${entry.org_id}/trips/${tripId}/end_date`).get()).val();
    if (Number.isFinite(end) && end + links.RETENTION_MS > now) {
      await db.ref(`passport_retention/${tripId}/delete_after`).set(end + links.RETENTION_MS);
      result.postponed++;
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

module.exports = { purgeTrip, runRetention, dropExpiredSessions };
