// Scheduled trip announcements (decision D3). Items live at
// trips_active/{org}/{trip}/scheduled/{id}; scheduled_queue/{id} is a server-only
// index so the minute job can query due items without scanning every trip.
const BATCH_SIZE = 100;

const isDue = (item, now) => !!item && item.status === 'pending' && Number.isFinite(item.send_at) &&
  item.send_at <= now && typeof item.text === 'string' && item.text.trim().length > 0;

// Index entry for an item, or null when it should not be queued.
const queueEntry = (orgId, tripId, item) =>
  item && item.status === 'pending' && Number.isFinite(item.send_at)
    ? { org_id: orgId, trip_id: tripId, send_at: item.send_at } : null;

// Due queue entries, oldest first, capped at the batch size.
function selectDue(queue, now, limit = BATCH_SIZE) {
  return Object.entries(queue || {})
    .filter(([, entry]) => entry && entry.org_id && entry.trip_id && Number.isFinite(entry.send_at) && entry.send_at <= now)
    .sort((a, b) => a[1].send_at - b[1].send_at)
    .slice(0, limit)
    .map(([id, entry]) => ({ id, orgId: entry.org_id, tripId: entry.trip_id }));
}

// Same shape the app writes for a staff template message (TripChatScreen).
const chatMessageFor = (item, senderName, timestamp) => ({
  type: 'text',
  text: item.text,
  sender_id: item.created_by,
  sender_name: senderName || 'Admin',
  timestamp,
});

// Posts one due item. Safe to run concurrently and to retry after a crash:
// the chat key is fixed on the item first, the chat write is create-only, and
// only then is the item marked sent.
async function sendScheduled({ db, orgId, tripId, id, now = Date.now(), timestamp }) {
  const itemRef = db.ref(`trips_active/${orgId}/${tripId}/scheduled/${id}`);
  const queueRef = db.ref(`scheduled_queue/${id}`);
  const trip = (await db.ref(`orgs/${orgId}/trips/${tripId}`).get()).val();
  if (!trip || trip.status !== 'active') {
    await itemRef.transaction(cur => (cur === null ? cur : cur.status === 'pending' ? { ...cur, status: 'cancelled' } : undefined));
    await queueRef.remove();
    return 'cancelled';
  }
  const key = itemRef.parent.parent.child('chat').push().key;
  const claim = await itemRef.transaction(cur => {
    if (cur === null) return cur; // first call has no server data yet; the server re-runs us with it
    if (!isDue(cur, now)) return undefined;
    return cur.chat_key ? cur : { ...cur, chat_key: key };
  });
  const item = claim.snapshot.val();
  if (!claim.committed || !item) {
    if (!item || item.status !== 'pending') await queueRef.remove();
    return 'skipped';
  }
  const name = (await db.ref(`users/${item.created_by}/full_name`).get()).val();
  await db.ref(`trips_active/${orgId}/${tripId}/chat/${item.chat_key}`).transaction(
    cur => (cur ? undefined : chatMessageFor(item, name, timestamp)));
  await itemRef.transaction(cur => (cur === null ? cur : cur.status === 'pending' ? { ...cur, status: 'sent', sent_at: now } : undefined));
  await queueRef.remove();
  return 'sent';
}

async function sendDue({ db, now = Date.now(), timestamp }) {
  const snap = await db.ref('scheduled_queue').orderByChild('send_at').endAt(now).limitToFirst(BATCH_SIZE).get();
  const results = [];
  for (const due of selectDue(snap.val(), now)) {
    try { results.push(await sendScheduled({ db, ...due, now, timestamp })); }
    catch (error) { console.error('Scheduled announcement failed', due.id, error); results.push('error'); }
  }
  return results;
}

module.exports = { BATCH_SIZE, isDue, queueEntry, selectDue, chatMessageFor, sendScheduled, sendDue };
