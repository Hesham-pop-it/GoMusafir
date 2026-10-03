const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const errors = read('src/utils/sessionErrors.js').replaceAll('export const ', 'const ');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const snapshot = data => ({ val: () => data, exists: () => data != null });

async function fixture({ online = false, role = 'participant', noUser = false, tokenCode, accessCode, pendingWrite = false, cachedToken = false, initialNetworkRead, unverified = false, enrolling = unverified, mountedRoute = null, missingProfile = false } = {}) {
    const state = { resolved: !!mountedRoute, route: mountedRoute || 'Welcome', ready: false, offline: false, failed: false };
    const listeners = new Map(), intervals = [], timeouts = [];
    let resets = 0;
    let authListener, accessPublished, networkListener, signouts = 0, tokenCalls = 0, networkReads = 0, reportedOnline;
    const user = { uid: 'user', emailVerified: !unverified, reload: async () => {}, getIdTokenResult: async force => {
        tokenCalls++;
        if (tokenCode || (!online && (!cachedToken || force))) throw { code: tokenCode || 'auth/network-request-failed' };
        return { claims: { role, auth_time: 1 } };
    } };
    const auth = { currentUser: noUser ? null : user };
    const network = () => ({ isConnected: reportedOnline ?? online, isInternetReachable: reportedOnline ?? online });
    const context = {
        auth, database: {}, console: { log() {}, warn() {} },
        Network: { addNetworkStateListener: cb => { networkListener = cb; return { remove() {} }; }, getNetworkStateAsync: async () => { networkReads++; return networkReads === 1 && initialNetworkRead ? initialNetworkRead : network(); } },
        AppState: { addEventListener: () => ({ remove() {} }) },
        setSessionResolved: v => state.resolved = v, setInitialRoute: v => state.route = v,
        setAppIsReady: v => state.ready = v, setOffline: v => state.offline = v, setSyncFailed: v => state.failed = v, setProfileMissing: v => state.profileMissing = v,
        AsyncStorage: { getItem: async key => key === 'device_id' ? 'device' : null, setItem: async () => {}, multiRemove: async () => {} },
        Linking: { getInitialURL: async () => null, addEventListener: () => ({ remove() {} }) },
        onAuthStateChanged: (_, cb) => { authListener = cb; cb(auth.currentUser); return () => {}; },
        ref: (_, key) => key,
        onValue: (key, cb) => {
            listeners.set(key, cb);
            if (key === 'users/user' && online) cb(snapshot(missingProfile ? null : { joined_trips: { trip: true } }));
            return () => listeners.delete(key);
        },
        get: async key => {
            if (!online) throw { code: 'database/network-error' };
            return snapshot(key.endsWith('join_flow_status') || missingProfile ? null : { joined_trips: { trip: true } });
        },
        set: async () => { if (pendingWrite) await new Promise(() => {}); },
        watchParticipantAccess: () => () => {}, onAppAccessPublished: cb => { accessPublished = cb; return () => {}; }, isEnrolling: () => enrolling,
        hasValidActiveTrip: async () => { if (accessCode) throw { code: accessCode }; return true; },
        registerForPushNotificationsAsync: () => {},
        signOut: async () => { signouts++; auth.currentUser = null; authListener(null); },
        safeSignOut: async () => { signouts++; auth.currentUser = null; authListener(null); },
        navigationRef: { isReady: () => !!mountedRoute, getCurrentRoute: () => ({ name: mountedRoute }), reset: value => { resets++; state.route = value.routes[0].name; } }, Alert: { alert() {} },
        setInterval: cb => { intervals.push(cb); return cb; }, clearInterval() {},
        setTimeout: cb => { timeouts.push(cb); return cb; }, clearTimeout() {},
        useEffect: cb => { context.cleanup = cb(); },
    };
    vm.createContext(context);
    const app = read('App.js');
    const start = app.indexOf('  useEffect(() => {\n    let unsubscribeAuth;');
    const effect = app.slice(start, app.indexOf('\n  useEffect(() => {', start + 1));
    vm.runInContext(errors + '\n' + effect, context);
    await flush();
    return {
        state, auth, listeners, resets: () => resets, joined: async () => { enrolling = false; user.emailVerified = true; accessPublished(user.uid); await flush(); }, signouts: () => signouts, tokenCalls: () => tokenCalls,
        timeout: async () => { timeouts.forEach(cb => cb()); await flush(); },
        connect: async value => { online = value; networkListener(network()); await flush(); },
        retry: async () => { intervals.forEach(cb => cb()); await flush(); },
        setOnlineWithoutEvent: value => online = value,
        setReportedOnline: value => reportedOnline = value,
        logout: async () => { await context.signOut(); await flush(); },
        setTokenCode: value => tokenCode = value, setAccessCode: value => accessCode = value,
    };
}

