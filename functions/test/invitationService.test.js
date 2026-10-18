const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
// Pure helpers only: the database and auth handles are never touched, so the admin module is replaced.
const original = Module._load;
Module._load = function (request, ...rest) {
  if (request === '../../admin') return { db: {}, auth: {}, admin: {} };
  return original.call(this, request, ...rest);
};
const { normalizeEmail, isValidEmail, invitationId, unique } = require('../services/invitations/invitationService');
Module._load = original;

test('addresses are trimmed and lower-cased', () => {
  assert.equal(normalizeEmail('  Ahmed@Example.COM '), 'ahmed@example.com');
  assert.equal(normalizeEmail(null), '');
});
test('validation catches the usual typos', () => {
  for (const good of ['a@b.co', 'first.last+tag@sub.example.org']) assert.equal(isValidEmail(good), true, good);
  for (const bad of ['ahmed', 'a@b', 'a b@c.com', '@c.com', 'a@c..com', 'a@@c.com', 'a@c.com,b@d.com', `${'a'.repeat(250)}@c.com`]) assert.equal(isValidEmail(bad), false, bad);
});
test('duplicates collapse case-insensitively and invalid ones are set apart', () => {
  assert.deepEqual(unique(['A@b.com', 'a@b.com ', 'bad', 'bad', '', 'c@d.com']), { valid: ['a@b.com', 'c@d.com'], invalid: ['bad'] });
});
test('the record id depends only on the normalised address and is a safe key', () => {
  assert.equal(invitationId('A@b.com '), invitationId('a@b.com'));
  assert.notEqual(invitationId('a@b.com'), invitationId('a@b.org'));
  assert.match(invitationId('a@b.com'), /^[0-9a-f]{24}$/);
});
