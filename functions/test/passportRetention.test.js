const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const DAY = 86400000, THIRTY = 30 * DAY;
// A tiny in-memory database: just the reads and writes runRetention and purgeTrip make.
function fakeDb(tree) {
  const get = path => path.split('/').reduce((n, k) => (n == null ? n : n[k]), tree);
  const sets = [];
  const ref = path => ({
    get: async () => ({ val: () => (get(path) === undefined ? null : get(path)) }),
    set: async value => sets.push([path, value]),
    update: async map => sets.push(['update', map]),
    orderByChild: () => ({ limitToFirst: () => ({ get: async () => ({ val: () => tree[path] }) }), endAt: () => ({ limitToFirst: () => ({ get: async () => ({ val: () => ({}) }) }) }) }),
  });
  return { db: { ref }, sets };
}
function load(tree) {
  const f = fakeDb(tree);
  const original = Module._load;
  Module._load = function (request, ...rest) {
    if (request === '../../admin') return { db: f.db, auth: {}, admin: { storage: () => ({ bucket: () => ({ deleteFiles: async () => {} }) }) } };
    return original.call(this, request, ...rest);
  };
  delete require.cache[require.resolve('../services/passport/passportRetention')];
  const mod = require('../services/passport/passportRetention');
  Module._load = original;
  return { ...mod, sets: f.sets };
}

test('the deadline is the earlier of the stored one and 30 days after the current end', () => {
  const { effectiveDeadline } = load({});
  assert.equal(effectiveDeadline(1000 + THIRTY, 1000), 1000 + THIRTY);
  assert.equal(effectiveDeadline(1000 + THIRTY, 5000 + 10 * DAY), 1000 + THIRTY, 'an extended trip does not push the deadline back');
  assert.equal(effectiveDeadline(9000 + THIRTY, 1000), 1000 + THIRTY, 'a shortened trip brings it forward');
  assert.equal(effectiveDeadline(7, undefined), 7);
  assert.equal(effectiveDeadline(undefined, 1000), 1000 + THIRTY);
});

test('runRetention purges a due trip, brings a shortened one forward and leaves the rest', async () => {
  const now = 100 * DAY;
  const tree = {
    passport_retention: {
      due: { org_id: 'o', delete_after: now - DAY },
      extended: { org_id: 'o', delete_after: now - DAY },
      shortened: { org_id: 'o', delete_after: now + 40 * DAY },
      later: { org_id: 'o', delete_after: now + 20 * DAY },
    },
    orgs: { o: { trips: {
      due: { end_date: now - 31 * DAY }, extended: { end_date: now + 5 * DAY },
      shortened: { end_date: now - 2 * DAY }, later: { end_date: now - 5 * DAY },
    } } },
  };
  const r = load(tree);
  const result = await r.runRetention({ now });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { trips: 2, people: 0, advanced: 1 });
  const advanced = r.sets.find(([path]) => path === 'passport_retention/shortened/delete_after');
  assert.equal(advanced[1], now - 2 * DAY + THIRTY);
  assert.equal(r.sets.some(([path]) => path === 'passport_retention/later/delete_after'), false);
});
