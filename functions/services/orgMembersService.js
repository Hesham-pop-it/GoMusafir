const { db } = require('../admin');

// org_members/{orgId}/{uid}: server-only index of every user who is staff of the
// org or participant of one of its trips. The database rules use it so staff can
// read profiles of their own organisation only.
// trip_cards/{tripId}/{uid}: the non-sensitive display subset (name, photo) that
// fellow travellers may read. Email, phone and encrypted blobs are never copied.
const CARD_PROFILE_KEYS = ['firstName', 'lastName', 'first_name', 'last_name', 'photoURL', 'photo_url',
  'photo', 'profile_photo', 'image', 'avatar', 'profile_picture'];

function buildCard(user) {
  const source = user && typeof user === 'object' ? user : {};
  const profile = {};
  for (const key of CARD_PROFILE_KEYS) {
    const value = source.profile?.[key];
    if (typeof value === 'string' && value) profile[key] = value;
  }
  const card = { v: 1 };
  if (typeof source.full_name === 'string' && source.full_name) card.full_name = source.full_name;
  if (typeof source.photo_url === 'string' && source.photo_url) card.photo_url = source.photo_url;
  if (Object.keys(profile).length) card.profile = profile;
  return card;
}

async function readUserCardSource(uid) {
  const [profile, fullName, photoUrl] = await Promise.all(['profile', 'full_name', 'photo_url']
    .map(key => db.ref(`users/${uid}/${key}`).get()));
  return { profile: profile.val(), full_name: fullName.val(), photo_url: photoUrl.val() };
}

async function writeCard(tripId, uid, source) {
  await db.ref(`trip_cards/${tripId}/${uid}`).set(buildCard(source || await readUserCardSource(uid)));
}

async function removeCard(tripId, uid) {
  await db.ref(`trip_cards/${tripId}/${uid}`).remove();
}

async function isParticipant(tripId, uid) {
  return (await db.ref(`trips_participants/${tripId}/${uid}`).get()).exists();
}

async function orgTripIds(orgId) {
  return Object.keys((await db.ref(`orgs/${orgId}/trips`).get()).val() || {});
}

// Recomputes membership from the source of truth. Used for removals, where the
// user may still be staff or a participant of another trip of the same org.
async function isOrgMember(orgId, uid) {
  if ((await db.ref(`orgs/${orgId}/staff/${uid}`).get()).exists()) return true;
  for (const tripId of await orgTripIds(orgId)) if (await isParticipant(tripId, uid)) return true;
  return false;
}

async function syncOrgMember(orgId, uid) {
  if (!orgId || !uid) return false;
  const member = await isOrgMember(orgId, uid);
  await db.ref(`org_members/${orgId}/${uid}`).set(member ? true : null);
  return member;
}

async function onParticipantChanged(tripId, uid, present) {
  const orgId = (await db.ref(`trips_orgs/${tripId}`).get()).val();
  if (!orgId) return;
  if (present) {
    await db.ref(`org_members/${orgId}/${uid}`).set(true);
    await writeCard(tripId, uid);
    return;
  }
  const isStaff = (await db.ref(`orgs/${orgId}/staff/${uid}`).get()).exists();
  if (!isStaff) await removeCard(tripId, uid);
  await syncOrgMember(orgId, uid);
}

async function onStaffChanged(orgId, uid, present) {
  const tripIds = await orgTripIds(orgId);
  if (present) {
    await db.ref(`org_members/${orgId}/${uid}`).set(true);
    const source = await readUserCardSource(uid);
    for (const tripId of tripIds) await writeCard(tripId, uid, source);
    return;
  }
  for (const tripId of tripIds) if (!await isParticipant(tripId, uid)) await removeCard(tripId, uid);
  await syncOrgMember(orgId, uid);
}

// Profile data changed: refresh the user's card on every trip they belong to.
async function refreshUserCards(uid) {
  const [joined, staffOrg] = await Promise.all([db.ref(`users/${uid}/joined_trips`).get(), db.ref(`users/${uid}/staff_org_id`).get()]);
  const tripIds = new Set(Object.keys(joined.val() || {}));
  if (staffOrg.val()) for (const tripId of await orgTripIds(staffOrg.val())) tripIds.add(tripId);
  const source = await readUserCardSource(uid);
  for (const tripId of tripIds) {
    const orgId = (await db.ref(`trips_orgs/${tripId}`).get()).val();
    if (!orgId) continue;
    if (await isParticipant(tripId, uid) || (await db.ref(`orgs/${orgId}/staff/${uid}`).get()).exists()) await writeCard(tripId, uid, source);
  }
}

// Idempotent: rebuilds the index and cards for one organisation from the staff
// list and trips_participants. Used by functions/scripts/backfillOrgMembers.js.
async function backfillOrg(orgId, { apply = true } = {}) {
  const org = (await db.ref(`orgs/${orgId}`).get()).val() || {};
  const members = new Set(Object.keys(org.staff || {}));
  const cards = [];
  for (const tripId of Object.keys(org.trips || {})) {
    const participants = Object.keys((await db.ref(`trips_participants/${tripId}`).get()).val() || {});
    participants.forEach(uid => members.add(uid));
    for (const uid of new Set([...participants, ...Object.keys(org.staff || {})])) cards.push([tripId, uid]);
  }
  if (apply) {
    for (const uid of members) await db.ref(`org_members/${orgId}/${uid}`).set(true);
    for (const [tripId, uid] of cards) await writeCard(tripId, uid);
  }
  return { orgId, members: members.size, cards: cards.length };
}

module.exports = { buildCard, writeCard, removeCard, syncOrgMember, onParticipantChanged, onStaffChanged,
  refreshUserCards, orgTripIds, backfillOrg };