for (const role of ['admin', 'participant']) {
    test(`${role}: offline cold start never resolves to login, including splash timeout; reconnect restores session`, async () => {
        const f = await fixture({ role });
        await f.timeout();
        assert.equal(f.state.ready, true);
        assert.equal(f.state.resolved, false);
        assert.equal(f.state.offline, true);
        assert.equal(f.signouts(), 0);
        assert.ok(f.auth.currentUser);
        await f.connect(true);
        assert.equal(f.state.resolved, true);
        assert.equal(f.state.route, role === 'admin' ? 'Home' : 'TripOverview');
        assert.equal(f.state.failed, false);
        assert.equal(f.signouts(), 0);
    });
}

test('pending RTDB device write cannot block session restoration', async () => {
    const f = await fixture({ online: true, pendingWrite: true });
    assert.equal(f.state.resolved, true);
    assert.equal(f.state.route, 'TripOverview');
});

test('connection drops preserve resolved navigation and refresh automatically on return', async () => {
    const f = await fixture({ online: true });
    const before = f.tokenCalls();
    await f.connect(false);
    assert.equal(f.state.resolved, true);
    assert.equal(f.state.route, 'TripOverview');
    assert.equal(f.state.offline, true);
    await f.connect(true);
    assert.equal(f.state.offline, false);
    assert.ok(f.tokenCalls() > before);
    assert.equal(f.signouts(), 0);
});

test('access service outage preserves participant credentials and retries without relogin', async () => {
    const f = await fixture({ online: true, accessCode: 'functions/unavailable' });
    assert.equal(f.state.resolved, false);
    assert.equal(f.state.failed, true);
    assert.equal(f.signouts(), 0);
    f.setAccessCode(null);
    await f.retry();
    assert.equal(f.state.route, 'TripOverview');
    assert.equal(f.state.resolved, true);
});

test('genuine invalid credentials sign out; absence of a user resolves to Welcome', async () => {
    const f = await fixture({ online: true, tokenCode: 'auth/user-token-expired' });
    assert.equal(f.signouts(), 1);
    assert.equal(f.state.resolved, true);
    assert.equal(f.state.route, 'Welcome');
    const loggedOut = await fixture({ noUser: true });
    assert.equal(loggedOut.state.resolved, true);
    assert.equal(loggedOut.state.route, 'Welcome');
});

test('explicit logout clears authenticated route', async () => {
    const f = await fixture({ online: true });
    await f.logout();
    assert.equal(f.state.route, 'Welcome');
    assert.equal(f.auth.currentUser, null);
});

for (const code of ['auth/network-request-failed', 'functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/unauthenticated', 'functions/permission-denied']) {
    test(`participant access watcher handles ${code} distinctly`, async () => {
        let denied = 0;
        const context = {
            AppState: { addEventListener: () => ({ remove() {} }) },
            httpsCallable: () => async () => { throw { code }; },
            database: {}, functions: {}, ref: (_, key) => key, onValue: () => () => {},
            isEnrolling: () => false, setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
            user: { getIdTokenResult: async () => ({ claims: { role: 'participant' } }) },
            deny: () => denied++,
        };
        vm.createContext(context);
        const source = read('src/utils/participantAccess.js').replace(/^import .*;\n/gm, '').replaceAll('export ', '');
        vm.runInContext(errors + '\n' + source + '\nwatchParticipantAccess(user, deny);', context);
        await flush();
        assert.equal(denied, code === 'functions/unauthenticated' || code === 'functions/permission-denied' ? 1 : 0);
    });
}

test('active-trip lookup propagates network failure instead of fabricating a denial', async () => {
    const context = { auth: { currentUser: { uid: 'user' } }, fetchAppAccess: async () => { throw new Error('offline'); } };
    vm.createContext(context);
    const source = read('src/utils/authUtils.js').split('export const hasValidActiveTrip = ')[1];
    vm.runInContext('globalThis.check = ' + source, context);
    await assert.rejects(context.check('user'), /offline/);
});


test('cached identity with a token refresh failure stays signed in until recovery', async () => {
    const f = await fixture({ cachedToken: true, pendingWrite: true });
    f.listeners.get('users/user')(snapshot({ joined_trips: { trip: true } }));
    await flush();
    await f.timeout();
    assert.equal(f.state.resolved, false);
    assert.equal(f.signouts(), 0);
    await f.connect(true);
    assert.equal(f.state.resolved, true);
    assert.equal(f.state.route, 'TripOverview');
});

