// Family links between two pilgrims of the same trip (phase 5, F12). The sender always gets the same answer,
// whether or not the address belongs to someone on the trip: a request to an unknown address is stored with no
// recipient and simply stays "sent" (the recipient is attached when that address later opens their own list).
// A decline also reads "sent". A request to oneself, a repeat of an earlier one, one answering a request already
// received, or one beyond 10 per person gets the same answer but stores nothing, so it leaves no row in the list.
// Records: passport_family/{org}/{trip}/{id}. Nothing here is readable by clients.
const crypto = require('crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { db, auth } = require('../../admin');
const { RELATIONS } = require('./passportValidation');
const { maskEmail } = require('./passportTokens');
const { isValidEmail, normalizeEmail } = require('../invitations/invitationService');
const store = require('./passportStore');

const MAX_REQUESTS_PER_PERSON = 10;
const familyRef = (org, trip) => db.ref(`passport_family/${org}/${trip}`);
const emailHash = email => crypto.createHash('sha256').update(email).digest('hex').slice(0, 24);

async function lookupMember(trip, email) {
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) return null;
  return (await db.ref(`trips_participants/${trip}/${user.uid}`).get()).val() ? user.uid : null;
}

// -> always { ok: true, status: 'sent' } for a well-formed request.
async function request({ org, trip, uid, email, relation, now = Date.now() }) {
  const address = normalizeEmail(email);
  if (!isValidEmail(address)) throw new HttpsError('invalid-argument', 'The email address is not valid.', { reason: 'invalid_field', field: 'email' });
  if (!RELATIONS.includes(relation)) throw new HttpsError('invalid-argument', 'Choose a relation from the list.', { reason: 'invalid_field', field: 'relation' });
  const known = (await familyRef(org, trip).get()).val() || {};
  const mine = Object.values(known).filter(r => r.from_uid === uid);
  const target = await lookupMember(trip, address);
  const hash = emailHash(address);
  const self = (await auth.getUser(uid).catch(() => null))?.email?.toLowerCase() === address;
  const reverse = target && Object.values(known).some(r => r.from_uid === target && r.to_uid === uid && r.status !== 'declined');
  const duplicate = mine.some(r => r.to_email_hash === hash);
  if (!duplicate && !reverse && !self && mine.length < MAX_REQUESTS_PER_PERSON) {
    await familyRef(org, trip).push().set({
      from_uid: uid, to_uid: target && target !== uid ? target : null, to_email_masked: maskEmail(address), to_email_hash: hash,
      relation, status: 'pending', created_at: now,
    });
    await store.registerRetention(org, trip, now);
  }
  return { ok: true, status: 'sent' };
}

async function displayName(org, trip, uid) {
  const raw = (await store.dataRef(org, trip, uid).child('steps/gegevens/enc').get()).val();
  if (raw) { try { const name = store.decryptStep(raw).name; if (name) return name; } catch (_) { /* use the account name */ } }
  return (await store.accountContact(uid)).name;
}

// -> { incoming[], outgoing[] } for one person. Declined requests are invisible to the sender.
// A request stored before its recipient was on the trip carries only the address hash: the first time that person
// opens their list with a matching account address, they become the recipient.
async function view({ org, trip, uid }) {
  const records = (await familyRef(org, trip).get()).val() || {};
  const open = Object.entries(records).filter(([, r]) => !r.to_uid && r.to_email_hash && r.from_uid !== uid);
  if (open.length) {
    const mine = (await auth.getUser(uid).catch(() => null))?.email;
    const myHash = mine ? emailHash(normalizeEmail(mine)) : null;
    for (const [id, r] of open) {
      if (r.to_email_hash !== myHash) continue;
      const claim = await familyRef(org, trip).child(id).child('to_uid').transaction(cur => (cur ? undefined : uid), undefined, false);
      if (claim.committed) records[id] = { ...r, to_uid: uid };
    }
  }
  const incoming = [], outgoing = [];
  for (const [id, r] of Object.entries(records)) {
    if (r.from_uid === uid) {
      const confirmed = r.status === 'confirmed';
      outgoing.push({ id, email: r.to_email_masked, email_masked: r.to_email_masked, relation: r.relation, status: confirmed ? 'confirmed' : 'sent',
        ...(confirmed ? { name: await displayName(org, trip, r.to_uid), their_relation: r.answer_relation } : {}), created_at: r.created_at });
    } else if (r.to_uid === uid && r.status !== 'declined') {
      const from = await displayName(org, trip, r.from_uid);
      incoming.push({ id, from_name: from, name: from, relation: r.relation, status: r.status,
        ...(r.status === 'confirmed' ? { their_relation: r.answer_relation } : {}), created_at: r.created_at });
    }
  }
  return { incoming, outgoing };
}

async function answer({ org, trip, uid, id, relation, decline, now = Date.now() }) {
  if (typeof id !== 'string' || !/^[-\w]{1,64}$/.test(id)) throw new HttpsError('invalid-argument', 'Unknown request.');
  if (decline === true ? relation !== undefined : !RELATIONS.includes(relation)) {
    throw new HttpsError('invalid-argument', 'Choose a relation from the list or decline.', { reason: 'invalid_field', field: 'relation' });
  }
  let open = false;
  const result = await familyRef(org, trip).child(id).transaction(r => {
    open = false;
    if (!r) return r;
    if (r.to_uid !== uid || r.status !== 'pending') return undefined;
    open = true;
    return decline === true ? { ...r, status: 'declined', answered_at: now } : { ...r, status: 'confirmed', answer_relation: relation, answered_at: now };
  }, undefined, false);
  if (!result.committed || !open) throw new HttpsError('not-found', 'This request is no longer open.', { reason: 'not_found' });
  return { ok: true, family: await view({ org, trip, uid }) };
}

module.exports = { MAX_REQUESTS_PER_PERSON, request, view, answer };
