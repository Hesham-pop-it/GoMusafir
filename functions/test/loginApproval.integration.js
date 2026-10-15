// Only demo emulators: real RTDB rules and the real service path, never production.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT;
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!project?.startsWith('demo-') || !databaseHost || !authHost) throw new Error('Demo emulators required');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: project, databaseURL: `http://${databaseHost}?ns=${project}-default-rtdb` });
const db = admin.database();
const { createApproval, answerApproval, isStaff } = require('../services/loginApprovalService');
const base = `http://${databaseHost}`, ns = `${project}-default-rtdb`;

async function main() {
  const users = {};
  for (const name of ['staff', 'other']) {
    const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${name}-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }),
    });
    const { localId: uid, idToken: token } = await r.json();
    assert.ok(uid && token); users[name] = { uid, token };
  }
  const uid = users.staff.uid, now = Date.now();
  await db.ref(`users/${uid}/staff_org_id`).set('o');
  assert.equal(await isStaff(db, uid, undefined), true);
  assert.equal(await isStaff(db, users.other.uid, undefined), false);
  assert.equal(await isStaff(db, users.other.uid, 'manager'), true);

  const raw = async (token, path, method, value) => (await fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(token)}`, {
    method, headers: { 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  })).status;
  let checks = 0;
  const expect = async (who, path, method, status, value) => {
    assert.equal(await raw(users[who].token, path, method, value), status, `${who} ${method} ${path}`); checks++;
  };

  // Request: public node, server-only secret, rate limit.
  const made = await createApproval({ db, uid, browser: '  Chrome on macOS ', authTime: 100, now });
  assert.equal(made.numbers.length, 3); assert.ok(made.numbers.includes(made.number));
  assert.equal(made.expires_at, now + 120000);
  const pub = (await db.ref(`login_approvals/${uid}/${made.id}`).get()).val();
  assert.deepEqual(pub, { created_at: now, expires_at: now + 120000, numbers: made.numbers, status: 'pending', client: { browser: 'Chrome on macOS' } });
  assert.equal((await db.ref(`login_approval_secrets/${uid}/${made.id}/correct`).get()).val(), made.number);
  await assert.rejects(createApproval({ db, uid, browser: 'x', authTime: 100, now: now + 500 }), { code: 'resource-exhausted' });

  // Rules.
  await expect('staff', `login_approvals/${uid}/${made.id}/status`, 'GET', 200);
  await expect('staff', `login_approvals/${uid}`, 'GET', 200);
  await expect('other', `login_approvals/${uid}/${made.id}/status`, 'GET', 401);
  await expect('staff', `login_approvals/${uid}/${made.id}/status`, 'PUT', 401, 'approved');
  await expect('staff', `login_approvals/${uid}/${made.id}`, 'PUT', 401, { status: 'approved' });
  await expect('staff', `login_approvals/${uid}/new`, 'PUT', 401, { status: 'approved' });
  await expect('staff', `login_approval_secrets/${uid}/${made.id}/correct`, 'GET', 401);
  await expect('staff', `login_approval_secrets/${uid}`, 'GET', 401);
  await expect('staff', `login_approval_secrets/${uid}/${made.id}/correct`, 'PUT', 401, 1);
  await expect('other', `login_approval_secrets/${uid}/${made.id}`, 'GET', 401);

  // A revoked session cannot read.
  await db.ref(`app_access/${uid}/revoked_before`).set(4102444800);
  await expect('staff', `login_approvals/${uid}/${made.id}/status`, 'GET', 401);
  await db.ref(`app_access/${uid}`).remove();

  // Answer: the exact requesting sign-in is refused (a second browser sign-in is not detectable, see the service comment), wrong number denies, correct approves once.
  await assert.rejects(answerApproval({ db, uid, id: made.id, number: made.number, authTime: 100, now }), { code: 'permission-denied' });
  assert.equal((await db.ref(`login_approvals/${uid}/${made.id}/status`).get()).val(), 'pending');
  const wrong = made.numbers.find(n => n !== made.number);
  assert.deepEqual(await answerApproval({ db, uid, id: made.id, number: wrong, authTime: 200, now: now + 1000 }), { status: 'denied' });
  assert.deepEqual(await answerApproval({ db, uid, id: made.id, number: made.number, authTime: 200, now: now + 2000 }), { status: 'denied' });

  const second = await createApproval({ db, uid, browser: 'Safari', authTime: 100, now: now + 20000 });
  const racers = await Promise.all([
    answerApproval({ db, uid, id: second.id, number: second.number, authTime: 200, now: now + 21000 }),
    answerApproval({ db, uid, id: second.id, deny: true, authTime: 200, now: now + 21000 }),
    answerApproval({ db, uid, id: second.id, number: second.number, authTime: 200, now: now + 21000 }),
  ]);
  const final = (await db.ref(`login_approvals/${uid}/${second.id}/status`).get()).val();
  assert.ok(['approved', 'denied'].includes(final));
  assert.ok(racers.every(r => r.status === final), `all callers see the one winning answer: ${JSON.stringify(racers)} vs ${final}`);

  const third = await createApproval({ db, uid, browser: 'Firefox', authTime: 100, now: now + 40000 });
  assert.deepEqual(await answerApproval({ db, uid, id: third.id, number: third.number, authTime: 200, now: now + 41000 }), { status: 'approved' });
  assert.equal(typeof (await db.ref(`login_approvals/${uid}/${third.id}/answered_at`).get()).val(), 'number');
  assert.deepEqual(await answerApproval({ db, uid, id: third.id, deny: true, authTime: 200, now: now + 42000 }), { status: 'approved' });

  const fourth = await createApproval({ db, uid, browser: 'Edge', authTime: 100, now: now + 60000 });
  assert.deepEqual(await answerApproval({ db, uid, id: fourth.id, number: fourth.number, authTime: 200, now: now + 60000 + 120001 }), { status: 'expired' });
  await assert.rejects(answerApproval({ db, uid, id: 'missing', number: 11, authTime: 200, now }), { code: 'not-found' });

  // Answering an approval deleted mid-flight must not recreate it.
  const gone = await createApproval({ db, uid, browser: 'Gone', authTime: 100, now: now + 200000 });
  await db.ref(`login_approvals/${uid}/${gone.id}`).remove();
  await assert.rejects(answerApproval({ db, uid, id: gone.id, number: gone.number, authTime: 200, now: now + 200001 }), { code: 'not-found' });
  assert.equal((await db.ref(`login_approvals/${uid}/${gone.id}`).get()).exists(), false);

  // The callable reports whether a push was actually sent.
  const endpoint = (push) => {
    const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
    const file = path.join(__dirname, '../groups/loginApprovalFunctions.js');
    const localRequire = require('node:module').createRequire(file);
    const overrides = {
      '../middleware/participantAccessMiddleware': { onCall: (_, handler) => handler },
      '../services/notificationService': { sendPushNotification: push },
    };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports,
      require: id => overrides[id] || localRequire(id), process: { env: { FUNCTIONS_EMULATOR: 'true' } }, console, Date });
    return module.exports.requestLoginApproval;
  };
  const call = (push) => endpoint(push)({ app: {}, auth: { uid, token: { auth_time: 100 } }, data: { browser: 'Opera' } });
  await db.ref(`login_approval_secrets/${uid}/last_request`).remove();
  const noToken = await call(async () => undefined);
  assert.equal(noToken.pushed, false);
  assert.ok(noToken.id && noToken.number && noToken.numbers.length === 3 && noToken.expires_at);
  await new Promise(r => setTimeout(r, 1100));
  assert.equal((await call(async () => 'projects/x/messages/1')).pushed, true);
  checks += 2;

  // Stale entries are cleaned on the next request.
  const later = await createApproval({ db, uid, browser: 'Brave', authTime: 100, now: now + 60000 + 11 * 60000 });
  const left = Object.keys((await db.ref(`login_approvals/${uid}`).get()).val());
  assert.deepEqual(left, [later.id]);
  assert.deepEqual(Object.keys((await db.ref(`login_approval_secrets/${uid}`).get()).val()).sort(), ['last_request', later.id].sort());
  console.log(`PASS: login approval rules (${checks} checks) and flow (request, rate limit, wrong, single answer, expiry, cleanup).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => admin.app().delete());
