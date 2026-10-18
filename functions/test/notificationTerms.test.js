const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_TERMS, mergeTerms, visibleUntil, activeUntil, isActive, expiryEntry, loadTerms, resetTermsCache } = require('../services/notificationTerms');

const HOUR = 3600000, DAY = 24 * HOUR;
const T = DEFAULT_TERMS;

test('an open SOS never expires, a resolved one lasts 24 hours', () => {
  assert.equal(visibleUntil({ type: 'emergency', timestamp: 1000 }, T), null);
  assert.equal(visibleUntil({ type: 'emergency', timestamp: 1000, resolved_at: 5000 }, T), 5000 + DAY);
  assert.equal(isActive({ type: 'emergency', timestamp: 1 }, T, 1e15), true);
});

test('announcements end after three days or at the trip end, whichever is first', () => {
  assert.equal(visibleUntil({ type: 'alert', timestamp: 0 + 10 }, T), 10 + 3 * DAY);
  assert.equal(visibleUntil({ type: 'alert', timestamp: 10 }, T, 500), 500);
});

test('terms per type', () => {
  assert.equal(visibleUntil({ type: 'location_request', timestamp: 7 }, T), 7 + DAY);
  assert.equal(visibleUntil({ type: 'seat_update', timestamp: 7 }, T), 7 + 30 * DAY);
  assert.equal(visibleUntil({ type: 'participant_joined', timestamp: 7 }, T), 7 + DAY);
  assert.equal(visibleUntil({ type: 'NEW_SIGN_IN', timestamp: 7 }, T), 7 + 30 * DAY);
  assert.equal(visibleUntil({ type: 'voice_started', timestamp: 7 }, T), 7 + DAY);
  assert.equal(visibleUntil({ type: 'something_new', timestamp: 7 }, T), 7 + 30 * DAY);
});

test('a location request closes when it is answered', () => {
  assert.equal(visibleUntil({ type: 'location_request', timestamp: 7, status: 'accepted', respondedAt: 99 }, T), 99);
  assert.equal(isActive({ type: 'location_request', timestamp: 7, status: 'declined', respondedAt: 99 }, T, 100), false);
  assert.equal(isActive({ type: 'location_request', timestamp: 7, status: 'pending' }, T, 100), true);
});

test('a stamped value wins over the computed one', () => {
  assert.equal(activeUntil({ type: 'alert', timestamp: 7, visible_until: 42 }, T), 42);
  assert.equal(isActive({ type: 'alert', timestamp: 7, visible_until: 42 }, T, 43), false);
});

test('config values override defaults, bad values are ignored', () => {
  const terms = mergeTerms({ alert_ms: 1000, seat_update_ms: -5, voice_ms: 'x', unknown: 3 });
  assert.equal(terms.alert_ms, 1000);
  assert.equal(terms.seat_update_ms, T.seat_update_ms);
  assert.equal(terms.voice_ms, T.voice_ms);
  assert.equal(terms.unknown, undefined);
});

test('loadTerms reads the config node once a minute and falls back to defaults', async () => {
  resetTermsCache();
  let reads = 0;
  const db = { ref: path => ({ get: async () => { reads++; assert.equal(path, 'config/notification_terms'); return { val: () => ({ alert_ms: 5 }) }; } }) };
  assert.equal((await loadTerms(db, 1000)).alert_ms, 5);
  await loadTerms(db, 2000);
  assert.equal(reads, 1);
  await loadTerms(db, 1000 + 61000);
  assert.equal(reads, 2);
  resetTermsCache();
  const broken = { ref: () => ({ get: async () => { throw new Error('down'); } }) };
  assert.equal((await loadTerms(broken)).alert_ms, T.alert_ms);
  resetTermsCache();
});

test('expiry index entries carry the path, and null removes them', () => {
  assert.deepEqual(expiryEntry('n1', 'a/b', 9), { 'notification_expiry/n1': { at: 9, path: 'a/b' } });
  assert.deepEqual(expiryEntry('n1', 'a/b', null), { 'notification_expiry/n1': null });
});
