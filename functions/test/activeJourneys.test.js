const test = require('node:test');
const assert = require('node:assert/strict');
const { findActiveJourneys } = require('../services/activeJourneys');
const { createFakeDb } = require('./support/fakeDb');

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

test('active and upcoming journeys are listed, ended, closed and malformed ones are not', async () => {
  const db = createFakeDb({ orgs: { o: { trips: {
    running: { title: 'Umrah', status: 'active', start_date: NOW - DAY, end_date: NOW + DAY },
    upcoming: { title: 'Hajj', status: 'active', start_date: NOW + 10 * DAY, end_date: NOW + 20 * DAY },
    ended: { title: 'Old', status: 'active', start_date: NOW - 9 * DAY, end_date: NOW - DAY },
    closed: { title: 'Closed', status: 'closed', start_date: NOW - DAY, end_date: NOW + DAY },
    broken: { title: 'No dates', status: 'active' },
  } } } });
  const list = await findActiveJourneys(db, 'o', NOW);
  assert.deepEqual(list.map(j => j.tripId), ['running', 'upcoming']);
  assert.equal(list[0].title, 'Umrah');
});
test('an organisation without journeys returns an empty list', async () => {
  assert.deepEqual(await findActiveJourneys(createFakeDb({}), 'o', NOW), []);
});
test('a journey ending exactly now no longer blocks', async () => {
  const db = createFakeDb({ orgs: { o: { trips: { t: { status: 'active', end_date: NOW } } } } });
  assert.deepEqual(await findActiveJourneys(db, 'o', NOW), []);
});
