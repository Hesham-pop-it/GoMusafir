// Database side of e-mail invitations (phase 4): per-address records, the check before sending,
// the organisation participant index and its backfill. The mail text lives in invitationMail.js.
const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { db, auth } = require('../../admin');

const MAX_BATCH = 500;
const RESEND_GAP_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_MAILS_PER_HOUR = 1000; // per organisation
const SAFE_ID = /^[-\w]{1,64}$/;
const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const normalizeEmail = value => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const isValidEmail = email => email.length <= 254 && EMAIL.test(email);
// One record per address in a trip: the id is derived from the address, so a double click or two tabs cannot create a second one.
const invitationId = email => crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 24);
const invitationRef = (tripId, id) => db.ref(`trip_invitations/${tripId}/${id}`);

function unique(rawEmails) {
  const seen = new Set(), valid = [], invalid = [];
  for (const raw of rawEmails) {
    const email = normalizeEmail(raw);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    (isValidEmail(email) ? valid : invalid).push(email);
  }
  return { valid, invalid };
}

// The trip must belong to the caller's organisation (trips_orgs is the server-owned index).
async function loadTrip(orgId, tripId) {
  if (typeof tripId !== 'string' || !SAFE_ID.test(tripId)) throw new HttpsError('invalid-argument', 'A valid trip is required.');
  const [owner, trip] = await Promise.all([db.ref(`trips_orgs/${tripId}`).get(), db.ref(`orgs/${orgId}/trips/${tripId}`).get()]);
  if (owner.val() !== orgId || !trip.exists()) throw new HttpsError('not-found', 'Trip not found.');
  return trip.val();
}

// Addresses of everyone who joined an earlier trip of the organisation (the copy hand-off).
async function participantEmails(tripId) {
  const uids = Object.keys((await db.ref(`trips_participants/${tripId}`).get()).val() || {});
  const emails = [];
  for (let i = 0; i < uids.length; i += 100) {
    try {
      const { users } = await auth.getUsers(uids.slice(i, i + 100).map(uid => ({ uid })));
      for (const user of users) if (user.email) emails.push(normalizeEmail(user.email));
    } catch (_) { /* an unreadable batch is left out; the organiser can add addresses by hand */ }
  }
  return emails;
}

// Which of the addresses belong to accounts, and which of those are in this trip.
async function memberSet(tripId, emails) {
  const members = new Set();
  for (let i = 0; i < emails.length; i += 100) {
    let users = [];
    try { ({ users } = await auth.getUsers(emails.slice(i, i + 100).map(email => ({ email })))); } catch (_) { continue; }
    await Promise.all(users.map(async user => {
      if (user.email && (await db.ref(`trips_participants/${tripId}/${user.uid}`).get()).exists()) members.add(normalizeEmail(user.email));
    }));
  }
  return members;
}

// previewInvitations: ready / already / invalid / members plus the free seats after the ready ones.
async function classify({ tripId, trip, emails }) {
  const { valid, invalid } = unique(emails);
  const existing = (await db.ref(`trip_invitations/${tripId}`).get()).val() || {};
  const invited = new Set(Object.values(existing).map(v => normalizeEmail(v?.email)));
  const pending = Object.values(existing).filter(v => v?.status === 'sent').length;
  const already = valid.filter(email => invited.has(email));
  const fresh = valid.filter(email => !invited.has(email));
  const members = await memberSet(tripId, fresh);
  const ready = fresh.filter(email => !members.has(email));
  const seatsAfter = (Number(trip.total_seats) || 0) - (Number(trip.participants) || 0) - pending - ready.length;
  return { ready, already, invalid, members: fresh.filter(email => members.has(email)), seats_after: seatsAfter, emails: [...valid, ...invalid] };
}

// At most MAX_MAILS_PER_HOUR invitation mails per organisation per hour; the counter lives in the database so every instance shares it.
async function takeMailBudget(orgId, count, now = Date.now()) {
  const result = await db.ref(`invitation_limits/${orgId}`).transaction(current => {
    const window = current && now - current.window_start < HOUR_MS ? current : { window_start: now, count: 0 };
    if (window.count + count > MAX_MAILS_PER_HOUR) return undefined;
    return { window_start: window.window_start, count: window.count + count };
  });
  if (!result.committed) throw new HttpsError('resource-exhausted', 'Too many invitations this hour. Try again later.');
}

