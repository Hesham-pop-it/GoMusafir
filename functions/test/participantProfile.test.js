const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture({ config = { email: 'Show to everyone', phone: 'Show to everyone' }, personal = {}, staff = false, member = true, denied = false, user = {} } = {}) {
  const data = { 'trips_participants/t/target': member, 'orgs/o/staff/target': null,
    'users/target': { profile: { firstName: 'Test', email: 'profile@example.test', phone: '+310000000' }, participant_visibility: { t: personal }, ...user } };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../services/participantProfileService'), 'utf8'), {
    module, exports: module.exports, require(name) {
      if (name.includes('firebase-functions')) return { HttpsError };
      if (name === '../admin') return { db: { ref: key => ({ get: async () => ({ val: () => data[key], exists: () => data[key] != null }) }) }, auth: { getUser: async () => ({ email: 'auth@example.test' }) } };
      if (name.includes('participantAccessService')) return { requireTripAccess: async () => {
        if (denied) throw new HttpsError('permission-denied', 'Denied');
        return { orgId: 'o', trip: { visibility_config: config }, staff };
      } };
      if (name.includes('kmsService')) return { decrypt: v => v.startsWith('encrypted:') ? v.slice(10) : v };
      throw Error(name);
    },
  });
  return () => module.exports.getParticipantProfile({ data: { targetUid: 'target', tripId: 't' }, auth: { uid: 'viewer' } });
}
test('participants receive contacts shared with everyone from the basic profile', async () => {
  const result = await fixture()();
  assert.equal(result.email, 'profile@example.test'); assert.equal(result.phone, '+310000000');
});
test('incomplete encrypted blob retains contact fallbacks', async () => {
  const result = await fixture({ user: { p_profile: 'encrypted:{"firstName":"Encrypted"}' } })();
  assert.equal(result.email, 'profile@example.test'); assert.equal(result.phone, '+310000000');
});
test('legacy encrypted fields and Auth email are resolved', async () => {
  const result = await fixture({ user: { profile: {}, p_phone: 'encrypted:+920000000' } })();
  assert.equal(result.email, 'auth@example.test'); assert.equal(result.phone, '+920000000');
});
test('organizer-only contacts never leak through nested profile', async () => {
  const result = await fixture({ config: {} })();
  assert.equal(result.email, '***'); assert.equal(result.profile.email, '***');
  assert.equal(result.phone, '***'); assert.equal(result.visibility.canSeePhone, false);
});
test('custom choice follows personal settings and hidden fields stay hidden for staff', async () => {
  const result = await fixture({ config: { email: 'Custom choice', phone: 'Do not show' }, personal: { email: 'Show to everyone' }, staff: true })();
  assert.equal(result.email, 'profile@example.test'); assert.equal(result.profile.phone, '***');
});
test('unrelated target or unauthorized viewer cannot retrieve a profile', async () => {
  for (const options of [{ member: false }, { denied: true }]) await assert.rejects(fixture(options)(), { code: 'permission-denied' });
});
