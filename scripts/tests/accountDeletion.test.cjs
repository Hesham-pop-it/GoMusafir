const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/utils/accountDeletion.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export /g, '');
function fixture({ cacheFailure = false, locationHangs = false } = {}) {
    const auth = { currentUser: { uid: 'deleted' } };
    const calls = [];
    const storage = { firebaseAuthUser: 'refresh/access tokens', mfa_lock: 'true', '@voice_session': 'trip', '@active_location_sync': 'trip', 'gomusafir.pendingNotificationTap': 'trip', user_language: 'en' };
    let history = ['TripOverview', 'TripSettings'];
    const context = {
        console: { warn: () => {} },
        finishEnrollment: () => calls.push('finishEnrollment'),
        signOut: async current => { calls.push('signOut'); current.currentUser = null; delete storage.firebaseAuthUser; },
        AsyncStorage: { multiRemove: async keys => { calls.push('storage'); keys.forEach(key => delete storage[key]); } },
        ChatDatabase: { clearAll: async () => { calls.push('chat'); if (cacheFailure) throw Error('cache'); } },
        ChatEncryption: { clear: async () => calls.push('encryption') },
        stopLiveLocationTracking: async () => { calls.push('location'); if (locationHangs) await new Promise(() => {}); },
        unregisterForPushNotificationsAsync: async options => { assert.equal(options.localOnly, true); calls.push('push'); },
    };
    vm.createContext(context); vm.runInContext(source, context);
    return { auth, storage, calls, history: () => history,
        run: () => context.completeAccountDeletion(auth, { reset: state => { calls.push('reset'); history = Array.from(state.routes, r => r.name); } }),
    };
}
test('confirmed deletion clears Firebase persistence and resets the entire protected stack', async () => {
    const f = fixture(); await f.run();
    assert.equal(f.auth.currentUser, null);
    assert.equal(f.storage.firebaseAuthUser, undefined); // Reopening cannot restore the deleted session.
    assert.deepEqual(f.history(), ['Welcome']);
    for (const key of ['mfa_lock', '@voice_session', '@active_location_sync', 'gomusafir.pendingNotificationTap']) assert.equal(f.storage[key], undefined);
    assert.equal(f.storage.user_language, 'en');
    assert.ok(f.calls.indexOf('signOut') < f.calls.indexOf('reset'));
    assert.ok(f.calls.includes('chat') && f.calls.includes('encryption'));
});
test('cache failure does not prevent other cleanup or leave the deleted account on screen', async () => {
    const f = fixture({ cacheFailure: true }); await f.run();
    assert.deepEqual(f.history(), ['Welcome']);
    assert.equal(f.auth.currentUser, null);
    assert.ok(f.calls.includes('push') && f.calls.includes('location') && f.calls.includes('encryption'));
});
test('a stalled native cleanup cannot delay authentication removal or the redirect', async () => {
    const f = fixture({ locationHangs: true }); f.run();
    for (let i=0;i<5;i++) await Promise.resolve();
    assert.equal(f.auth.currentUser, null);
    assert.deepEqual(f.history(), ['Welcome']);
});
