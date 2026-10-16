const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createEmailOtpService, evaluateAttempt, generateCode, hashCode,
  MAX_ATTEMPTS, LOCKOUT_MS, MAX_SENDS_PER_EMAIL_WINDOW, EMAIL_WINDOW_MS,
} = require('../services/emailOtpService');

// Minimal in-memory RTDB with ref().transaction/update.
function fakeDb() {
  const data = {};
  return {
    data,
    ref: path => ({
      async transaction(fn) {
        const next = fn(path in data ? data[path] : null);
        if (next !== undefined) { if (next === null) delete data[path]; else data[path] = next; }
      },
      async update(values) { data[path] = { ...(data[path] || {}), ...values }; },
    }),
  };
}
function setup() {
  const clock = { now: 1_000_000 };
  const db = fakeDb();
  return { clock, db, svc: createEmailOtpService(db, () => clock.now) };
}

test('generateCode returns six digits', () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^[1-9]\d{5}$/);
});

test('stored record holds a salted hash and never the plain code', async () => {
  const { db, svc } = setup();
  await svc.storeCode('u1', '654321');
  const record = db.data['otp_codes/u1'];
  assert.ok(!JSON.stringify(record).includes('654321'));
  assert.equal(record.digest, hashCode('u1', record.salt, '654321'));
  await svc.storeCode('u1', '654321');
  assert.notEqual(db.data['otp_codes/u1'].salt, record.salt);
});

test('correct code verifies once and is consumed', async () => {
  const { db, svc } = setup();
  await svc.storeCode('u1', '123123');
  assert.equal((await svc.checkCode('u1', '123123')).outcome, 'ok');
  assert.equal('otp_codes/u1' in db.data, false);
  assert.equal((await svc.checkCode('u1', '123123')).outcome, 'not-found');
});

test('five wrong attempts lock out, even for the correct code, then unlock', async () => {
  const { clock, svc } = setup();
  await svc.storeCode('u1', '123123');
  for (let i = 1; i < MAX_ATTEMPTS; i++) {
    const r = await svc.checkCode('u1', '000000');
    assert.equal(r.outcome, 'wrong');
    assert.equal(r.attemptsLeft, MAX_ATTEMPTS - i);
  }
  const locked = await svc.checkCode('u1', '000000');
  assert.equal(locked.outcome, 'locked');
  assert.equal(locked.retryAfterSeconds, LOCKOUT_MS / 1000);
  clock.now += 60_000;
  const still = await svc.checkCode('u1', '123123');
  assert.equal(still.outcome, 'locked');
  assert.equal(still.retryAfterSeconds, LOCKOUT_MS / 1000 - 60);
  clock.now += LOCKOUT_MS;
  assert.equal((await svc.checkCode('u1', '123123')).outcome, 'ok');
});

test('expired code is rejected', async () => {
  const { clock, svc } = setup();
  await svc.storeCode('u1', '123123');
  clock.now += 11 * 60 * 1000;
  assert.equal((await svc.checkCode('u1', '123123')).outcome, 'expired');
});

test('resend is limited to one per cooldown and reports remaining seconds', async () => {
  const { clock, svc } = setup();
  assert.equal((await svc.claimSend('u1', 60000)).ok, true);
  clock.now += 20_000;
  const r = await svc.claimSend('u1', 60000);
  assert.deepEqual([r.ok, r.locked, r.retryAfterSeconds], [false, false, 40]);
  clock.now += 40_000;
  assert.equal((await svc.claimSend('u1', 60000)).ok, true);
});

test('a lockout cannot be bypassed by requesting a new code', async () => {
  const { clock, svc } = setup();
  await svc.storeCode('u1', '123123');
  for (let i = 0; i < MAX_ATTEMPTS; i++) await svc.checkCode('u1', '000000');
  clock.now += 120_000;
  const r = await svc.claimSend('u1', 60000);
  assert.equal(r.ok, false);
  assert.equal(r.locked, true);
  assert.equal(r.retryAfterSeconds, LOCKOUT_MS / 1000 - 120);
});

test('per-email limit allows five sends per hour, case-insensitive, then resets', async () => {
  const { clock, svc } = setup();
  for (let i = 0; i < MAX_SENDS_PER_EMAIL_WINDOW; i++) {
    assert.equal((await svc.countEmailSend(i % 2 ? 'A@x.test' : 'a@x.test')).ok, true);
  }
  clock.now += 10 * 60 * 1000;
  const r = await svc.countEmailSend('a@x.test');
  assert.equal(r.ok, false);
  assert.equal(r.retryAfterSeconds, (EMAIL_WINDOW_MS - 10 * 60 * 1000) / 1000);
  assert.equal((await svc.countEmailSend('other@x.test')).ok, true);
  clock.now += EMAIL_WINDOW_MS;
  assert.equal((await svc.countEmailSend('a@x.test')).ok, true);
});

test('evaluateAttempt treats a record without digest as missing', () => {
  assert.equal(evaluateAttempt({ lastSent: 1 }, 'u', '111111', 2).outcome, 'not-found');
});
