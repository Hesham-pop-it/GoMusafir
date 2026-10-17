// Every pilgrim of a trip polls the directory, and each poll needs the user
// record of every member. Raw records are shared for a few seconds inside one
// function instance, so a trip of N pilgrims reads each record about once per
// TTL instead of N times. The per-viewer redaction still runs on every call.
// Privacy changes therefore show at most TTL_MS later than before.
const TTL_MS = 3000;
const MAX_ENTRIES = 5000;
const entries = new Map();

function cachedUser(db, uid, now = Date.now()) {
  const hit = entries.get(uid);
  if (hit && now - hit.at < TTL_MS) return hit.read;
  const read = db.ref(`users/${uid}`).get();
  entries.delete(uid);
  entries.set(uid, { at: now, read });
  read.catch(() => { if (entries.get(uid)?.read === read) entries.delete(uid); });
  // Map order is insertion order: drop the oldest records first.
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  return read;
}

module.exports = { cachedUser, TTL_MS, MAX_ENTRIES };
