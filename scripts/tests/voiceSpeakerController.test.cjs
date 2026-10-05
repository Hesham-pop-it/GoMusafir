const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ send, microphone } = {}) {
    const context = { exports: {}, setTimeout, clearTimeout };
    const source = fs.readFileSync(require.resolve('../../src/utils/voiceSpeakerController'), 'utf8')
        .replace('export function createVoiceSpeakerController', 'exports.createVoiceSpeakerController = function');
    vm.runInNewContext(source, context);
    const sent = [], hardware = [], muted = [], intent = [], errors = [];
    let sequence = 0;
    const controller = context.exports.createVoiceSpeakerController({
        participantSid: 'sid', makeRequestId: () => `request-${++sequence}`,
        send: async command => { sent.push({ ...command }); await send?.(command); },
        setMicrophone: async enabled => { hardware.push(enabled); await microphone?.(enabled); },
        onMuted: value => muted.push(value), onIntent: value => intent.push(value), onError: error => errors.push(error),
    });
    const state = (status = 'granted', requestId = `request-${sequence}`) => controller.updateState({
        entries: { me: { sid: 'sid', requestId, status } },
    }, 'me');
    return { controller, sent, hardware, muted, intent, errors, state };
}

test('microphone opens only after both a server slot and LiveKit permission arrive', async () => {
    const f = fixture();
    f.controller.setMuted(false);
    f.state('queued');
    f.controller.updatePermission(true);
    await flush();
    assert.deepEqual(f.hardware, []);
    f.state();
    await flush();
    assert.deepEqual(f.hardware, [true]);
    f.controller.setMuted(true);
    await flush();
    assert.deepEqual(f.hardware, [true, false]);
    assert.deepEqual(f.sent.map(c => c.action), ['request', 'release']);
});

for (const released of [false, true]) {
    test(`participant preempted by organizer resumes only while still holding (released=${released})`, async () => {
        const f = fixture();
        f.controller.setMuted(false);
        f.controller.updatePermission(true);
        f.state();
        await flush();
        f.state('queued');
        f.controller.updatePermission(false);
        await flush();
        assert.deepEqual(f.hardware, [true, false]);
        assert.equal(f.intent.at(-1), true);
        if (released) f.controller.setMuted(true);
        f.state();
        f.controller.updatePermission(true);
        await flush();
        assert.deepEqual(f.hardware, released ? [true, false] : [true, false, true]);
        f.controller.dispose();
        await flush();
    });
}

test('release while request is pending cancels it and ignores a late grant', async () => {
    let finish;
    const f = fixture({ send: command => command.action === 'request' ? new Promise(resolve => { finish = resolve; }) : undefined });
    f.controller.setMuted(false);
    f.controller.setMuted(true);
    f.controller.updatePermission(true);
    f.state();
    finish();
    await flush();
    assert.deepEqual(f.hardware, []);
    assert.deepEqual(f.sent.map(c => c.action), ['request', 'release']);
});

test('release during slow hardware enable finishes with the microphone off', async () => {
    let finish;
    const f = fixture({ microphone: enabled => enabled ? new Promise(resolve => { finish = resolve; }) : undefined });
    f.controller.setMuted(false);
    f.controller.updatePermission(true);
    f.state();
    f.controller.setMuted(true);
    finish();
    await flush();
    assert.deepEqual(f.hardware, [true, false]);
    assert.equal(f.muted.at(-1), true);
});

test('organizer revocation mutes and cancels intent without automatically rejoining', async () => {
    const f = fixture();
    f.controller.setMuted(false);
    f.controller.updatePermission(true);
    f.state();
    await flush();
    f.controller.updateState({ entries: {} }, 'me');
    await flush();
    assert.deepEqual(f.hardware, [true, false]);
    assert.equal(f.intent.at(-1), false);
    assert.deepEqual(f.sent.map(c => c.action), ['request', 'release']);
});

test('old grants cannot enable a new press and duplicate presses are idempotent', async () => {
    const f = fixture();
    f.controller.updatePermission(true);
    f.controller.setMuted(false);
    f.controller.setMuted(false);
    await flush();
    assert.equal(f.sent.length, 1);
    f.controller.setMuted(true);
    await flush();
    f.controller.setMuted(false);
    f.state('granted', 'request-1');
    await flush();
    assert.deepEqual(f.hardware, []);
    f.state();
    await flush();
    assert.deepEqual(f.hardware, [true]);
    f.controller.dispose();
    await flush();
});

test('leaving while queued releases the request and cannot open the microphone later', async () => {
    const f = fixture();
    f.controller.setMuted(false);
    await flush();
    f.state('queued');
    f.controller.dispose();
    f.controller.updatePermission(true);
    f.state();
    await flush();
    assert.deepEqual(f.hardware, []);
    assert.equal(f.sent.at(-1).action, 'release');
});

test('microphone hardware failure releases its slot', async () => {
    const f = fixture({ microphone: enabled => { if (enabled) throw new Error('Device unavailable'); } });
    f.controller.setMuted(false);
    f.controller.updatePermission(true);
    f.state();
    await flush();
    assert.equal(f.sent.at(-1).action, 'release');
    assert.equal(f.intent.at(-1), false);
    assert.equal(f.errors.length, 1);
});
