const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const babel = require('@babel/core');
const code = babel.transformFileSync(require.resolve('../../src/utils/voiceAudioSession.js'), {
    presets: ['babel-preset-expo'], babelrc: false, configFile: false,
}).code;

function load(configure) {
    const context = { exports: {}, require: name => name === '@livekit/react-native' ? { AudioSession: { setAppleAudioConfiguration: configure } } : require(name) };
    vm.runInNewContext(code, context);
    return context.exports;
}

test('each microphone acquisition applies full configuration before capture', async () => {
    const calls = [];
    const api = load(async config => { calls.push('configure'); assert.equal(config.audioCategory, 'playAndRecord'); assert.equal(config.audioMode, 'videoChat'); assert.deepEqual(Array.from(config.audioCategoryOptions), ['defaultToSpeaker', 'allowBluetooth']); });
    const devices = { async getUserMedia(constraints) { assert.equal(this, devices); calls.push('capture'); return constraints; } };
    api.installVoiceMicrophoneConfiguration(devices);
    await devices.getUserMedia({ audio: true });
    await devices.getUserMedia({ audio: { echoCancellation: true } });
    assert.deepEqual(calls, ['configure', 'capture', 'configure', 'capture']);
});

test('camera-only acquisition does not change the audio session', async () => {
    const api = load(() => { throw new Error('Unexpected audio configuration'); });
    const devices = { async getUserMedia() { return 'camera'; } };
    api.installVoiceMicrophoneConfiguration(devices);
    assert.equal(await devices.getUserMedia({ video: true }), 'camera');
});

test('audio configuration failure propagates without starting capture', async () => {
    const api = load(async () => { throw new Error('Audio unavailable'); });
    const devices = { getUserMedia() { assert.fail('Must not capture after configuration failure'); } };
    api.installVoiceMicrophoneConfiguration(devices);
    await assert.rejects(devices.getUserMedia({ audio: true }), /Audio unavailable/);
});