// Creates the record for an address; false when it already exists (nothing is overwritten).
async function createRecord(tripId, email, fields, now) {
  const id = invitationId(email);
  const result = await invitationRef(tripId, id).transaction(current => (current ? undefined : { email, status: 'sent', sent_at: now, ...fields }));
  return result.committed ? id : null;
}

async function mapLimit(items, limit, task) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) out.push(...await Promise.all(items.slice(i, i + limit).map(task)));
  return out;
}

// The user joined the trip: mark the invitation of their address and keep the organisation index current.
async function markInvitationJoined({ orgId, tripId, uid, email, now = Date.now() }) {
  const address = normalizeEmail(email);
  const updates = {};
  const staff = (await db.ref(`orgs/${orgId}/staff/${uid}`).get()).exists();
  if (!staff) {
    const known = (await db.ref(`orgs/${orgId}/participants/${uid}/trips/${tripId}`).get()).val();
    if (!known) {
      updates[`orgs/${orgId}/participants/${uid}/trips/${tripId}`] = now;
      updates[`orgs/${orgId}/participants/${uid}/last_joined_at`] = now;
    }
  }
  if (address) {
    const ref = invitationRef(tripId, invitationId(address));
    const record = (await ref.get()).val();
    if (record && record.status !== 'joined') {
      updates[`trip_invitations/${tripId}/${invitationId(address)}/status`] = 'joined';
      updates[`trip_invitations/${tripId}/${invitationId(address)}/joined_at`] = now;
    }
  }
  if (Object.keys(updates).length) await db.ref().update(updates);
  return Object.keys(updates).length > 0;
}

// Builds orgs/{org}/participants from trips_participants for trips that joined before the index existed.
async function backfillParticipants(orgId) {
  const trips = (await db.ref(`orgs/${orgId}/trips`).get()).val() || {};
  const staff = (await db.ref(`orgs/${orgId}/staff`).get()).val() || {};
  const current = (await db.ref(`orgs/${orgId}/participants`).get()).val() || {};
  const updates = {};
  const people = new Set();
  let links = 0;
  for (const [tripId, trip] of Object.entries(trips)) {
    const uids = Object.keys((await db.ref(`trips_participants/${tripId}`).get()).val() || {}).filter(uid => !staff[uid]);
    await mapLimit(uids, 25, async uid => {
      if (current[uid]?.trips?.[tripId]) { people.add(uid); return; }
      const joined = (await db.ref(`users/${uid}/joined_trips/${tripId}`).get()).val();
      if (joined?.status === 'organizer') return;
      const at = Number(joined?.joined_at) || Number(trip.created_at) || Number(trip.start_date) || Date.now();
      updates[`orgs/${orgId}/participants/${uid}/trips/${tripId}`] = at;
      current[uid] = { ...current[uid], trips: { ...current[uid]?.trips, [tripId]: at } };
      people.add(uid); links++;
    });
  }
  for (const uid of Object.keys(updates).map(path => path.split('/')[3])) {
    const joinedAt = Object.values(current[uid].trips);
    updates[`orgs/${orgId}/participants/${uid}/last_joined_at`] = Math.max(Number(current[uid].last_joined_at) || 0, ...joinedAt);
  }
  const entries = Object.entries(updates);
  for (let i = 0; i < entries.length; i += 400) await db.ref().update(Object.fromEntries(entries.slice(i, i + 400)));
  return { participants: people.size, links_added: links };
}

module.exports = {
  MAX_BATCH, RESEND_GAP_MS, MAX_MAILS_PER_HOUR, SAFE_ID, normalizeEmail, isValidEmail, invitationId, invitationRef, unique,
  loadTrip, participantEmails, classify, takeMailBudget, createRecord, mapLimit, markInvitationJoined, backfillParticipants,
};
