const test = require('node:test');
const assert = require('node:assert/strict');
const { FRESH_MS, freshUntil, requireFreshApproval, normalizePurpose, sensitiveRequestSchema } = require('../services/sensitiveApprovalService');

const now = 1_800_000_000_000;
const fakeDb = (last) => ({ ref: () => ({ child: () => ({ get: async () => ({ val: () => last }) }) }) });

test('an approval younger than 15 minutes is fresh until its 15 minute mark', async () => {
  assert.equal(await freshUntil(fakeDb(now - 60000), 'u', { now }), now - 60000 + FRESH_MS);
  assert.equal(await freshUntil(fakeDb(now), 'u', { now }), now + FRESH_MS);
});

test('an approval of exactly 15 minutes or older is not fresh', async () => {
  assert.equal(await freshUntil(fakeDb(now - FRESH_MS), 'u', { now }), null);
  assert.equal(await freshUntil(fakeDb(now - FRESH_MS - 1), 'u', { now }), null);
  assert.equal(await freshUntil(fakeDb(now - FRESH_MS + 1), 'u', { now }), now + 1);
});

test('no approval, or a malformed stamp, is not fresh', async () => {
  for (const bad of [null, undefined, 'x', NaN]) assert.equal(await freshUntil(fakeDb(bad), 'u', { now }), null);
});

test('requireFreshApproval passes when fresh and refuses with a precondition error otherwise', async () => {
  assert.equal(await requireFreshApproval(fakeDb(now - 1000), 'u', { now }), now - 1000 + FRESH_MS);
  await assert.rejects(requireFreshApproval(fakeDb(now - FRESH_MS), 'u', { now }),
    e => e.code === 'failed-precondition' && e.details?.reason === 'approval_required');
  await assert.rejects(requireFreshApproval(fakeDb(null), 'u', { now }), { code: 'failed-precondition' });
});

test('the window can be shortened by the caller', async () => {
  assert.equal(await freshUntil(fakeDb(now - 5000), 'u', { now, windowMs: 4000 }), null);
});

test('purposes: login is the default, the sensitive ones are known, anything else is refused', () => {
  assert.equal(normalizePurpose(undefined), 'login');
  assert.equal(normalizePurpose('login'), 'login');
  assert.equal(normalizePurpose('medical'), 'medical');
  assert.equal(normalizePurpose('anything'), null);
  assert.equal(sensitiveRequestSchema.safeParse({ purpose: 'passport_document' }).success, true);
  assert.equal(sensitiveRequestSchema.safeParse({ purpose: 'login' }).success, false);
  assert.equal(sensitiveRequestSchema.safeParse({}).success, false);
});
