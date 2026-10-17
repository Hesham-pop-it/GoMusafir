const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
    const listeners = new Map(), writes = [], values = {};
    const source = fs.readFileSync(path.join(__dirname, '../../src/utils/voiceChannelFields.js'), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
    const context = {
        ref: (_, key) => key,
        onValue: (key, next, error) => { listeners.set(key, { next, error }); return () => listeners.delete(key); },
        get: async key => ({ val: () => values[key] ?? null }),
        update: async (key, change) => writes.push([key, change]),
    };
    vm.createContext(context);
    vm.runInContext(source + '\nthis.api = { watchVoiceChannelState, watchActiveSpeaker, clearActiveSpeakerIfMine, watchPresence, isInVoiceChannel, watchOwnVoicePresence, presencePath };', context);
    const emit = (key, value) => listeners.get(key).next({ val: () => value });
    return { api: context.api, listeners, emit, writes, values };
}
const B = 'trips_active/o/t/voice_channel';

test('status fields report once all four have arrived, then on each change', () => {
    const f = fixture(), seen = [];
    const stop = f.api.watchVoiceChannelState({}, 'o', 't', value => seen.push(value));
    f.emit(`${B}/isAllMuted`, true); f.emit(`${B}/endedSessionId`, 's1'); f.emit(`${B}/endReason`, null);
    assert.equal(seen.length, 0);
    f.emit(`${B}/endRecipientUid`, null);
    assert.deepEqual(JSON.parse(JSON.stringify(seen.at(-1))), { isAllMuted: true, endedSessionId: 's1', endReason: null, endRecipientUid: null });
    f.emit(`${B}/isAllMuted`, false);
    assert.equal(seen.at(-1).isAllMuted, false);
    assert.deepEqual([...f.listeners.keys()].sort(), ['endRecipientUid', 'endReason', 'endedSessionId', 'isAllMuted'].sort().map(k => `${B}/${k}`).sort());
    stop(); assert.equal(f.listeners.size, 0);
});
test('a refused status read reports null', () => {
    const f = fixture(), seen = [];
    f.api.watchVoiceChannelState({}, 'o', 't', value => seen.push(value));
    f.listeners.get(`${B}/isAllMuted`).error(new Error('denied'));
    assert.equal(seen.at(-1), null);
});
test('the speaker is the id and flag from the voice node with the name from the directory', () => {
    const f = fixture(), seen = [], users = new Map();
    const stop = f.api.watchActiveSpeaker({}, 'o', 't', (uid, cb) => { users.set(uid, cb); return () => users.delete(uid); }, s => seen.push(s));
    assert.deepEqual([...f.listeners.keys()].sort(), [`${B}/activeSpeaker/speaking`, `${B}/activeSpeaker/uid`]);
    f.emit(`${B}/activeSpeaker/uid`, 'u1'); f.emit(`${B}/activeSpeaker/speaking`, true);
    assert.equal(seen.length, 0, 'waits for the directory');
    users.get('u1')({ full_name: 'Visible Name', profile: { photoURL: 'p.jpg' } });
    assert.deepEqual(JSON.parse(JSON.stringify(seen.at(-1))), { uid: 'u1', name: 'Visible Name', photoURL: 'p.jpg', avatar: 'p.jpg', speaking: true });
    f.emit(`${B}/activeSpeaker/uid`, 'u2');
    assert.equal(users.has('u1'), false); assert.equal(users.has('u2'), true);
    users.get('u2')(null);
    assert.equal(seen.at(-1).name, 'Participant');
    f.emit(`${B}/activeSpeaker/uid`, null);
    assert.equal(seen.at(-1), null); assert.equal(users.size, 0);
    stop(); assert.equal(f.listeners.size, 0);
});
test('a speaker flagged not speaking is cleared', () => {
    const f = fixture(), seen = [];
    f.api.watchActiveSpeaker({}, 'o', 't', (_, cb) => { cb({ full_name: 'A' }); return () => {}; }, s => seen.push(s));
    f.emit(`${B}/activeSpeaker/uid`, 'u1'); f.emit(`${B}/activeSpeaker/speaking`, false);
    assert.equal(seen.at(-1), null);
});
test('the speaker record is cleared only while it still names me', async () => {
    const f = fixture();
    f.values[`${B}/activeSpeaker/uid`] = 'other';
    await f.api.clearActiveSpeakerIfMine({}, 'o', 't', 'me'); assert.equal(f.writes.length, 0);
    f.values[`${B}/activeSpeaker/uid`] = 'me';
    await f.api.clearActiveSpeakerIfMine({}, 'o', 't', 'me');
    assert.deepEqual(JSON.parse(JSON.stringify(f.writes)), [[B, { activeSpeaker: null }]]);
});
test('presence merges the sibling node with the old location and phones write to the sibling', () => {
    const f = fixture(), seen = [];
    f.api.watchPresence({}, 'o', 't', 'voice', m => seen.push(m));
    f.emit('trips_active/o/t/voice_presence', { a: true });
    f.emit('trips_active/o/t/voice_channel/presence', { b: true });
    assert.deepEqual(JSON.parse(JSON.stringify(seen.at(-1))), { a: true, b: true });
    assert.equal(f.api.presencePath('o', 't', 'app'), 'trips_active/o/t/voice_app_presence');
});
test('own presence and in-voice checks accept either location', async () => {
    const f = fixture(), seen = [];
    f.api.watchOwnVoicePresence({}, 'o', 't', 'me', v => seen.push(v));
    f.emit('trips_active/o/t/voice_channel/presence/me', true); assert.equal(seen.at(-1), true);
    f.emit('trips_active/o/t/voice_channel/presence/me', null); assert.equal(seen.at(-1), false);
    f.emit('trips_active/o/t/voice_presence/me', true); assert.equal(seen.at(-1), true);
    f.values['trips_active/o/t/voice_presence/me'] = true;
    assert.equal(await f.api.isInVoiceChannel({}, 'o', 't', 'me'), true);
    assert.equal(await f.api.isInVoiceChannel({}, 'o', 't', 'x'), false);
});
test('the speaker write carries no name or photo', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/context/VoiceContext.js'), 'utf8');
    const block = source.slice(source.indexOf('await update(speakerRef, {'), source.indexOf('} catch (err) {}', source.indexOf('await update(speakerRef, {')));
    assert.ok(!/name:|avatar:/.test(block));
});