test('internet/backend drop with Wi-Fi still attached shows connection state and recovers', async () => {
    const f = await fixture({ online: true });
    const connection = f.listeners.get('.info/connected');
    connection(snapshot(true));
    await flush();
    connection(snapshot(false));
    assert.equal(f.state.failed, true);
    assert.equal(f.state.route, 'TripOverview');
    assert.equal(f.signouts(), 0);
    connection(snapshot(true));
    await flush();
    assert.equal(f.state.failed, false);
});


for (const cachedToken of [false, true]) {
    test(`Firebase reconnect clears stale offline UI without an OS event (cached token: ${cachedToken})`, async () => {
        const f = await fixture({ cachedToken });
        assert.equal(f.state.offline, true);
        f.setOnlineWithoutEvent(true);
        f.listeners.get('.info/connected')(snapshot(true));
        await flush();
        assert.equal(f.state.offline, false);
        assert.equal(f.state.failed, false);
        assert.equal(f.state.resolved, true);
        assert.equal(f.state.route, 'TripOverview');
        assert.equal(f.signouts(), 0);
    });
}

test('missed connectivity event after a warm connection drop recovers on periodic check', async () => {
    const f = await fixture({ online: true });
    await f.connect(false);
    assert.equal(f.state.offline, true);
    f.setOnlineWithoutEvent(true);
    await f.retry();
    assert.equal(f.state.offline, false);
    assert.equal(f.state.failed, false);
    assert.equal(f.state.route, 'TripOverview');
    assert.equal(f.signouts(), 0);
});

test('successful forced token refresh overrides an OS state stuck offline', async () => {
    const f = await fixture();
    f.setOnlineWithoutEvent(true);
    f.setReportedOnline(false);
    await f.retry();
    assert.equal(f.state.offline, false);
    assert.equal(f.state.resolved, true);
    assert.equal(f.state.failed, false);
    assert.equal(f.signouts(), 0);
});

test('delayed startup offline probe cannot override a newer backend connection', async () => {
    let release;
    const initialNetworkRead = new Promise(resolve => { release = resolve; });
    const f = await fixture({ online: true, initialNetworkRead });
    f.listeners.get('.info/connected')(snapshot(true));
    await flush();
    release({ isConnected: false, isInternetReachable: false });
    await flush();
    assert.equal(f.state.offline, false);
    assert.equal(f.state.resolved, true);
});

test('periodic probes while still offline preserve credentials and the offline message', async () => {
    const f = await fixture();
    await f.retry();
    await f.retry();
    assert.equal(f.state.offline, true);
    assert.equal(f.state.resolved, false);
    assert.ok(f.auth.currentUser);
    assert.equal(f.signouts(), 0);
});


test('verified enrollment initializes the global session immediately after join without another sign-in', async () => {
    const f = await fixture({ online: true, unverified: true });
    assert.equal(f.state.route, 'Welcome');
    await f.joined();
    assert.equal(f.state.route, 'TripOverview');
    assert.equal(f.signouts(), 0);
});


for (const role of ['participant', 'admin']) {
    test(`${role}: intermediate verified auth snapshot cannot display the main screen during invitation onboarding`, async () => {
        const f = await fixture({ online: true, role, enrolling: true, mountedRoute: 'JoinEmail' });
        assert.equal(f.state.route, 'JoinEmail');
        await f.retry();
        assert.equal(f.state.route, 'JoinEmail');
        assert.equal(f.signouts(), 0);
    });
}
test('new unverified invitation account stays on onboarding while OTP is being prepared', async () => {
    const f = await fixture({ online: true, unverified: true, mountedRoute: 'JoinEmail' });
    assert.equal(f.resets(), 0);
    assert.equal(f.signouts(), 0);
});

test('online missing profile is an account issue and preserves sign-in until the user chooses to leave', async () => {
    const f = await fixture({ online: true, missingProfile: true });
    assert.equal(f.state.profileMissing, true);
    assert.equal(f.state.offline, false);
    assert.equal(f.state.resolved, false);
    assert.equal(f.signouts(), 0);
    await f.retry();
    assert.equal(f.state.profileMissing, true);
    await f.logout();
    assert.equal(f.state.profileMissing, false);
    assert.equal(f.state.route, 'Welcome');
});
test('profile arriving after a missing profile clears the account warning', async () => {
    const f = await fixture({ online: true, missingProfile: true });
    f.listeners.get('users/user')(snapshot({ joined_trips: { trip: true } }));
    await flush();
    assert.equal(f.state.profileMissing, false);
    assert.equal(f.state.resolved, true);
});
test('offline missing profile is not classified as an account issue', async () => {
    const f = await fixture({ cachedToken: true });
    f.listeners.get('users/user')(snapshot(null));
    await flush();
    assert.notEqual(f.state.profileMissing, true);
    assert.equal(f.state.offline, true);
    assert.equal(f.signouts(), 0);
});
