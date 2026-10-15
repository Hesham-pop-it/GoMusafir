const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS_FILTERS, matchesStatusFilter } = require('../src/utils/tripStatusFilter');

const now = Date.UTC(2027, 5, 15, 12);
const H = 3600000;
const trip = (start, end, status = 'active') => ({ start_date: start, end_date: end, status });

const bucket = (t) => STATUS_FILTERS.filter(f => matchesStatusFilter(t, f, now));

test('future start is upcoming', () => {
  assert.deepEqual(bucket(trip(now + H, now + 5 * H)), ['upcoming']);
});
test('started and not yet ended is active', () => {
  assert.deepEqual(bucket(trip(now - H, now + H)), ['active']);
});
test('start exactly now is active, not upcoming', () => {
  assert.deepEqual(bucket(trip(now, now + H)), ['active']);
});
test('end is exclusive: now equal to end is ended', () => {
  assert.deepEqual(bucket(trip(now - H, now)), ['ended']);
  assert.deepEqual(bucket(trip(now - 5 * H, now - H)), ['ended']);
});
test('closed is ended and never active, whatever the dates', () => {
  assert.deepEqual(bucket(trip(now - H, now + H, 'closed')), ['ended']);
  assert.deepEqual(bucket(trip(now + H, now + 2 * H, 'closed')), ['ended']);
});
test('ISO date strings are accepted', () => {
  assert.deepEqual(bucket(trip('2027-06-14T00:00:00Z', '2027-06-20T00:00:00Z')), ['active']);
});
test('missing or invalid dates match nothing unless the status is not active', () => {
  assert.deepEqual(bucket({ status: 'active' }), []);
  assert.deepEqual(bucket({}), []);
  assert.deepEqual(bucket(null), []);
  assert.deepEqual(bucket(trip('nope', undefined)), []);
  assert.deepEqual(bucket(trip('nope', undefined, 'cancelled')), ['ended']);
  assert.deepEqual(bucket({ status: 'closed' }), ['ended']);
});
test('empty filter matches everything', () => {
  assert.equal(matchesStatusFilter({}, '', now), true);
});

test('any explicit status other than active is ended and never upcoming or active', () => {
  for (const status of ['closed', 'cancelled', 'archived']) {
    const t = { start_date: now - H, end_date: now + H, status };
    assert.equal(matchesStatusFilter(t, 'ended', now), true, String(status));
    assert.equal(matchesStatusFilter(t, 'active', now), false, String(status));
    assert.equal(matchesStatusFilter({ start_date: now + H, end_date: now + 2 * H, status }, 'upcoming', now), false, String(status));
  }
});

test('a missing status counts as active', () => {
  for (const status of [undefined, null, '']) {
    assert.equal(matchesStatusFilter({ start_date: now - H, end_date: now + H, status }, 'active', now), true, String(status));
    assert.equal(matchesStatusFilter({ start_date: now + H, end_date: now + 2 * H, status }, 'upcoming', now), true, String(status));
    assert.equal(matchesStatusFilter({ start_date: now - 2 * H, end_date: now - H, status }, 'ended', now), true, String(status));
  }
});
