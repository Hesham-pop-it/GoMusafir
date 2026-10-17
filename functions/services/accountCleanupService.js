// ─── Account / Trip / Organisation Cleanup ───────────────────────────────────
// One shared helper for deleteMyAccount, deleteUserGlobally, deleteOrganization
// and deleteTrip. Per data type it decides: wipe, anonymise or keep.
//
//  WIPE       users/{uid} (profile, p_profile, push tokens, notifications), otp_codes,
//             app_access, live location, location permissions, read pointers,
//             voice presence, per-trip notifications, trips_participants,
//             joined_trips, the staff record, the user's chat attachments and
//             avatars in Storage (chat_media/{trip}/{uid}/, participant_avatars/{trip}/{uid}/,
//             users/{uid}/).
//  ANONYMISE  chat messages: kept, sender shown as "Deleted user", no avatar, no
//             media URLs, sender_id replaced by DELETED_USER_ID.
//  KEEP       Stripe customer ids and every payment / invoice / seat record
//             (7 year retention), org metadata, audit logs. Nothing in this file
//             touches Stripe or payment nodes.
//
// All operations are idempotent: running them again after a partial failure
// finishes the job. Dependencies are injected so the logic is unit-testable.

const DELETED_USER_NAME = "Deleted user";
const DELETED_USER_ID = "deleted_user";
const ORG_PURGE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const MEDIA_FIELDS = ["image_url", "media_url", "audio_url", "video_url", "thumbnail_url"];
const CHUNK = 400;

