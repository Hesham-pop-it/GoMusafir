const test = require('node:test');
const assert = require('node:assert/strict');
const { STANDARD, SOS, QUIET, notificationSound } = require('../services/notificationSoundConfig');

test('normal messages use the standard sound', () => {
    assert.equal(notificationSound({ type: 'dm_message' }), STANDARD);
});

test('quiet delivery uses the sound-free channel', () => {
    assert.equal(notificationSound({ type: 'chat' }, { quiet: true }), QUIET);
    assert.equal(notificationSound({ androidChannelId: QUIET.channelId }), QUIET);
    assert.equal(QUIET.sound, null);
});

test('an emergency is never quiet', () => {
    assert.equal(notificationSound({ type: 'sos' }, { quiet: true }), SOS);
});
