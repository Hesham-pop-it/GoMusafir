// ─── Push gate for deactivated accounts and organisations ────────────────────
// No push (and no in-app notification record) goes to an account that is scheduled
// for deletion, or about an organisation that is. The answers are cached in memory
// for a minute, so a burst of pushes costs one read per organisation.

const TTL_MS = 60 * 1000;

function createPushGate({ db, now = () => Date.now() }) {
  const cache = new Map();
  const cached = async (key, load) => {
    const hit = cache.get(key);
    if (hit && now() - hit.at < TTL_MS) return hit.value;
    const value = await load();
    cache.set(key, { at: now(), value });
    if (cache.size > 2000) cache.clear();
    return value;
  };
  const exists = async (path) => (await db.ref(path).get()).exists();

  const accountDeactivated = (uid) => cached(`u:${uid}`, () => exists(`account_deletions/${uid}`));
  const organizationDeactivated = (orgId) => cached(`o:${orgId}`, () => exists(`orgs/${orgId}/metadata/deleted_at`));
  const orgOfTrip = (tripId) => cached(`t:${tripId}`, async () => {
    const snap = await db.ref(`trips_orgs/${tripId}`).get();
    return snap.exists() ? snap.val() : null;
  });

  // True when the push must be dropped.
  async function blocked(uid, { orgId = null, tripId = null } = {}) {
    if (await accountDeactivated(uid)) return true;
    const org = orgId || (tripId ? await orgOfTrip(tripId) : null);
    return !!org && (await organizationDeactivated(org));
  }
  return { blocked };
}

let shared;
function getPushGate() {
  if (!shared) shared = createPushGate({ db: require("../admin").db });
  return shared;
}

module.exports = { createPushGate, getPushGate };
