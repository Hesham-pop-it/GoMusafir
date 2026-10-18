const test = require('node:test');
const assert = require('node:assert/strict');
const { approvalView, formatCountdown, isLoginApprovalPayload } = require('../src/utils/loginApproval');

const now = 1_800_000_000_000;
const node = (over = {}) => ({ status: 'pending', expires_at: now + 90000, numbers: [11, 22, 33], ...over });

test('a pending request shows the seconds left', () => {
  assert.deepEqual(approvalView(node(), now), { state: 'pending', secondsLeft: 90 });
  assert.equal(approvalView(node({ expires_at: now + 1 }), now).secondsLeft, 1);
});

test('a pending request past its expiry shows as expired', () => {
  assert.equal(approvalView(node({ expires_at: now }), now).state, 'expired');
  assert.equal(approvalView(node({ expires_at: now - 5000 }), now).state, 'expired');
  assert.equal(approvalView(node({ expires_at: undefined }), now).state, 'expired');
});

test('final statuses win over the clock', () => {
  for (const status of ['approved', 'denied', 'expired']) {
    assert.equal(approvalView(node({ status, expires_at: now - 1 }), now).state, status);
  }
});

test('missing or unknown nodes are missing', () => {
  for (const bad of [null, undefined, 'x', {}, node({ status: 'weird' })]) assert.equal(approvalView(bad, now).state, 'missing');
});

test('countdown is m:ss', () => {
  assert.equal(formatCountdown(120), '2:00');
  assert.equal(formatCountdown(65), '1:05');
  assert.equal(formatCountdown(9), '0:09');
  assert.equal(formatCountdown(-3), '0:00');
  assert.equal(formatCountdown(undefined), '0:00');
});

test('only login approval pushes with an id are recognised', () => {
  assert.equal(isLoginApprovalPayload({ type: 'login_approval', id: 'abc' }), true);
  assert.equal(isLoginApprovalPayload({ data: { type: 'login_approval', id: 'abc' } }), true);
  assert.equal(isLoginApprovalPayload({ type: 'login_approval' }), false);
  assert.equal(isLoginApprovalPayload({ type: 'chat', id: 'abc' }), false);
  assert.equal(isLoginApprovalPayload(null), false);
});
