// Tokens and codes of the passport link (phase 5). Links and sessions are 256-bit random values; only their
// SHA-256 hash is stored, so a database read never reveals a working link. The 6-digit code is stored as a digest.
const crypto = require('crypto');

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const newToken = () => crypto.randomBytes(32).toString('base64url');
const isTokenShape = value => typeof value === 'string' && TOKEN_RE.test(value);
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const isCodeShape = value => typeof value === 'string' && /^\d{6}$/.test(value);
const codeDigest = (linkHash, code) => crypto.createHash('sha256').update(`${linkHash}:${code}`).digest('hex');
function digestsMatch(a, b) {
  const x = Buffer.from(String(a), 'hex'), y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// "ahmed@example.com" -> "a•••@e•••.com": enough to recognise the mailbox, not enough to mail it.
function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').split('@');
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${[...local][0] || ''}•••@${[...host][0] || ''}•••${tld}`;
}

module.exports = { newToken, isTokenShape, hashToken, newCode, isCodeShape, codeDigest, digestsMatch, maskEmail };
