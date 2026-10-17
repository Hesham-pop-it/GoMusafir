// Sets the end of visibility on a new trip notification and lists it in the
// notification_expiry index the daily prune reads. Phones never write these two.
const { loadTerms, visibleUntil, expiryEntry } = require('./notificationTerms');

async function stampNotification(db, { orgId, tripId, uid, notifId, record }) {
  if (!record || typeof record !== 'object') return null;
  const terms = await loadTerms(db);
  let tripEndsAt = null;
  if (record.type === 'alert') {
    tripEndsAt = (await db.ref(`orgs/${orgId}/trips/${tripId}/end_date`).get()).val();
  }
  const until = visibleUntil(record, terms, tripEndsAt);
  // An open SOS has no end date yet; resolving it sets one.
  if (until === null) return null;
  const path = `trips_active/${orgId}/${tripId}/notifications/${uid}/${notifId}`;
  await db.ref().update({ [`${path}/visible_until`]: until, ...expiryEntry(notifId, path, until) });
  return until;
}

// True when the only difference is the server-written end date.
function onlyStamped(before, after) {
  if (!before || !after) return false;
  if (before.visible_until !== undefined || after.visible_until === undefined) return false;
  const { visible_until: _ignored, ...rest } = after;
  const keys = new Set([...Object.keys(before), ...Object.keys(rest)]);
  for (const key of keys) if (JSON.stringify(before[key]) !== JSON.stringify(rest[key])) return false;
  return true;
}

module.exports = { stampNotification, onlyStamped };
