const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const file = fs.readFileSync(require.resolve('../../src/services/notificationService.js'), 'utf8');
const source = file.slice(file.indexOf('export async function registerForPushNotificationsAsync')).replaceAll('export ', '');
function fixture(getToken = async () => 'token') {
    const auth = { currentUser: { uid: 'old' } }, writes = [], callbacks = [];
    let unsubscribed = 0;
    const messaging = () => ({
        requestPermission: async () => 1, getToken,
        onTokenRefresh: cb => { callbacks.push(cb); return () => { unsubscribed++; }; },
        deleteToken: async () => {},
    });
    messaging.AuthorizationStatus = { AUTHORIZED: 1 };
    const context = {
        auth, database: {}, messaging, isExpoGo: false, Platform: { OS: 'test' },
        console: { log() {} }, ref: (_, path) => path, set: async (path, value) => writes.push([path, value]),
        notifee: { cancelAllNotifications: async () => {} }, resetNotificationPresentation() {},
        setTimeout: () => 1,
    };
    const api = vm.runInNewContext(`
        let registrationRevision = 0, unsubscribeTokenRefresh = null;
        let isForegroundListenerRegistered = true, tapQueue = null;
        ${source}
        ({ register: registerForPushNotificationsAsync, unregister: unregisterForPushNotificationsAsync });
    `, context);
    return { ...api, auth, writes, callbacks, unsubscribed: () => unsubscribed };
}
test('push refresh cannot write using the signed-out user as a fallback', async () => {
    const f = fixture();
    await f.register();
    f.auth.currentUser = null;
    await f.callbacks[0]('late-token');
    assert.equal(f.writes.length, 1);
});
test('local logout detaches refresh callbacks and performs no database removal', async () => {
    const f = fixture();
    await f.register();
    await f.unregister({ localOnly: true });
    await f.callbacks[0]('late-token');
    assert.equal(f.unsubscribed(), 1);
    assert.equal(f.writes.length, 1);
});
test('logout cancels registration waiting for a native token', async () => {
    let resolveToken;
    const f = fixture(() => new Promise(resolve => { resolveToken = resolve; }));
    const registration = f.register();
    await Promise.resolve();
    await f.unregister({ localOnly: true });
    resolveToken('late-token');
    await registration;
    assert.equal(f.writes.length, 0);
    assert.equal(f.callbacks.length, 0);
});
