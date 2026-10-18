const { HttpsError } = require('firebase-functions/v2/https');
const { db: adminDb } = require('../admin');
const { requireTripAccess } = require('./participantAccessService');
const { loadTerms, expiryEntry } = require('./notificationTerms');
const id = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const STAFF_ROLES = ['admin', 'manager', 'co-host'];

// Staff of the trip mark an SOS as handled. Every staff member got their own copy of
// the alert, so all copies of this one are resolved together; each then stays visible
// for the configured time (24 h) and is removed by the daily prune.
async function resolveSos(request, { db = adminDb, access = requireTripAccess } = {}) {
  const { tripId, notificationId } = request.data || {};
  if (!id(tripId) || !id(notificationId)) throw new HttpsError('invalid-argument', 'Invalid SOS.');
  const { orgId, staff } = await access(request, tripId);
  if (!staff) throw new HttpsError('permission-denied', 'Only staff of this trip can resolve an SOS.');
  const root = `trips_active/${orgId}/${tripId}/notifications`;
  const mine = (await db.ref(`${root}/${request.auth.uid}/${notificationId}`).get()).val();
  if (!mine || mine.type !== 'emergency') throw new HttpsError('not-found', 'SOS not found.');
  if (Number(mine.resolved_at) > 0) return { resolvedAt: Number(mine.resolved_at), visibleUntil: Number(mine.visible_until) || null };

  const now = Date.now();
  const until = now + (await loadTerms(db, now)).emergency_resolved_ms;
  const roster = (await db.ref(`orgs/${orgId}/staff`).get()).val() || {};
  const copies = [[request.auth.uid, notificationId]];
  await Promise.all(Object.keys(roster).filter(uid => STAFF_ROLES.includes(roster[uid]) && uid !== request.auth.uid).map(async uid => {
    const found = await db.ref(`${root}/${uid}`).orderByChild('type').equalTo('emergency').get();
    found.forEach(child => {
      const copy = child.val();
      if (copy && copy.senderUid === mine.senderUid && copy.timestamp === mine.timestamp && !(Number(copy.resolved_at) > 0)) copies.push([uid, child.key]);
    });
  }));
  const updates = {};
  for (const [uid, key] of copies) {
    const path = `${root}/${uid}/${key}`;
    Object.assign(updates, { [`${path}/resolved_at`]: now, [`${path}/resolved_by`]: request.auth.uid, [`${path}/visible_until`]: until, ...expiryEntry(key, path, until) });
  }
  await db.ref().update(updates);
  return { resolvedAt: now, visibleUntil: until };
}

module.exports = { resolveSos };
