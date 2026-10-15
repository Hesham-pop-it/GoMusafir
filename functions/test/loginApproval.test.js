const test = require('node:test');
const assert = require('node:assert/strict');
const { generateChallenge, sanitizeBrowser, evaluateAnswer } = require('../services/loginApprovalService');

const now = 1_800_000_000_000;
const approval = (over = {}) => ({ created_at: now - 1000, expires_at: now + 60000, status: 'pending', numbers: [12, 34, 56], ...over });
const secret = (over = {}) => ({ correct: 34, requester_auth_time: 100, ...over });
const ask = (over = {}) => evaluateAnswer({ approval: approval(), secret: secret(), callerAuthTime: 200, number: 34, now, ...over });

test('challenges hold three distinct 2-digit numbers and the correct one is among them', () => {
  for (let i = 0; i < 2000; i++) {
    const { numbers, correct } = generateChallenge();
    assert.equal(numbers.length, 3);
    assert.equal(new Set(numbers).size, 3);
    assert.ok(numbers.every(n => Number.isInteger(n) && n >= 10 && n <= 99));
    assert.ok(numbers.includes(correct));
  }
});

test('challenge generation stays distinct even when the random source repeats', () => {
  const seq = [20, 20, 20, 21, 20, 22, 2];
  let i = 0;
  const { numbers, correct } = generateChallenge(() => seq[i++]);
  assert.deepEqual(numbers, [20, 21, 22]);
  assert.equal(correct, 22);
});

test('the matching number approves, a wrong number or deny denies', () => {
  assert.equal(ask(), 'approved');
  assert.equal(ask({ number: 12 }), 'denied');
  assert.equal(ask({ number: '34' }), 'approved');
  assert.equal(ask({ number: 34.5 }), 'denied');
  assert.equal(ask({ number: undefined }), 'denied');
  assert.equal(ask({ deny: true, number: 34 }), 'denied');
});

test('answers after the expiry are expired, at the expiry they still count', () => {
  assert.equal(ask({ now: now + 60000 }), 'approved');
  assert.equal(ask({ now: now + 60001 }), 'expired');
  assert.equal(ask({ now: now + 60001, deny: true }), 'expired');
  assert.equal(ask({ approval: approval({ expires_at: undefined }) }), 'expired');
});

test('only one answer is possible', () => {
  for (const status of ['approved', 'denied', 'expired']) {
    assert.equal(ask({ approval: approval({ status }) }), 'answered');
  }
});

test('the requesting session cannot answer for itself', () => {
  assert.equal(ask({ callerAuthTime: 100 }), 'same_session');
});

test('missing records are not found', () => {
  assert.equal(ask({ approval: null }), 'not_found');
  assert.equal(ask({ secret: null }), 'not_found');
});

test('browser labels are trimmed, stripped of control characters and capped', () => {
  assert.equal(sanitizeBrowser('  Chrome   on\nmacOS '), 'Chrome on macOS');
  assert.equal(sanitizeBrowser('<b>Evil</b>'), 'b Evil /b');
  assert.equal(sanitizeBrowser('x'.repeat(200)).length, 80);
  for (const bad of [undefined, null, 5, {}, '   ', '\u0000']) assert.equal(sanitizeBrowser(bad), 'Web browser');
});
