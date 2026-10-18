// Daily removal of notifications past their end date. The notification_expiry
// index (written when a record gets its end date) is queried by `at`, so the job
// reads only the expired entries and never walks the trips.
const BATCH = 500;
const MAX_BATCHES = 40;

async function pruneExpiredNotifications(db, now = Date.now()) {
  let removed = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const snap = await db.ref('notification_expiry').orderByChild('at').endAt(now).limitToFirst(BATCH).get();
    const updates = {};
    let count = 0;
    snap.forEach(child => {
      const entry = child.val();
      updates[`notification_expiry/${child.key}`] = null;
      if (entry && typeof entry.path === 'string' && /^(trips_active|users)\//.test(entry.path)) updates[entry.path] = null;
      count++;
    });
    if (!count) break;
    await db.ref().update(updates);
    removed += count;
    if (count < BATCH) break;
  }
  return removed;
}

module.exports = { pruneExpiredNotifications, BATCH, MAX_BATCHES };
