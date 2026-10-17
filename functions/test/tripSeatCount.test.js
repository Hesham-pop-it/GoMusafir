const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function run(after) {
  const calls = [];
  const db = { ref: path => ({ set: async v => calls.push(['set', path, v]), remove: async () => calls.push(['remove', path]) }) };
  const deps = { 'firebase-functions/v2/database': { onValueWritten: (o, h) => h }, '../admin': { db },
    '../services/tripCapacity': require('../services/tripCapacity') };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../groups/tripSeatCountFunctions.js'), 'utf8'),
    { module, exports: module.exports, require: n => deps[n] });
  return module.exports.onTripMembersCounted({ params: { tripId: 't' }, data: { after: { val: () => after } } }).then(() => calls);
}
test('the member count is recomputed from the list and ignores removed members', async () => {
  assert.equal(JSON.stringify(await run({ a: true, b: true, c: false })), JSON.stringify([['set', 'trip_seat_counts/t', 2]]));
});
test('deleting the membership list removes the count', async () => {
  assert.equal(JSON.stringify(await run(null)), JSON.stringify([['remove', 'trip_seat_counts/t']]));
});
