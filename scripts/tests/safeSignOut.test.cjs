const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../src/utils/authUtils.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replaceAll('export const ', 'const ');
const errors = fs.readFileSync(require.resolve('../../src/utils/sessionErrors.js'), 'utf8')
    .replaceAll('export const ', 'const ');
function fixture({ blocked = false, denied = false, read } = {}) {
    const auth = { currentUser: { uid: 'old' } };
    const calls = [], warnings = [];
    let timer;
    const context = {
        auth, database: {}, console: { warn: (...args) => warnings.push(args) },
        protectedSession: { isBlocked: () => blocked, invalidate: () => { blocked = true; } },
        journeyWidget: { clear() {} }, finishEnrollment() {},
        ref: (_, path) => path,
        get: async path => {
            calls.push(['read', path]);
            if (read) return read();
            if (denied) throw { code: 'PERMISSION_DENIED' };
            return { val: () => null };
        },
        update: async () => calls.push(['write']),
        stopLiveLocationTracking: async () => calls.push(['location']),
        unregisterForPushNotificationsAsync: async options => calls.push(['push', options.localOnly]),
        signOut: async () => { calls.push(['signOut']); auth.currentUser = null; },
        setTimeout: cb => { timer = cb; return 1; }, clearTimeout() {},
    };
    const run = vm.runInNewContext(errors + '\n' + source + '\nsafeSignOut', context);
    return { auth, calls, warnings, run: options => run(auth, options), expire: () => timer() };
}
test('concurrent logout requests share one cleanup', async () => {
    const f = fixture();
    const first = f.run(), second = f.run();
    assert.equal(first, second);
    await first;
    assert.equal(f.calls.filter(c => c[0] === 'signOut').length, 1);
    assert.deepEqual(f.calls.find(c => c[0] === 'push'), ['push', false]);
});
test('blocked sessions clean up locally without database operations', async () => {
    const f = fixture({ blocked: true });
    await f.run({ tripId: 'trip', orgId: 'org' });
    assert.deepEqual(f.calls, [['location'], ['push', true], ['signOut']]);
});
test('permission rejection skips remote push cleanup and still signs out', async () => {
    const f = fixture({ denied: true });
    await f.run();
    assert.deepEqual(f.calls.find(c => c[0] === 'push'), ['push', true]);
    assert.equal(f.auth.currentUser, null);
    assert.equal(f.warnings.length, 0);
});
test('a delayed cleanup cannot sign out a replacement user', async () => {
    let resolveRead;
    const f = fixture({ read: () => new Promise(resolve => { resolveRead = resolve; }) });
    const pending = f.run();
    await Promise.resolve();
    const replacement = { uid: 'new' };
    f.auth.currentUser = replacement;
    f.expire();
    resolveRead({ val: () => 'trip' });
    await pending;
    assert.equal(f.auth.currentUser, replacement);
    assert.deepEqual(f.calls.map(c => c[0]), ['read']);
});
test('timeout ends auth and late reads cannot start further remote cleanup', async () => {
    let resolveRead;
    const f = fixture({ read: () => new Promise(resolve => { resolveRead = resolve; }) });
    const pending = f.run();
    await Promise.resolve();
    f.expire();
    resolveRead({ val: () => 'trip' });
    await pending;
    assert.deepEqual(f.calls.map(c => c[0]), ['read', 'signOut', 'location', 'push']);
    assert.deepEqual(f.calls.at(-1), ['push', true]);
});
