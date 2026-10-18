const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const { mockAuthenticator } = require('./fixtures/mockAuthenticator');

// A tiny in-memory database: get, set and transaction on slash paths, which is all the passkey service uses.
function fakeDb() {
  const tree = {};
  const walk = (path, create) => path.split('/').reduce((n, k) => (n == null ? n : (n[k] === undefined && create ? (n[k] = {}) : n[k])), tree);
  const read = path => { const v = walk(path); return v === undefined ? null : JSON.parse(JSON.stringify(v)); };
  const write = (path, value) => {
    const keys = path.split('/'), last = keys.pop();
    const parent = keys.length ? walk(keys.join('/'), true) : tree;
    if (value === null) delete parent[last]; else parent[last] = JSON.parse(JSON.stringify(value));
  };
  const ref = path => ({
    get: async () => ({ val: () => read(path) }),
    set: async value => write(path, value),
    child: key => ref(`${path}/${key}`),
    transaction: async fn => { const next = fn(read(path)); if (next !== undefined) write(path, next); return { committed: next !== undefined }; },
  });
  return { db: { ref }, read, write };
}
function load(env = {}) {
  const f = fakeDb();
  const original = Module._load;
  Module._load = function (request, ...rest) {
    if (request === '../../admin') return { db: f.db };
    return original.call(this, request, ...rest);
  };
  delete require.cache[require.resolve('../services/passport/passportPasskeys')];
  const mod = require('../services/passport/passportPasskeys');
  Module._load = original;
  Object.assign(process.env, { FUNCTIONS_EMULATOR: 'true', PASSKEY_RP_ID: 'join.gomusafir.app', PASSKEY_ORIGINS: 'https://join.gomusafir.app,http://localhost:3100', ...env });
  return { ...mod, ...f };
}
const RP = 'join.gomusafir.app', ORIGIN = 'https://join.gomusafir.app';
const person = { trip: 'trip1', uid: 'u1', name: 'a@example.test' };
const rejects = (promise, reason) => assert.rejects(promise, e => e.details?.reason === reason, reason);

test('config: env wins, defaults only in the emulator, otherwise it refuses', () => {
  const { config } = load();
  assert.deepEqual(config({ FUNCTIONS_EMULATOR: 'true' }), { rpID: 'join.gomusafir.app', origins: ['https://join.gomusafir.app', 'http://localhost:3100'] });
  assert.deepEqual(config({ PASSKEY_RP_ID: 'x.test', PASSKEY_ORIGINS: 'https://x.test, https://y.test' }), { rpID: 'x.test', origins: ['https://x.test', 'https://y.test'] });
  assert.throws(() => config({}), e => e.details?.reason === 'not_configured');
});

test('registration options require user verification, use an opaque handle and are stored as a 5 minute challenge', async () => {
  const s = load();
  const options = await s.registerOptions(person, 1000);
  assert.equal(options.rp.id, RP);
  assert.equal(options.authenticatorSelection.userVerification, 'required');
  assert.equal(options.authenticatorSelection.residentKey, 'preferred');
  assert.ok(!options.user.id.includes('u1') && !Buffer.from(options.user.id, 'base64url').toString().includes('u1'));
  const stored = s.read(`passport_passkey_challenges/${crypto.createHash('sha256').update(options.challenge).digest('hex')}`);
  assert.deepEqual(stored, { kind: 'register', trip_id: 'trip1', uid: 'u1', expires_at: 1000 + 300000 });
});

test('a registered passkey is stored, then logs in; the counter must grow and a challenge works once', async () => {
  const s = load();
  const key = mockAuthenticator({ rpId: RP, origin: ORIGIN });
  const regOptions = await s.registerOptions(person, 1000);
  const id = await s.register({ ...person, response: key.create(regOptions) }, 2000);
  assert.equal(id, key.id);
  assert.equal(await s.hasPasskey('trip1', 'u1'), true);
  assert.equal(await s.hasPasskey('trip1', 'u2'), false);
  const stored = s.read(`passport_passkeys/trip1/u1/${key.id}`);
  assert.ok(stored.public_key && stored.counter === 0 && stored.created_at === 2000);

  const options = await s.loginOptions(person, 3000);
  assert.equal(options.userVerification, 'required');
  assert.deepEqual(options.allowCredentials.map(c => c.id), [key.id]);
  const answer = key.get(options);
  assert.equal(await s.login({ ...person, response: answer }, 4000), key.id);
  assert.equal(s.read(`passport_passkeys/trip1/u1/${key.id}`).counter, 1);
  assert.equal(s.read(`passport_passkeys/trip1/u1/${key.id}`).last_used_at, 4000);
  await rejects(s.login({ ...person, response: answer }, 4001), 'challenge_invalid'); // replay of the same answer

  const again = await s.loginOptions(person, 5000);
  await s.login({ ...person, response: key.get(again) }, 5001);
  assert.equal(s.read(`passport_passkeys/trip1/u1/${key.id}`).counter, 2);
});

