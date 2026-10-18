const test = require('node:test');
const assert = require('node:assert/strict');

function fresh() {
  delete require.cache[require.resolve('../services/userRecordCache')];
  return require('../services/userRecordCache');
}
function fakeDb() {
  const reads = [];
  let fail = false;
  return { reads, failNext: () => { fail = true; }, ref: path => ({ get: async () => {
    reads.push(path);
    if (fail) { fail = false; throw new Error('read failed'); }
    return { val: () => ({ path, n: reads.length }) };
  } }) };
}

test('records are shared within the TTL and read again after it', async () => {
  const { cachedUser, TTL_MS } = fresh();
  const db = fakeDb();
  const a = await cachedUser(db, 'u1', 1000);
  const b = await cachedUser(db, 'u1', 1000 + TTL_MS - 1);
  assert.equal(a, b);
  assert.deepEqual(db.reads, ['users/u1']);
  await cachedUser(db, 'u1', 1000 + TTL_MS);
  await cachedUser(db, 'u2', 1000 + TTL_MS);
  assert.deepEqual(db.reads, ['users/u1', 'users/u1', 'users/u2']);
});

test('a failed read is not kept', async () => {
  const { cachedUser } = fresh();
  const db = fakeDb();
  db.failNext();
  await assert.rejects(cachedUser(db, 'u1', 0));
  await new Promise(done => setImmediate(done));
  assert.equal((await cachedUser(db, 'u1', 1)).val().n, 2);
});

test('the cache is bounded and drops the oldest records first', async () => {
  const { cachedUser, MAX_ENTRIES } = fresh();
  const db = fakeDb();
  for (let i = 0; i <= MAX_ENTRIES; i++) await cachedUser(db, `u${i}`, 0);
  const reads = db.reads.length;
  await cachedUser(db, `u${MAX_ENTRIES}`, 0);
  assert.equal(db.reads.length, reads);
  await cachedUser(db, 'u0', 0);
  assert.equal(db.reads.length, reads + 1);
});
