const crypto = require('node:crypto');

// Same JSON for the same content, whatever order parallel reads filled objects in.
function stableJson(value) {
  return JSON.stringify(value ?? null, (_, entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    return Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]));
  });
}

// Polling clients send the hash of the response they already hold. An unchanged
// result is answered with the hash only. Callers without a hash (older app
// versions) keep receiving the plain data.
function respond(request, data) {
  const known = request.data?.knownHash;
  if (typeof known !== 'string' || known.length > 64) return data;
  const hash = crypto.createHash('sha256').update(stableJson(data)).digest('base64url');
  return hash === known ? { envelope: 1, unchanged: true, hash } : { envelope: 1, hash, data: data ?? null };
}

module.exports = { respond, stableJson };
