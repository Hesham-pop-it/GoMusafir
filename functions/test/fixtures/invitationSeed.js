// Seed additions phase 4 needs, as a flat RTDB update map. The website seed (scripts/dev-seed.mjs) should add the
// same shapes for its demo organisation; the integration tests use this builder with their own organisation.
// people: [{ uid, email, status: 'sent'|'joined'|'bounced', day }] become trip_invitations records plus, for joined ones,
// the trip participant and the organisation index entry.
const crypto = require('node:crypto');
const DAY = 86400000;
const invitationId = email => crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24);

function invitationSeed({ org, tripId, people, now = Date.now() }) {
  const u = {};
  for (const p of people) {
    const sentAt = now - (p.day ?? 3) * DAY;
    const record = { email: p.email, status: p.status, sent_at: sentAt, lang: 'nl' };
    if (p.status === 'joined') record.joined_at = sentAt + DAY;
    if (p.status === 'bounced') { record.bounced_at = sentAt + 1000; record.bounce_reason = 'mailbox full'; }
    u[`trip_invitations/${tripId}/${invitationId(p.email)}`] = record;
    if (p.status === 'joined' && p.uid) {
      u[`trips_participants/${tripId}/${p.uid}`] = true;
      u[`orgs/${org}/participants/${p.uid}/trips/${tripId}`] = record.joined_at;
      u[`orgs/${org}/participants/${p.uid}/last_joined_at`] = record.joined_at;
    }
  }
  return u;
}

module.exports = { invitationSeed, invitationId };