function createAccountCleanup({ db, bucket, auth, now = () => Date.now() }) {
  const val = async (path) => {
    const snap = await db.ref(path).get();
    return snap.exists() ? snap.val() : null;
  };

  const flush = async (updates) => {
    const keys = Object.keys(updates);
    for (let i = 0; i < keys.length; i += CHUNK) {
      const part = {};
      keys.slice(i, i + CHUNK).forEach((k) => { part[k] = updates[k]; });
      await db.ref().update(part);
    }
  };

  const deletePrefix = (prefix) => bucket.deleteFiles({ prefix, force: true });

  // ── Trip media ──────────────────────────────────────────────────────────────
  const storagePathFromUrl = (url) => {
    if (typeof url !== "string") return null;
    const m = url.match(/\/o\/([^?]+)/);
    if (!m) return null;
    try {
      const name = decodeURIComponent(m[1]);
      return name.startsWith("trips/") && !name.includes("..") ? name : null;
    } catch (e) {
      return null;
    }
  };

  // Deletes the trip's chat media, participant avatars and cover photo. The cover is
  // kept when another trip in the same org still uses the same image.
  async function deleteTripMedia(orgId, tripId, trip) {
    await deletePrefix(`chat_media/${tripId}/`);
    await deletePrefix(`participant_avatars/${tripId}/`);
    const coverPath = storagePathFromUrl(trip && trip.image);
    if (!coverPath) return;
    const trips = (await val(`orgs/${orgId}/trips`)) || {};
    const shared = Object.keys(trips).some((id) => id !== tripId && trips[id] && trips[id].image === trip.image);
    if (!shared) await bucket.file(coverPath).delete({ ignoreNotFound: true });
  }

  // ── Trip deletion (used by deleteTrip and the organisation purge) ───────────
  // Removes all trip data and its Storage media; org payment data is untouched.
  async function deleteTripData(orgId, tripId, trip = null) {
    const tripRecord = trip || (await val(`orgs/${orgId}/trips/${tripId}`));
    const participants = (await val(`trips_participants/${tripId}`)) || {};
    const participantIds = Object.keys(participants).filter((pid) => participants[pid]);
    // Every voice room of this trip (one per session), found by the tripId index.
    const rooms = (await db.ref("voice_rooms").orderByChild("tripId").equalTo(tripId).get()).val() || {};

    // Storage first: if it fails the DB is still intact and the call can be retried.
    await deleteTripMedia(orgId, tripId, tripRecord);

    const updates = {
      [`orgs/${orgId}/trips/${tripId}`]: null,
      [`trips_orgs/${tripId}`]: null,
      [`trips_participants/${tripId}`]: null,
      [`trips_active/${orgId}/${tripId}`]: null,
      [`trip_feature_access/${orgId}/${tripId}`]: null,
      [`voice_inactivity/${orgId}/${tripId}`]: null,
      [`voice_speakers/${orgId}/${tripId}`]: null,
    };
    Object.keys(rooms).forEach((roomName) => {
      updates[`voice_rooms/${roomName}`] = null;
      updates[`voice_speaker_locks/${roomName}`] = null;
    });
    if (tripRecord && tripRecord.invitation_code) updates[`invites/${tripRecord.invitation_code}`] = null;
    participantIds.forEach((pid) => { updates[`users/${pid}/joined_trips/${tripId}`] = null; });
    await flush(updates);
    return { participantIds };
  }

  // ── Chat anonymisation ──────────────────────────────────────────────────────
  async function anonymiseChat(orgId, tripId, uid) {
    const snap = await db.ref(`trips_active/${orgId}/${tripId}/chat`).orderByChild("sender_id").equalTo(uid).get();
    if (!snap.exists()) return 0;
    const updates = {};
    let count = 0;
    snap.forEach((child) => {
      const base = `trips_active/${orgId}/${tripId}/chat/${child.key}`;
      updates[`${base}/sender_id`] = DELETED_USER_ID;
      updates[`${base}/sender_name`] = DELETED_USER_NAME;
      updates[`${base}/avatar`] = null;
      MEDIA_FIELDS.forEach((f) => { updates[`${base}/${f}`] = null; });
      count++;
    });
    await flush(updates);
    return count;
  }

  // ── One user, one trip ──────────────────────────────────────────────────────
  async function removeUserFromTrip(uid, orgId, tripId) {
    await anonymiseChat(orgId, tripId, uid);
    await deletePrefix(`chat_media/${tripId}/${uid}/`);
    await deletePrefix(`participant_avatars/${tripId}/${uid}/`);

    const base = `trips_active/${orgId}/${tripId}`;
    const updates = {
      [`${base}/locations/${uid}`]: null,
      [`${base}/notifications/${uid}`]: null,
      [`${base}/read_pointers/${uid}`]: null,
      [`${base}/location_permissions/${uid}`]: null,
      [`${base}/voice_channel/presence/${uid}`]: null,
      [`${base}/voice_channel/app_presence/${uid}`]: null,
      [`${base}/voice_channel/active_hosts/${uid}`]: null,
      [`${base}/voice_presence/${uid}`]: null,
      [`trips_participants/${tripId}/${uid}`]: null,
      [`users/${uid}/joined_trips/${tripId}`]: null,
    };
    // Permissions other users granted to or requested from this user.
    const perms = (await val(`${base}/location_permissions`)) || {};
    Object.keys(perms).forEach((target) => {
      if (perms[target] && typeof perms[target] === "object" && uid in perms[target]) {
        updates[`${base}/location_permissions/${target}/${uid}`] = null;
      }
    });
    await flush(updates);
  }

  // Which of the user's trips belong to which org.
  async function userTripsByOrg(uid) {
    const joined = (await val(`users/${uid}/joined_trips`)) || {};
    const byOrg = {};
    for (const tid of Object.keys(joined)) {
      let orgId = joined[tid] && (joined[tid].org_id || joined[tid].orgId);
      if (!orgId) orgId = await val(`trips_orgs/${tid}`);
      if (!orgId) continue;
      (byOrg[orgId] = byOrg[orgId] || new Set()).add(tid);
    }
    return byOrg;
  }

  async function staffRecord(uid, orgId) {
    return orgId ? val(`orgs/${orgId}/staff/${uid}`) : null;
  }

  // ── Remove a user from one org only; the account itself stays ───────────────
  // Used by deleteUserGlobally when the user also belongs to other orgs.
  async function removeUserFromOrg(uid, orgId) {
    const byOrg = await userTripsByOrg(uid);
    const tripIds = new Set(byOrg[orgId] || []);
    const isStaff = !!(await staffRecord(uid, orgId));
    if (isStaff) Object.keys((await val(`orgs/${orgId}/trips`)) || {}).forEach((t) => tripIds.add(t));
    for (const tripId of tripIds) await removeUserFromTrip(uid, orgId, tripId);
    if (isStaff) {
      const updates = { [`orgs/${orgId}/staff/${uid}`]: null };
      if ((await val(`users/${uid}/staff_org_id`)) === orgId) updates[`users/${uid}/staff_org_id`] = null;
      await flush(updates);
    }
    return { trips: tripIds.size, wasStaff: isStaff };
  }

  // ── Remove a user everywhere (not the Auth record; the caller deletes that last) ──
  async function removeUserCompletely(uid, { staffOrgId = null } = {}) {
    const byOrg = await userTripsByOrg(uid);
    const dbStaffOrg = await val(`users/${uid}/staff_org_id`);
    const orgIds = new Set([...Object.keys(byOrg), staffOrgId, dbStaffOrg].filter(Boolean));
    for (const orgId of orgIds) await removeUserFromOrg(uid, orgId);
    await deletePrefix(`users/${uid}/`);
    await flush({
      [`users/${uid}`]: null,
      [`otp_codes/${uid}`]: null,
      [`app_access/${uid}`]: null,
    });
    return { orgs: [...orgIds] };
  }

  // Memberships of a user outside one org (other orgs' trips or staff roles).
  async function hasMembershipsOutsideOrg(uid, orgId) {
    const byOrg = await userTripsByOrg(uid);
    if (Object.keys(byOrg).some((o) => o !== orgId)) return true;
    const staffOrg = await val(`users/${uid}/staff_org_id`);
    return !!staffOrg && staffOrg !== orgId;
  }

  async function userBelongsToOrg(uid, orgId) {
    const byOrg = await userTripsByOrg(uid);
    if (byOrg[orgId]) return true;
    return (await val(`users/${uid}/staff_org_id`)) === orgId;
  }

  // ── Organisation soft delete (shared by deleteOrganization / deleteMyAccount) ──
  async function markOrganizationDeleted(orgId, timestamp) {
    await db.ref(`orgs/${orgId}/metadata/deleted_at`).set(timestamp);
  }

  // ── Organisation purge (after the grace period) ─────────────────────────────
  // Deletes trips, chat, media, staff list and participant links. KEEPS payments,
  // prepaid seats, checkout sessions, consents, metadata (incl. Stripe id) and logs.
  async function purgeOrganization(orgId) {
    const tripIds = new Set([
      ...Object.keys((await val(`orgs/${orgId}/trips`)) || {}),
      ...Object.keys((await val(`trips_active/${orgId}`)) || {}),
    ]);
    for (const tripId of tripIds) {
      await deleteTripData(orgId, tripId);
    }
    await flush({ [`trips_active/${orgId}`]: null });

    const staff = (await val(`orgs/${orgId}/staff`)) || {};
    for (const staffUid of Object.keys(staff)) {
      if ((await val(`users/${staffUid}/staff_org_id`)) === orgId) {
        await flush({ [`users/${staffUid}/staff_org_id`]: null });
      }
      try {
        const rec = await auth.getUser(staffUid);
        const claims = { ...(rec.customClaims || {}) };
        if (claims.orgId === orgId) {
          delete claims.role;
          delete claims.orgId;
          await auth.setCustomUserClaims(staffUid, claims);
        }
        await auth.revokeRefreshTokens(staffUid);
      } catch (e) {
        if (e.code !== "auth/user-not-found") throw e;
      }
    }
    await flush({
      [`orgs/${orgId}/staff`]: null,
      [`orgs/${orgId}/dashboard_stats`]: null,
      [`orgs/${orgId}/metadata/purged_at`]: now(),
    });
    return { trips: tripIds.size, staff: Object.keys(staff).length };
  }

  // Orgs whose deleted_at is older than the grace period and that are not purged yet.
  async function findOrganizationsDueForPurge({ graceMs = ORG_PURGE_GRACE_MS } = {}) {
    const snap = await db.ref("orgs").orderByChild("metadata/deleted_at").startAt(1).get();
    const due = [];
    if (!snap.exists()) return due;
    const cutoff = now() - graceMs;
    snap.forEach((child) => {
      const meta = (child.val() || {}).metadata || {};
      if (typeof meta.deleted_at === "number" && meta.deleted_at <= cutoff && !meta.purged_at) due.push(child.key);
    });
    return due;
  }

  return {
    deleteTripData, deleteTripMedia, anonymiseChat, removeUserFromTrip, removeUserFromOrg,
    removeUserCompletely, hasMembershipsOutsideOrg, userBelongsToOrg, markOrganizationDeleted,
    purgeOrganization, findOrganizationsDueForPurge,
  };
}

async function runOrganizationPurge(cleanup, { enabled, graceMs = ORG_PURGE_GRACE_MS } = {}) {
  const due = await cleanup.findOrganizationsDueForPurge({ graceMs });
  const result = { due, purged: [], failed: [], dryRun: !enabled };
  if (!enabled) return result;
  for (const orgId of due) {
    try {
      await cleanup.purgeOrganization(orgId);
      result.purged.push(orgId);
    } catch (e) {
      console.error("Organisation purge failed", { orgId, message: e.message });
      result.failed.push(orgId);
    }
  }
  return result;
}

// Default instance bound to the real Admin SDK. Created lazily so tests can load this file without Firebase.
let shared;
function getAccountCleanup() {
  if (!shared) {
    const { admin, db, auth } = require("../admin");
    shared = createAccountCleanup({ db, auth, bucket: admin.storage().bucket() });
  }
  return shared;
}

module.exports = {
  createAccountCleanup, getAccountCleanup, runOrganizationPurge,
  DELETED_USER_NAME, DELETED_USER_ID, ORG_PURGE_GRACE_MS,
};
