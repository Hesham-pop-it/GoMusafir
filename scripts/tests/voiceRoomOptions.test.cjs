const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/utils/voiceRoomOptions.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const speech = { maxBitrate: 24000 };
const api = vm.runInNewContext(source + '\n({ VOICE_PUBLISH_DEFAULTS, LEAVE_ON_SILENCE, voiceRoomOptions })', { AudioPresets: { speech } });

test('live voice publishes with the speech preset, DTX on and RED off', () => {
    const options = api.voiceRoomOptions();
    assert.equal(options.publishDefaults.audioPreset, speech);
    assert.equal(options.publishDefaults.dtx, true);
    assert.equal(options.publishDefaults.red, false);
    assert.equal(options.audioLevelInterval, 20);
});
test('the installed speech preset is 24 kbps', () => {
    const sdk = fs.readFileSync(path.join(root, 'node_modules/livekit-client/dist/livekit-client.esm.mjs'), 'utf8');
    assert.match(sdk, /AudioPresets\.speech = \{\s*maxBitrate: 24000/);
});
test('leaving on silence stays off', () => {
    assert.equal(api.LEAVE_ON_SILENCE, false);
});
test('the voice room is built from these options', () => {
    const context = fs.readFileSync(path.join(root, 'src/context/VoiceContext.js'), 'utf8');
    assert.match(context, /new Room\(voiceRoomOptions\(\)\)/);
});
test('moving the app to the background never leaves the room', () => {
    const context = fs.readFileSync(path.join(root, 'src/context/VoiceContext.js'), 'utf8');
    const start = context.indexOf("if (nextAppState === 'background') {");
    const end = context.indexOf("} else if (nextAppState === 'active') {", start);
    assert.ok(start > 0 && end > start);
    assert.ok(!/disconnect\(|setMicrophoneEnabled\(/.test(context.slice(start, end)));
});
