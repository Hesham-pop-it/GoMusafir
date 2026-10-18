// Only demo emulators: real RTDB rules, real services, the callables with the middleware stubbed.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT;
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!project?.startsWith('demo-') || !databaseHost || !authHost) throw new Error('Demo emulators required');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: project, databaseURL: `http://${databaseHost}?ns=${project}-default-rtdb` });
const db = admin.database();
const { createApproval, answerApproval } = require('../services/loginApprovalService');
const { freshUntil, requireFreshApproval, FRESH_MS } = require('../services/sensitiveApprovalService');
const base = `http://${databaseHost}`, ns = `${project}-default-rtdb`;

function load(file, overrides, env = { FUNCTIONS_EMULATOR: 'true' }) {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const full = path.join(__dirname, '../groups', file);
  const localRequire = require('node:module').createRequire(full);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), { module, exports: module.exports,
    require: id => overrides[id] || localRequire(id), process: { env }, console, Date, setTimeout, Buffer });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const stub = { '../middleware/participantAccessMiddleware': { onCall: (_, handler) => handler } };

async function main() {
  const signUp = async (name) => {
    const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${name}-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }),
    });
    const { localId: uid, idToken: token } = await r.json(); assert.ok(uid && token); return { uid, token };
  };
  const staff = await signUp('staff'), other = await signUp('other');
  const uid = staff.uid, now = Date.now();
  await db.ref(`users/${uid}/staff_org_id`).set('org1');
  let checks = 0;

  // Nobody has approved yet.
  assert.equal(await freshUntil(db, uid, { now }), null);
  await assert.rejects(requireFreshApproval(db, uid, { now }), { code: 'failed-precondition' });

  // A login approval counts as a recent approval.
  const login = await createApproval({ db, uid, browser: 'Chrome', authTime: 100, now });
  assert.equal((await db.ref(`login_approvals/${uid}/${login.id}/purpose`).get()).val(), 'login');
  assert.deepEqual(await answerApproval({ db, uid, id: login.id, number: login.number, authTime: 200, now: now + 1000 }), { status: 'approved' });
  assert.equal(await freshUntil(db, uid, { now: now + 2000 }), now + 1000 + FRESH_MS);
  await requireFreshApproval(db, uid, { now: now + 14 * 60000 });
  await assert.rejects(requireFreshApproval(db, uid, { now: now + 1000 + FRESH_MS }), { code: 'failed-precondition' });
  checks += 4;

  // A denied or wrong answer does not move the stamp.
  const denied = await createApproval({ db, uid, browser: 'Safari', authTime: 100, purpose: 'medical', now: now + 20000 });
  assert.deepEqual(await answerApproval({ db, uid, id: denied.id, deny: true, authTime: 200, now: now + 21000 }), { status: 'denied' });
  assert.equal(await freshUntil(db, uid, { now: now + 22000 }), now + 1000 + FRESH_MS);

  // A purpose approval stamps and keeps its purpose, and an older answer never moves the stamp back.
  const med = await createApproval({ db, uid, browser: 'Firefox', authTime: 100, purpose: 'passport_document', now: now + 40000 });
  assert.equal((await db.ref(`login_approvals/${uid}/${med.id}/purpose`).get()).val(), 'passport_document');
  assert.deepEqual(await answerApproval({ db, uid, id: med.id, number: med.number, authTime: 200, now: now + 41000 }), { status: 'approved' });
  assert.equal(await freshUntil(db, uid, { now: now + 42000 }), now + 41000 + FRESH_MS);
  assert.equal((await db.ref(`sensitive_approval_state/${uid}/purpose`).get()).val(), 'passport_document');
  const { markApproved } = require('../services/sensitiveApprovalService');
  await markApproved(db, uid, { now: now + 5000 });
  assert.equal((await db.ref(`sensitive_approval_state/${uid}/last_approved_at`).get()).val(), now + 41000);
  checks += 5;

  // Rules: the stamp node is server only.
  const raw = async (token, path, method, value) => (await fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(token)}`, {
    method, headers: { 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })).status;
  assert.equal(await raw(staff.token, `sensitive_approval_state/${uid}`, 'GET'), 401);
  assert.equal(await raw(staff.token, `sensitive_approval_state/${uid}/last_approved_at`, 'PUT', 4102444800000), 401);
  assert.equal(await raw(other.token, `sensitive_approval_state/${uid}`, 'GET'), 401);
  checks += 3;

  // Callables.
  const pushes = [];
  const audits = [];
  const loginFns = load('loginApprovalFunctions.js', { ...stub,
    '../services/notificationService': { sendPushNotification: async (...a) => { pushes.push(a); } },
    '../services/auditService': { writeAuditLog: async (org, entry) => { audits.push({ org, ...entry }); } } });
  const req = (data, over = {}) => ({ app: {}, auth: { uid, token: { auth_time: 100, ...over } }, data });
  await db.ref(`login_approval_secrets/${uid}/last_request`).remove();
  await db.ref(`sensitive_approval_state/${uid}`).remove();

  assert.deepEqual(plain(await loginFns.sensitiveStatus(req({}))), { fresh_until: null, fresh: false });
  await assert.rejects(loginFns.sensitiveStatus({ app: {}, auth: { uid: other.uid, token: {} }, data: {} }), { code: 'permission-denied' });
  await assert.rejects(loginFns.requestSensitiveApproval(req({ purpose: 'login' })), { code: 'invalid-argument' });
  await assert.rejects(loginFns.requestSensitiveApproval(req({})), { code: 'invalid-argument' });
  await assert.rejects(loginFns.requestSensitiveApproval({ app: {}, auth: { uid: other.uid, token: {} }, data: { purpose: 'medical' } }), { code: 'permission-denied' });

  const asked = await loginFns.requestSensitiveApproval(req({ purpose: 'medical', browser: 'Edge' }));
  assert.ok(asked.id && asked.number && asked.numbers.length === 3 && asked.expires_at);
  assert.equal(asked.pushed, false);
  assert.equal(pushes[0][3].purpose, 'medical');
  assert.equal((await db.ref(`login_approvals/${uid}/${asked.id}/purpose`).get()).val(), 'medical');
  assert.deepEqual(audits.map(a => [a.org, a.action, a.byUid, a.extra.purpose]), [['org1', 'SENSITIVE_APPROVAL_REQUESTED', uid, 'medical']]);

  // Answering through the callable: grants, audits, does not touch the account's login state.
  const answered = await loginFns.answerLoginApproval({ app: {}, auth: { uid, token: { auth_time: 200 } }, data: { id: asked.id, number: asked.number } });
  assert.deepEqual(plain(answered), { status: 'approved' });
  assert.equal(audits[1].action, 'SENSITIVE_APPROVAL_GRANTED');
  assert.equal(audits[1].extra.method, 'phone');
  const status = await loginFns.sensitiveStatus(req({}));
  assert.equal(status.fresh, true);
  assert.ok(status.fresh_until > Date.now() + 14 * 60000 && status.fresh_until <= Date.now() + FRESH_MS);
  checks += 14;

  // A denied purpose answer is audited too.
  await new Promise(r => setTimeout(r, 1100));
  const again = await loginFns.requestSensitiveApproval(req({ purpose: 'passport_number' }));
  await loginFns.answerLoginApproval({ app: {}, auth: { uid, token: { auth_time: 200 } }, data: { id: again.id, deny: true } });
  assert.equal(audits.at(-1).action, 'SENSITIVE_APPROVAL_DENIED');
  checks++;

  // Email-code fallback counts as an approval for the same purposes.
  const authFns = load('authFunctions.js', { ...stub,
    '../services/auditService': { writeAuditLog: async (org, entry) => { audits.push({ org, ...entry }); } },
    '../services/emailService': { sendEmail: async () => {} },
    '../services/notificationService': { sendPushNotification: async () => {} } });
  await db.ref(`sensitive_approval_state/${uid}`).remove();
  await db.ref(`otp_codes/${uid}`).set({ code: '424242', expiresAt: Date.now() + 60000 });
  await assert.rejects(authFns.verifyCustomEmailOTP({ app: {}, auth: { uid, token: { email: 'a@b.test' } }, data: { otp: '000000', purpose: 'medical' } }), { code: 'permission-denied' });
  assert.equal(await freshUntil(db, uid), null);
  assert.deepEqual(plain(await authFns.verifyCustomEmailOTP({ app: {}, auth: { uid, token: { email: 'a@b.test' } }, data: { otp: '424242', purpose: 'medical' } })), { verified: true });
  assert.ok(await freshUntil(db, uid));
  assert.equal((await db.ref(`sensitive_approval_state/${uid}/method`).get()).val(), 'email_code');
  assert.equal(audits.at(-1).extra.method, 'email_code');
  checks += 4;
  console.log(`PASS: sensitive approval (${checks} checks): login counts, purposes, 15 minute window, stamp is server only, callables, audit, email fallback.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => admin.app().delete());
