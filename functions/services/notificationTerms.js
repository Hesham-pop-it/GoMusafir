// How long each notification type stays visible. The durations come from the
// server node config/notification_terms (so they change without an app
// release); these defaults apply while that node is absent or a type is missing.
// An expired notification only leaves the list: payments, chat, SOS records and
// organisation logs stay under their own retention.
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const DEFAULT_TERMS = {
  // An open SOS never expires; once resolved it stays this long.
  emergency_resolved_ms: DAY,
  location_request_ms: DAY,
  location_response_ms: DAY,
  // Announcements last this long or until the trip ends, whichever is first.
  alert_ms: 3 * DAY,
  seat_update_ms: 30 * DAY,
  participant_joined_ms: DAY,
  voice_ms: DAY,
  new_sign_in_ms: 30 * DAY,
  default_ms: 30 * DAY,
};

const CONFIG_TTL_MS = 60 * 1000;
let cached = null;

function mergeTerms(raw) {
  const terms = { ...DEFAULT_TERMS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULT_TERMS)) {
      const value = Number(raw[key]);
      if (Number.isFinite(value) && value > 0) terms[key] = value;
    }
  }
  return terms;
}

// Config is read at most once a minute per function instance.
async function loadTerms(db, now = Date.now()) {
  if (cached && now - cached.at < CONFIG_TTL_MS) return cached.terms;
  let raw = null;
  try { raw = (await db.ref('config/notification_terms').get()).val(); } catch (_) { /* defaults */ }
  cached = { at: now, terms: mergeTerms(raw) };
  return cached.terms;
}

const termKey = type => {
  const t = String(type || '').toLowerCase();
  if (t === 'emergency') return 'emergency';
  if (t.startsWith('voice_')) return 'voice';
  return t;
};

// The moment a record stops being shown, or null when it does not expire
// (an open SOS). `tripEndsAt` bounds announcements.
function visibleUntil(record, terms, tripEndsAt = null) {
  if (!record || typeof record !== 'object') return null;
  const at = Number(record.timestamp) > 0 ? Number(record.timestamp) : Date.now();
  const key = termKey(record.type);
  if (key === 'emergency') {
    return Number(record.resolved_at) > 0 ? Number(record.resolved_at) + terms.emergency_resolved_ms : null;
  }
  // A request is closed once it is accepted or declined.
  if (key === 'location_request' && ['accepted', 'declined'].includes(record.status)) {
    return Number(record.respondedAt) > 0 ? Number(record.respondedAt) : at;
  }
  if (key === 'alert') {
    const until = at + terms.alert_ms;
    return Number(tripEndsAt) > 0 ? Math.min(until, Number(tripEndsAt)) : until;
  }
  const ms = terms[`${key}_ms`] || (key === 'voice' ? terms.voice_ms : terms.default_ms);
  return at + ms;
}

// Stamped value wins; unstamped records (older, or not yet processed) are computed.
function activeUntil(record, terms, tripEndsAt = null) {
  const stamped = Number(record?.visible_until);
  return stamped > 0 ? stamped : visibleUntil(record, terms, tripEndsAt);
}

const isActive = (record, terms, now = Date.now(), tripEndsAt = null) => {
  const until = activeUntil(record, terms, tripEndsAt);
  return until === null || until > now;
};

// Index entry the daily prune queries: notification_expiry/{notifId} = { at, path }.
const expiryEntry = (notifId, path, until) => ({
  [`notification_expiry/${notifId}`]: until ? { at: until, path } : null,
});

function resetTermsCache() { cached = null; }

module.exports = { DEFAULT_TERMS, loadTerms, mergeTerms, visibleUntil, activeUntil, isActive, expiryEntry, resetTermsCache };
