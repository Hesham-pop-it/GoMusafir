const test = require('node:test');
const assert = require('node:assert/strict');

let mod;
test.before(async () => { mod = await import('../../src/utils/deletionFlow.js'); });

test('reason is read from server details', () => {
    assert.equal(mod.deletionErrorReason({ details: { reason: 'owns-organization' } }), 'owns-organization');
    assert.equal(mod.deletionErrorReason({ details: { reason: 'weird' } }), null);
});

test('older reauth wording still maps to reauth-required', () => {
    assert.equal(mod.deletionErrorReason({ message: 'Please re-authenticate' }), 'reauth-required');
    assert.equal(mod.deletionErrorReason({ code: 'auth/requires-recent-login' }), 'reauth-required');
    assert.equal(mod.deletionErrorReason(null), null);
});

test('blocking journeys are filtered to objects', () => {
    assert.deepEqual(mod.blockingJourneys({ details: { journeys: [{ id: 'a' }, null, 'x'] } }), [{ id: 'a' }]);
    assert.deepEqual(mod.blockingJourneys({}), []);
});

test('reauth method follows role and provider', () => {
    const pw = { providerData: [{ providerId: 'password' }] };
    assert.equal(mod.reauthMethod(pw, 'manager'), 'password');
    assert.equal(mod.reauthMethod(pw, 'participant'), 'email-code');
    assert.equal(mod.reauthMethod({ providerData: [] }, 'manager'), 'email-code');
});

test('confirm name must match exactly', () => {
    assert.equal(mod.confirmNameMatches(' Noor Travel ', 'Noor Travel'), true);
    assert.equal(mod.confirmNameMatches('noor travel', 'Noor Travel'), false);
    assert.equal(mod.confirmNameMatches('', ''), false);
});

test('days remaining rounds up and never goes negative', () => {
    assert.equal(mod.daysRemaining(1000 + 86400000 * 2 + 5, 1000), 3);
    assert.equal(mod.daysRemaining(10, 1000), 0);
    assert.equal(mod.daysRemaining(undefined, 1000), 0);
});
