const crypto = require('node:crypto');

// Same JSON for the same content, whatever order parallel reads filled objects in.
function stableJson(value) {
  return JSON.stringify(value ?? null, (_, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]));
  });
}

const hashOf = value => crypto.createHash('sha256').update(stableJson(value)).digest('base64url');
const validHash = value => typeof value === 'string' && value.length <= 64;

// Polling clients send the hash of the response they already hold. An unchanged
// result is answered with the hash only. Callers without a hash (older app
// versions) keep receiving the plain data. With `knownParts` the hash is kept
// per top-level key and only changed keys are sent, so fast-moving coordinates
// do not resend every profile.
function respond(request, data) {
  const { knownHash, knownParts } = request.data || {};
  if (knownParts && typeof knownParts === 'object' && !Array.isArray(knownParts)
    && Object.keys(knownParts).length <= 16 && Object.values(knownParts).every(validHash)
    && data && typeof data === 'object' && !Array.isArray(data)) {
    const parts = {}, changed = {};
    for (const [key, value] of Object.entries(data)) {
      parts[key] = hashOf(value);
      if (knownParts[key] !== parts[key]) changed[key] = value;
    }
    const removed = Object.keys(knownParts).some(key => !(key in parts));
    return Object.keys(changed).length || removed ? { envelope: 1, parts, data: changed } : { envelope: 1, unchanged: true, parts };
  }
  if (!validHash(knownHash)) return data;
  const hash = hashOf(data);
  return hash === knownHash ? { envelope: 1, unchanged: true, hash } : { envelope: 1, hash, data: data ?? null };
}

module.exports = { respond, stableJson };
