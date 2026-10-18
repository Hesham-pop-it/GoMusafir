// SendGrid Event Webhook: checks the ECDSA signature and marks bounced, dropped and blocked invitation mails.
// The mail carries org_id, trip_id and invitation_id as custom args; SendGrid echoes them in every event.
const crypto = require('crypto');
const { invitationRef, SAFE_ID, normalizeEmail } = require('./invitationService');

const SIGNATURE = 'x-twilio-email-event-webhook-signature';
const TIMESTAMP = 'x-twilio-email-event-webhook-timestamp';
// The timestamp is signed with the body, so a captured request could be replayed for ever. SendGrid retries a failed
// delivery for up to 24 hours, so a request up to 24 hours old is accepted; 10 minutes ahead covers clock skew.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 10 * 60 * 1000;
const BAD_EVENTS = new Set(['bounce', 'dropped', 'blocked']);

// publicKey: the base64 (DER, SPKI) key shown in the SendGrid settings. The signed text is timestamp + raw body.
function verifySignature({ publicKey, signature, timestamp, rawBody }) {
  if (!publicKey || !signature || !timestamp || rawBody === undefined || rawBody === null) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(String(publicKey).trim(), 'base64'), format: 'der', type: 'spki' });
    const verify = crypto.createVerify('sha256');
    verify.update(Buffer.concat([Buffer.from(String(timestamp)), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody))]));
    return verify.verify(key, Buffer.from(String(signature), 'base64'));
  } catch (_) {
    return false;
  }
}

// timestamp: epoch seconds as SendGrid sends it; nowMs: the current time in milliseconds.
function timestampIsFresh(timestamp, nowMs) {
  if (!/^\d{1,13}$/.test(String(timestamp))) return false;
  const age = nowMs - Number(timestamp) * 1000;
  return age <= MAX_AGE_MS && age >= -MAX_FUTURE_MS;
}

async function applyEvents(events, now = Date.now()) {
  let marked = 0;
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || !BAD_EVENTS.has(event.event)) continue;
    const { org_id: orgId, trip_id: tripId, invitation_id: id } = event;
    if (![orgId, tripId, id].every(v => typeof v === 'string' && SAFE_ID.test(v))) continue;
    const result = await invitationRef(tripId, id).transaction(record => {
      if (!record) return record; // the first run may see an empty local cache; the server then reruns with the real record
      if (record.status === 'joined') return undefined;
      if (normalizeEmail(record.email) !== normalizeEmail(event.email)) return undefined;
      return { ...record, status: 'bounced', bounced_at: now, bounce_reason: String(event.reason || event.type || event.event).slice(0, 200) };
    });
    if (result.committed && result.snapshot.val()?.bounced_at === now) marked++;
  }
  return marked;
}

// Handler factory so tests can inject the key; production passes the secret.
function createWebhookHandler({ getPublicKey, now = Date.now }) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('POST only');
    const publicKey = getPublicKey();
    if (!publicKey) return res.status(500).send('Webhook key is not configured');
    const rawBody = req.rawBody ?? '';
    if (!verifySignature({ publicKey, signature: req.get(SIGNATURE), timestamp: req.get(TIMESTAMP), rawBody })) {
      return res.status(401).send('Invalid signature');
    }
    if (!timestampIsFresh(req.get(TIMESTAMP), now())) return res.status(401).send('Stale timestamp');
    let events;
    try { events = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody); } catch (_) { return res.status(400).send('Invalid body'); }
    const marked = await applyEvents(events, now());
    return res.status(200).json({ marked });
  };
}

module.exports = { verifySignature, timestampIsFresh, MAX_AGE_MS, MAX_FUTURE_MS, applyEvents, createWebhookHandler };
