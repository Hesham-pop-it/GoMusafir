const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the screen's actual login handler with Firebase and navigation fakes.
function fixture({ otpError, pendingError, send } = {}) {
    const source = fs.readFileSync(path.join(__dirname, '../../src/screens/auth/BusinessLoginScreen.js'), 'utf8');
    const handler = source.slice(source.indexOf('    const handleLogin ='), source.indexOf('    // Eye SVG'));
    const routes = [], alerts = [], storage = new Map();
    let sends = 0, signouts = 0;
    const user = { uid: 'staff', emailVerified: true, getIdTokenResult: async () => ({ claims: { role: 'admin' } }) };
    const auth = { currentUser: user };
    const context = {
        isFormValid: true, loginInFlight: { current: false }, setIsLoading() {},
        email: 'staff@example.com', password: 'password', auth, database: {}, functions: {},
        AsyncStorage: { setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) },
        signInWithEmailAndPassword: async () => ({ user }),
        signOut: async () => { signouts++; auth.currentUser = null; },
        ref: (_, key) => key, get: async () => ({ val: () => ({ staff_org_id: 'org' }) }),
        set: async () => { if (pendingError) throw pendingError; },
        httpsCallable: (_, name) => async () => {
            if (name === 'checkUserExistence') return { data: { exists: true, isStaff: true } };
            sends++;
            if (send) await send();
            if (otpError) throw otpError;
            return { data: { success: true } };
        },
        navigation: { navigate: (...args) => routes.push(args) },
        Alert: { alert: (...args) => alerts.push(args) }, console: { log() {}, warn() {} },
    };
    vm.createContext(context);
    vm.runInContext(handler + '\nglobalThis.login = handleLogin;', context);
    return { login: context.login, routes, alerts, storage, sends: () => sends, signouts: () => signouts };
}

for (const code of [null, 'functions/resource-exhausted', 'functions/deadline-exceeded', 'functions/unavailable', 'functions/internal', 'functions/unknown']) {
    test(`OTP screen remains available after ${code || 'successful delivery'}`, async () => {
        const f = fixture({ otpError: code ? { code } : undefined });
        await f.login();
        assert.equal(f.routes.length, 1);
        assert.equal(f.routes[0][0], 'BusinessVerification');
        assert.equal(f.routes[0][1].isExistingUser, true);
        assert.equal(f.routes[0][1].resendDelay, 60);
        assert.equal(f.storage.get('mfa_lock'), 'true');
        assert.equal(f.signouts(), 0);
        assert.equal(f.alerts.length, 0);
    });
}

for (const code of ['functions/unauthenticated', 'functions/permission-denied', 'functions/invalid-argument']) {
    test(`OTP request rejected with ${code} cannot continue`, async () => {
        const f = fixture({ otpError: { code } });
        await f.login();
        assert.equal(f.routes.length, 0);
        assert.equal(f.signouts(), 1);
        assert.equal(f.storage.has('mfa_lock'), false);
    });
}

test('failure to establish the pending flag cannot send an OTP or continue', async () => {
    const f = fixture({ pendingError: { code: 'PERMISSION_DENIED' } });
    await f.login();
    assert.equal(f.sends(), 0);
    assert.equal(f.routes.length, 0);
    assert.equal(f.signouts(), 1);
});

test('rapid repeated taps only send one code', async () => {
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const f = fixture({ send: () => wait });
    const first = f.login();
    await f.login();
    release();
    await first;
    assert.equal(f.sends(), 1);
    assert.equal(f.routes.length, 1);
});
