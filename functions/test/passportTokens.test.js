const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../services/passport/passportTokens');

test('tokens are 256-bit, url-safe and hashed one way', () => {
  const a = t.newToken(), b = t.newToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(t.isTokenShape(a), true);
  for (const bad of ['', 'short', a + 'x', a.slice(1) + '!', null, 42, `${a.slice(0, 42)}/`]) assert.equal(t.isTokenShape(bad), false, String(bad));
  assert.match(t.hashToken(a), /^[0-9a-f]{64}$/);
  assert.notEqual(t.hashToken(a), a);
});
test('codes have six digits, keep leading zeros and are bound to the link', () => {
  for (let i = 0; i < 200; i++) assert.match(t.newCode(), /^\d{6}$/);
  assert.equal(t.isCodeShape('012345'), true);
  for (const bad of ['12345', '1234567', '12345a', ' 12345', 123456, null]) assert.equal(t.isCodeShape(bad), false, String(bad));
  const d = t.codeDigest('linkA', '123456');
  assert.equal(t.digestsMatch(d, t.codeDigest('linkA', '123456')), true);
  assert.equal(t.digestsMatch(d, t.codeDigest('linkA', '123457')), false);
  assert.equal(t.digestsMatch(d, t.codeDigest('linkB', '123456')), false);
  assert.equal(t.digestsMatch(d, 'zz'), false);
  assert.equal(t.digestsMatch(undefined, d), false);
});
test('the masked address hides the mailbox and keeps the shape', () => {
  assert.equal(t.maskEmail('ahmed@example.com'), 'a•••@e•••.com');
  assert.equal(t.maskEmail('x@mail.co.uk'), 'x•••@m•••.uk');
  assert.equal(t.maskEmail(''), '•••@•••');
});
