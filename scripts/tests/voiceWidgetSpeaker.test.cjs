const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../src/utils/voiceWidgetSpeaker.js'), 'utf8').replace('export function', 'function');
const context = {}; vm.createContext(context); vm.runInContext(source, context);
const resolve = overrides => context.resolveVoiceWidgetSpeaker({
    connected: true, muted: false, localSpeaking: false, localUid: 'me', localName: 'Abdullah',
    localAvatar: 'file://me.jpg', speakingUids: [], remoteParticipants: new Map([['other', { name: 'Ali' }]]),
    activeSpeaker: null, avatarCache: {}, ...overrides,
});
test('local participant speech updates the island before the room list or Firebase changes', () => {
    const result = resolve({ localSpeaking: true });
    assert.equal(result.isSpeaking, true);
    assert.equal(result.name, 'Abdullah');
    assert.equal(result.avatar, 'file://me.jpg');
});
test('stale remote Firebase speaker cannot override local speech or keep the waveform active', () => {
    const activeSpeaker = { uid: 'other', name: 'Ali', speaking: true };
    assert.equal(resolve({ activeSpeaker, localSpeaking: true }).name, 'Abdullah');
    assert.equal(resolve({ activeSpeaker }).isSpeaking, false);
});
test('remote LiveKit speech works without Firebase profile delivery and never uses another avatar', () => {
    const result = resolve({ speakingUids: ['other'], activeSpeaker: { uid: 'old', name: 'Old speaker' }, avatarCache: { old: 'file://old.jpg' } });
    assert.equal(result.isSpeaking, true);
    assert.equal(result.name, 'Ali');
    assert.equal(result.avatar, '');
});
test('matched remote name and cached avatar are used together', () => {
    const result = resolve({ speakingUids: ['other'], activeSpeaker: { uid: 'other', name: 'Ali Khan' }, avatarCache: { other: 'file://ali.jpg' } });
    assert.equal(result.name, 'Ali Khan');
    assert.equal(result.avatar, 'file://ali.jpg');
});
test('muting or disconnecting clears local speaking even with stale speech flags', () => {
    assert.equal(resolve({ muted: true, localSpeaking: true, speakingUids: ['me'] }).isSpeaking, false);
    assert.equal(resolve({ connected: false, localSpeaking: true, speakingUids: ['other'] }).isSpeaking, false);
});

test('prefetched profile supplies the speaker name and photo before Firebase speaker delivery', () => {
    const result = resolve({ speakingUids: ['other'], profiles: { other: { name: 'Ali Ahmed' } }, avatarCache: { other: 'file://shared/ali.jpg' } });
    assert.equal(result.name, 'Ali Ahmed');
    assert.equal(result.avatar, 'file://shared/ali.jpg');
    assert.equal(result.isSpeaking, true);
});
