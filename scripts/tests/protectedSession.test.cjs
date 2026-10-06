const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../src/utils/protectedSession.js'), 'utf8');
const create = vm.runInNewContext(source.replace('export function', 'function') + '\ncreateProtectedSessionValidator');
function fixture() {
    const calls = [];
    const user = { emailVerified: true, getIdTokenResult: async force => { calls.push(['refresh', force]); return { claims: {}, expirationTime: new Date(Date.now() + 3600000).toISOString() }; } };
    const auth = { currentUser: user, authStateReady: async () => {} };
    const deps = { auth, readMfaLock: async () => null,
        fetchAccess: async () => { calls.push(['server']); return { staff: true }; },
        signOut: async () => { calls.push(['signOut']); auth.currentUser = null; },
        isDenied: error => ['auth/user-token-expired', 'functions/unauthenticated'].includes(error.code) };
    return { auth, user, calls, deps, build: () => create(deps) };
}
test('logged-in widget entry forces fresh credentials and server validation on every entry', async () => {
    const f = fixture(); const session = f.build();
    assert.equal(await session.validate(), true);
    assert.equal(await session.validate(), true);
    assert.deepEqual(f.calls, [['refresh', true], ['server'], ['refresh', true], ['server']]);
});
test('logged-out widget cannot use cached state or call protected services', async () => {
    const f = fixture(); f.auth.currentUser = null;
    assert.equal(await f.build().validate(), false);
    assert.deepEqual(f.calls, []);
});
test('cold launch waits for Firebase persistence restoration', async () => {
    const f = fixture(); f.auth.currentUser = null;
    f.auth.authStateReady = async () => { f.auth.currentUser = f.user; };
    assert.equal(await f.build().validate(), true);
});
test('expired refresh credentials deny entry and sign out', async () => {
    const f = fixture(); f.user.getIdTokenResult = async () => { throw { code: 'auth/user-token-expired' }; };
    assert.equal(await f.build().validate(), false);
    assert.equal(f.auth.currentUser, null);
    assert.deepEqual(f.calls, [['signOut']]);
});
test('revoked server session denies entry even when local token refresh succeeds', async () => {
    const f = fixture(); f.deps.fetchAccess = async () => { throw { code: 'functions/unauthenticated' }; };
    assert.equal(await f.build().validate(), false);
    assert.equal(f.auth.currentUser, null);
});
test('expired participant access denies entry; active participant access succeeds', async () => {
    const f = fixture(); const now = Date.now();
    f.deps.fetchAccess = async () => ({ staff: false, expires_at: now - 1, server_now: now });
    assert.equal(await f.build().validate(), false);
    f.deps.fetchAccess = async () => ({ staff: false, expires_at: now + 60000, server_now: now });
    assert.equal(await f.build().validate(), true);
});
test('offline validation fails closed without discarding credentials', async () => {
    const f = fixture(); f.deps.fetchAccess = async () => { throw { code: 'functions/unavailable' }; };
    assert.equal(await f.build().validate(), false);
    assert.equal(f.auth.currentUser, f.user);
});
test('logout invalidates a pending admission and blocks re-entry before async cleanup finishes', async () => {
    const f = fixture(); let finish;
    f.deps.fetchAccess = () => new Promise(resolve => { finish = resolve; });
    const session = f.build(); const pending = session.validate();
    while (!finish) await Promise.resolve();
    session.invalidate(); finish({ staff: true });
    assert.equal(await pending, false);
    assert.equal(await session.validate(), false);
});
test('account change during validation cannot admit or sign out the new user', async () => {
    const f = fixture(); const replacement = { ...f.user };
    f.deps.fetchAccess = async () => { f.auth.currentUser = replacement; throw { code: 'functions/unauthenticated' }; };
    assert.equal(await f.build().validate(), false);
    assert.equal(f.auth.currentUser, replacement);
});
test('unverified users and MFA-locked users cannot enter protected screens', async () => {
    const f = fixture(); f.user.emailVerified = false;
    assert.equal(await f.build().validate(), false);
    f.user.emailVerified = true; f.deps.readMfaLock = async () => 'pending';
    assert.equal(await f.build().validate(), false);
    assert.equal(f.calls.some(([name]) => name === 'server'), false);
});

test('internal screen changes reuse admission without more token or server requests', async () => {
    const f = fixture(); const session = f.build();
    assert.equal(session.hasAdmission(), false);
    await session.validate();
    for (let screen = 0; screen < 5; screen++) assert.equal(session.hasAdmission(), true);
    assert.deepEqual(f.calls, [['refresh', true], ['server']]);
});
test('backgrounding, logout and account replacement discard screen admission', async () => {
    const f = fixture(); const session = f.build();
    await session.validate(); session.clearAdmission();
    assert.equal(session.hasAdmission(), false);
    await session.validate(); f.auth.currentUser = { ...f.user };
    assert.equal(session.hasAdmission(), false);
    f.auth.currentUser = f.user;
    session.invalidate(); assert.equal(session.hasAdmission(), false);
});
test('backgrounding while validation is pending cannot create a reusable admission', async () => {
    const f = fixture(); let finish;
    f.deps.fetchAccess = () => new Promise(resolve => { finish = resolve; });
    const session = f.build(); const pending = session.validate();
    while (!finish) await Promise.resolve();
    session.clearAdmission(); finish({ staff: true });
    assert.equal(await pending, false); assert.equal(session.hasAdmission(), false);
});
test('expired tokens never create reusable admission', async () => {
    const f = fixture();
    f.user.getIdTokenResult = async () => ({ claims: {}, expirationTime: new Date(Date.now() - 1).toISOString() });
    const session = f.build(); await session.validate();
    assert.equal(session.hasAdmission(), false);
});
test('failed fresh Widget validation discards an existing screen admission', async () => {
    const f = fixture(); let revoked = false;
    f.deps.fetchAccess = async () => { if (revoked) throw { code: 'functions/unauthenticated' }; return { staff: true }; };
    const session = f.build(); await session.validate(); assert.equal(session.hasAdmission(), true);
    revoked = true; assert.equal(await session.validate(), false); assert.equal(session.hasAdmission(), false);
});
