const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../src/utils/voiceWidgetActions.js'), 'utf8');
const run = vm.runInNewContext(source.replace('export async function', 'async function') + '\nhandleVoiceWidgetAction');
function fixture(overrides = {}) {
    const calls = [];
    const session = { connected: true, admin: true, muted: false, globallyMuted: false,
        tripId: 'trip', orgId: 'org', ...overrides };
    for (const name of ['connect', 'disconnect', 'stop', 'setMuted', 'setGlobalMuted']) {
        session[name] = async (...args) => calls.push([name, ...args]);
    }
    return { session, calls, tap: target => run({source: 'MyLiveActivity', target}, session) };
}
test('lock-screen controls invoke microphone, room mute and stop with current trip', async () => {
    const f = fixture();
    await f.tap('mute_myself');
    await f.tap('mute_channel');
    await f.tap('stop_channel');
    assert.deepEqual(f.calls, [['setMuted', true], ['setGlobalMuted', true], ['stop', true, 'trip', 'org']]);
});
test('unmute actions reverse current state', async () => {
    const f = fixture({muted: true, globallyMuted: true});
    await f.tap('mute_myself'); await f.tap('mute_channel');
    assert.deepEqual(f.calls, [['setMuted', false], ['setGlobalMuted', false]]);
});
test('participant cannot stop, mute everyone or bypass global mute', async () => {
    const f = fixture({admin: false, muted: true, globallyMuted: true});
    for (const target of ['stop_channel', 'mute_channel', 'mute_myself']) await f.tap(target);
    assert.deepEqual(f.calls, []);
    await f.tap('leave_channel'); assert.deepEqual(f.calls, [['disconnect']]);
});
test('disconnected controls and unrelated events have no effect', async () => {
    const f = fixture({connected: false});
    for (const target of ['stop_channel', 'mute_channel', 'mute_myself']) await f.tap(target);
    await run({source:'AnotherWidget', target:'join_channel'}, f.session);
    assert.deepEqual(f.calls, []);
});
test('microphone errors propagate for visible failure handling', async () => {
    const f = fixture(); f.session.setMuted = async () => {throw new Error('mic failed');};
    await assert.rejects(f.tap('mute_myself'), /mic failed/);
});
