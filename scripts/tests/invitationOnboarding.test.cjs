const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/utils/invitationOnboarding.js'), 'utf8').replace(/export /g, ''), context);

test('new invitation signup preserves the original trip and overrides stale home/existing-user params', () => {
    const previous = { invitationCode: 'ORIGINAL', tripDetails: { title: 'Journey' }, targetScreen: 'Home', uid: 'old', isExistingUser: true };
    const params = context.invitationVerificationParams(previous, { uid: 'new', email: 'new@example.test' });
    assert.equal(params.invitationCode, 'ORIGINAL');
    assert.equal(params.tripDetails, previous.tripDetails);
    assert.equal(params.uid, 'new');
    assert.equal(params.isExistingUser, false);
    assert.equal(params.targetScreen, 'JoinFirstName');
    assert.equal(previous.targetScreen, 'Home');
});
test('OTP always resumes the invited participant flow even with missing or stale route target', () => {
    for (const targetScreen of [undefined, 'Home', 'TripOverview']) {
        assert.equal(context.verificationContinuation({ invitationCode: 'ORIGINAL', targetScreen }), 'JoinFirstName');
        assert.equal(context.verificationContinuation({ invitationCode: 'ORIGINAL', isExistingUser: true, targetScreen }), 'JoinTerms');
    }
    assert.equal(context.verificationContinuation({ isTeamInvite: true, targetScreen: 'JoinFirstName' }), 'JoinFirstName');
    assert.equal(context.verificationContinuation({ targetScreen: 'Home' }), 'Home');
});
