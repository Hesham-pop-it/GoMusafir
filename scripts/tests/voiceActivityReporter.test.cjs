const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/utils/voiceActivityReporter.js'), 'utf8').replace(/^export /gm, '');
const create = vm.runInNewContext(source + '\ncreateActivityReporter', { console });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function fixture({ canReport = true, fail = false } = {}) {
    const sent = [], warnings = [];
    const room = { localParticipant: { isMicrophoneEnabled: false, isSpeaking: false }, remoteParticipants: new Map() };
    const state = { canReport, fail, connected: true };
    const reporter = create({ room, canReport: () => state.canReport, isConnected: () => state.connected,
        warn: (...args) => warnings.push(args),
        send: async activity => { if (state.fail) throw Object.assign(new Error('x'), { code: 'unavailable' }); sent.push(activity); } });
    return { room, sent, state, reporter, warnings };
}

test('a listener who cannot speak never reports', async () => {
    const f = fixture({ canReport: false });
    f.reporter.changed(); f.reporter.unmuted(); await flush();
    assert.deepEqual(f.sent, []);
});
test('the first look is reported, repeats of the same state are not', async () => {
    const f = fixture();
    f.reporter.changed(); await flush();
    f.reporter.changed(); f.reporter.changed(); await flush();
    assert.deepEqual(f.sent, [false]);
});
test('speech and silence are each reported once, on change', async () => {
    const f = fixture();
    f.reporter.changed(); await flush();
    f.room.localParticipant.isMicrophoneEnabled = true;
    f.reporter.changed(); f.reporter.changed(); await flush();
    f.room.localParticipant.isMicrophoneEnabled = false;
    f.reporter.changed(); await flush();
    assert.deepEqual(f.sent, [false, true, false]);
});
test('a short unmute that is over before the report still counts as activity', async () => {
    const f = fixture();
    f.reporter.changed(); await flush();
    f.reporter.unmuted(); await flush();
    assert.deepEqual(f.sent, [false, true, false]);
});
test('someone muting or leaving re-sends a quiet room even if unchanged', async () => {
    const f = fixture();
    f.reporter.changed(); await flush();
    f.reporter.lowered(); await flush();
    assert.deepEqual(f.sent, [false, false]);
});
test('a failed report is retried on the next look and does not loop', async () => {
    const f = fixture({ fail: true });
    f.reporter.changed(); await flush();
    assert.equal(f.warnings.length, 1);
    f.state.fail = false;
    f.reporter.changed(); await flush();
    assert.deepEqual(f.sent, [false]);
});
test('a reconnect reports again, and a disposed reporter stays silent', async () => {
    const f = fixture();
    f.reporter.changed(); await flush();
    f.reporter.reconnected(); await flush();
    f.reporter.dispose(); f.reporter.changed(); await flush();
    assert.deepEqual(f.sent, [false, false]);
});
