const test = require('node:test');
const assert = require('node:assert/strict');
const functions = require('../groups/tripViewFunctions');
const { profileAffectsViews, isPermanent } = require('../services/tripViewService');

const endpoint = name => functions[name].__endpoint;
const ref = name => endpoint(name).eventTrigger.eventFilterPathPatterns.ref;

test('a new trip builds its trip view when trips_orgs/{tripId} is created', () => {
  const trigger = endpoint('onTripCreatedView').eventTrigger;
  assert.equal(trigger.eventType, 'google.firebase.database.ref.v1.created');
  assert.equal(ref('onTripCreatedView'), 'trips_orgs/{tripId}');
  assert.deepEqual(endpoint('onTripCreatedView').region, ['europe-west1']);
  assert.equal(trigger.retry, true);
});
test('every field the directory reads from a user record has a trigger', () => {
  const refs = Object.keys(functions).filter(name => name.startsWith('onUser')).map(ref);
  for (const field of ['profile', 'full_name', 'photo_url', 'p_profile', 'p_email', 'p_phone', 'first_name', 'last_name', 'email', 'phone', 'phoneNumber']) {
    assert.ok(refs.includes(`users/{uid}/${field}`), field);
  }
});
test('profile writes that change nothing the directory shows do not rebuild the views', () => {
  const profile = { firstName: 'A', lastName: 'B', email: 'a@b.invalid', phone: '1', photoURL: 'p' };
  assert.equal(profileAffectsViews(profile, { ...profile, likes: { x: 1 }, bio: 'new' }), false);
  assert.equal(profileAffectsViews(null, null), false);
  for (const change of [{ firstName: 'C' }, { lastName: 'C' }, { email: 'c@d.invalid' }, { phone: '2' }, { photoURL: 'q' }, { phoneNumber: '3' }, { first_name: 'x' }]) {
    assert.equal(profileAffectsViews(profile, { ...profile, ...change }), true, JSON.stringify(change));
  }
  assert.equal(profileAffectsViews(null, profile), true);
  assert.equal(profileAffectsViews(profile, null), true);
});
test('bad data is dropped and temporary failures are retried', () => {
  assert.equal(isPermanent(new TypeError('x')), true);
  assert.equal(isPermanent(Object.assign(new Error('x'), { code: 'not-found' })), true);
  assert.equal(isPermanent(Object.assign(new Error('x'), { code: 'permission-denied' })), true);
  assert.equal(isPermanent(Object.assign(new Error('network'), { code: 'app/network-error' })), false);
  assert.equal(isPermanent(new Error('deadline')), false);
});
