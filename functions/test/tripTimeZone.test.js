const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { resolveTripTimeZone } = require('../services/tripTimeZoneService');

for (const [location, zone] of [
  ['Pakistan', 'Asia/Karachi'], [' pakistan ', 'Asia/Karachi'], ['PK', 'Asia/Karachi'],
  ['Saudi Arabia', 'Asia/Riyadh'],
  ['Makkah, Saudi Arabia', 'Asia/Riyadh'], ['Mecca SA', 'Asia/Riyadh'],
  ['Madinah', 'Asia/Riyadh'], ['Karachi, Pakistan', 'Asia/Karachi'],
  ['London, UK', 'Europe/London'], ['London, Ontario, Canada', 'America/Toronto'],
  ['New York City, USA', 'America/New_York'], ['Sydney, Australia', 'Australia/Sydney'],
]) test(`resolves ${location}`, () => assert.equal(resolveTripTimeZone(location), zone));

test('does not guess for ambiguous, unknown or invalid destinations', () => {
  for (const destination of ['London', 'Springfield', 'Nowherezz', 'United States', 'Makkah, Canada', '', null, {}, 'a'.repeat(201)]) {
    assert.throws(() => resolveTripTimeZone(destination), error => error.code === 'invalid-argument');
  }
});
test('stored IANA zone follows daylight saving instead of freezing an offset', () => {
  const timeZone = resolveTripTimeZone('New York, US');
  const format = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
  assert.equal(format.format(new Date('2027-01-01T12:00:00Z')), '07');
  assert.equal(format.format(new Date('2027-07-01T12:00:00Z')), '08');
});

// Exercise the real creation/edit services with an isolated in-memory transaction.
function fixture() {
  let org = { prepaid_seats: 1000 };
  let id = 0;
  const db = { ref: () => ({
    push: () => ({ key: `trip-${++id}` }), update: async () => {}, set: async () => {},
    transaction: async mutate => {
      const next = mutate(structuredClone(org));
      if (next === undefined) return { committed: false };
      org = next;
      return { committed: true, snapshot: { val: () => org } };
    },
  }) };
  function load(file, overrides) {
    const filename = path.join(__dirname, '..', file);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, exports: module.exports, require: id => overrides[id] || localRequire(id),
    }, { filename });
    return module.exports;
  }
  const adminMock = { db, admin: { database: { ServerValue: { TIMESTAMP: 123 } } } };
  const seats = load('services/tripSeatService.js', { '../admin': adminMock });
  const creation = load('groups/tripCreationHelper.js', { '../admin': adminMock, '../services/tripSeatService': seats });
  return { ...creation, ...seats, org: () => org };
}
const start = Date.UTC(2027, 0, 1), end = Date.UTC(2027, 0, 10);
const input = { orgId: 'org', uid: 'host', title: 'Journey', destination: 'Makkah', startDate: start, endDate: end, totalSeats: 10 };
test('creation persists destination zone and preserves timestamps, ignoring a client override', async () => {
  const f = fixture();
  const { tripId } = await f.createTripRecord({ ...input, time_zone: 'Europe/London', timeZone: 'GMT +7' });
  const trip = f.org().trips[tripId];
  assert.equal(trip.time_zone, 'Asia/Riyadh');
  assert.equal(trip.time_zone_source, 'destination');
  assert.equal(trip.start_date, start);
  assert.equal(trip.end_date, end);
  assert.equal(trip.invite_expires_at, end);
});
test('editing destination refreshes zone atomically and backfills legacy trips on date edits', async () => {
  const f = fixture();
  const { tripId } = await f.createTripRecord(input);
  await f.changeTripSeats({ orgId: 'org', tripId, startDate: start, endDate: end, destination: 'London, UK' });
  assert.equal(f.org().trips[tripId].time_zone, 'Europe/London');
  assert.equal(f.org().trips[tripId].location, 'London, UK');
  delete f.org().trips[tripId].time_zone;
  await f.changeTripSeats({ orgId: 'org', tripId, endDate: end + 86400000 });
  assert.equal(f.org().trips[tripId].time_zone, 'Europe/London');
  assert.equal(f.org().trips[tripId].invite_expires_at, end + 86400000);
});
test('invalid destination does not deduct seats or mutate a trip', async () => {
  const f = fixture();
  await assert.rejects(f.createTripRecord({ ...input, destination: 'London' }), /different locations/);
  assert.equal(f.org().prepaid_seats, 1000);
  const { tripId } = await f.createTripRecord(input);
  const before = JSON.stringify(f.org());
  await assert.rejects(f.changeTripSeats({ orgId: 'org', tripId, endDate: end + 86400000, destination: 'Nowherezz' }));
  assert.equal(JSON.stringify(f.org()), before);
});
test('seat-only top-ups do not re-resolve or move legacy timestamps', async () => {
  const f = fixture();
  const { tripId } = await f.createTripRecord(input);
  f.org().trips[tripId].location = 'Historical itinerary';
  await f.changeTripSeats({ orgId: 'org', tripId, increment: 1 });
  assert.equal(f.org().trips[tripId].end_date, end);
  assert.equal(f.org().trips[tripId].time_zone, 'Asia/Riyadh');
});

test('multi-zone countries require a city instead of silently picking a zone', () => {
  for (const destination of ['United States', 'Canada', 'Australia']) {
    assert.throws(() => resolveTripTimeZone(destination), /multiple time zones/);
  }
});
test('country-only destination is stored on creation and when editing', async () => {
  const f = fixture();
  const { tripId } = await f.createTripRecord({ ...input, destination: 'Pakistan' });
  assert.equal(f.org().trips[tripId].location, 'Pakistan');
  assert.equal(f.org().trips[tripId].time_zone, 'Asia/Karachi');
  await f.changeTripSeats({ orgId: 'org', tripId, destination: 'Saudi Arabia', startDate: start, endDate: end });
  assert.equal(f.org().trips[tripId].time_zone, 'Asia/Riyadh');
  await f.changeTripSeats({ orgId: 'org', tripId, destination: 'Pakistan', startDate: start, endDate: end });
  assert.equal(f.org().trips[tripId].time_zone, 'Asia/Karachi');
  assert.equal(f.org().trips[tripId].end_date, end);
});