test('a stale counter is refused (cloned authenticator)', async () => {
  const s = load();
  const key = mockAuthenticator({ rpId: RP, origin: ORIGIN, counter: 10 });
  await s.register({ ...person, response: key.create(await s.registerOptions(person, 1000)) }, 1000);
  assert.equal(s.read(`passport_passkeys/trip1/u1/${key.id}`).counter, 10);
  await s.login({ ...person, response: key.get(await s.loginOptions(person, 2000)) }, 2000);
  await rejects(s.login({ ...person, response: key.get(await s.loginOptions(person, 3000), { bump: -3 }) }, 3000), 'verification_failed');
  assert.equal(s.read(`passport_passkeys/trip1/u1/${key.id}`).counter, 11);
});

test('a counter that stays 0 (synced passkeys) is accepted', async () => {
  const s = load();
  const key = mockAuthenticator({ rpId: RP, origin: ORIGIN });
  await s.register({ ...person, response: key.create(await s.registerOptions(person, 1000)) }, 1000);
  await s.login({ ...person, response: key.get(await s.loginOptions(person, 2000), { bump: 0 }) }, 2000);
  await s.login({ ...person, response: key.get(await s.loginOptions(person, 3000), { bump: 0 }) }, 3000);
});

test('challenges expire after 5 minutes and cannot be used for another purpose or another person', async () => {
  const s = load();
  const key = mockAuthenticator({ rpId: RP, origin: ORIGIN });
  const regOptions = await s.registerOptions(person, 1000);
  await rejects(s.register({ ...person, response: key.create(regOptions) }, 1000 + 300000), 'challenge_invalid');
  const second = await s.registerOptions(person, 1000);
  await rejects(s.register({ ...person, uid: 'u2', response: key.create(second) }, 2000), 'challenge_invalid');
  await rejects(s.register({ ...person, response: key.create(second) }, 2000), 'challenge_invalid'); // the wrong person used it up
  const third = await s.registerOptions(person, 1000);
  await s.register({ ...person, response: key.create(third) }, 2000);
  const loginOptions = await s.loginOptions(person, 3000);
  await rejects(s.register({ ...person, response: mockAuthenticator({ rpId: RP, origin: ORIGIN }).create(loginOptions) }, 3001), 'challenge_invalid');
});

test('wrong origin, wrong rp id and missing user verification are refused', async () => {
  const s = load();
  const bad = [
    [mockAuthenticator({ rpId: RP, origin: ORIGIN }), { originOverride: 'https://evil.test' }],
    [mockAuthenticator({ rpId: RP, origin: ORIGIN }), { rpIdOverride: 'evil.test' }],
    [mockAuthenticator({ rpId: RP, origin: ORIGIN, userVerified: false }), {}],
  ];
  for (const [key, extra] of bad) await rejects(s.register({ ...person, response: key.create(await s.registerOptions(person, 1000), extra) }, 1000), 'verification_failed');
  assert.equal(await s.hasPasskey('trip1', 'u1'), false);
  const key = mockAuthenticator({ rpId: RP, origin: ORIGIN });
  await s.register({ ...person, response: key.create(await s.registerOptions(person, 1000)) }, 1000);
  await rejects(s.login({ ...person, response: key.get(await s.loginOptions(person, 2000), { originOverride: 'https://evil.test' }) }, 2000), 'verification_failed');
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  await rejects(s.login({ ...person, response: key.get(await s.loginOptions(person, 3000), { signWith: other }) }, 3000), 'verification_failed');
});

test('a credential of another person cannot log in, and a person without one gets no options', async () => {
  const s = load();
  await rejects(s.loginOptions(person, 1000), 'no_passkey');
  const key = mockAuthenticator({ rpId: RP, origin: ORIGIN });
  await s.register({ ...person, response: key.create(await s.registerOptions(person, 1000)) }, 1000);
  const other = { trip: 'trip1', uid: 'u2', name: 'b@example.test' };
  const key2 = mockAuthenticator({ rpId: RP, origin: ORIGIN });
  await s.register({ ...other, response: key2.create(await s.registerOptions(other, 1000)) }, 1000);
  await rejects(s.login({ ...person, response: key2.get(await s.loginOptions(person, 2000)) }, 2000), 'verification_failed');
});

test('at most 5 passkeys per person; the same one cannot be added twice', async () => {
  const s = load();
  for (let i = 0; i < 5; i++) {
    const key = mockAuthenticator({ rpId: RP, origin: ORIGIN });
    await s.register({ ...person, response: key.create(await s.registerOptions(person, 1000)) }, 1000);
  }
  await rejects(s.registerOptions(person, 1000), 'passkey_limit');
  const s2 = load();
  const key = mockAuthenticator({ rpId: RP, origin: ORIGIN });
  await s2.register({ ...person, response: key.create(await s2.registerOptions(person, 1000)) }, 1000);
  await rejects(s2.register({ ...person, response: key.create(await s2.registerOptions(person, 1000)) }, 1000), 'passkey_exists');
});

test('malformed answers are refused before anything is looked up', async () => {
  const s = load();
  await rejects(s.register({ ...person, response: null }), 'response_invalid');
  await rejects(s.login({ ...person, response: { id: 'x', response: { clientDataJSON: '!!' } } }), 'challenge_invalid');
});
