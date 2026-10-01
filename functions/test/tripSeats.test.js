const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { seatUsage, selectedDateRange, DAY_MS } = require('../services/tripSeatMath');
const start = Date.UTC(2027, 0, 1);
for (const [days, periods] of [[1,1],[30,1],[31,2],[45,2],[60,2],[61,3],[90,3],[91,4],[365,13]]) {
  test(`${days} days bills ${periods} periods per participant`, () => {
    assert.deepEqual(seatUsage(start, start + days * DAY_MS, 10), {
      durationDays: days, seatPeriods: periods, requiredSeats: periods * 10, participants: 10,
    });
  });
}
test('every started period counts, including a partial final day', () => {
  assert.equal(seatUsage(start, start + 30 * DAY_MS + 1, 10).requiredSeats, 20);
});
test('inclusive calendar dates are stable across DST, leap day and same-day trips', () => {
  for (const [first, last, days] of [['2027-01-01','2027-01-30',30], ['2027-01-01','2027-02-14',45],
    ['2028-02-28','2028-03-01',3], ['2027-03-01','2027-03-30',30], ['2027-10-01','2027-10-30',30], ['2027-01-01','2027-01-01',1]]) {
    const dates = selectedDateRange(first, last);
    assert.equal(seatUsage(dates.startDate, dates.endDate, 1).durationDays, days);
  }
});
test('invalid dates and quantities cannot be billed', () => {
  for (const args of [[start,start,1], [start,start-1,1], [NaN,start,1], [start,Infinity,1],
    [start,start+DAY_MS,0], [start,start+DAY_MS,-1], [start,start+DAY_MS,1.5],
    [start,start+DAY_MS,'10abc'], [start,start+DAY_MS,Number.MAX_SAFE_INTEGER+1]]) {
    assert.throws(() => seatUsage(...args));
  }
  assert.ok(Number.isNaN(selectedDateRange('2027-02-29','2027-03-01').startDate));
});
test('web, app and backend use identical seat calculations', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/tripSeatMath.js'), 'utf8');
  for (const target of ['../../src/utils/tripSeatMath.js','../../GoMusafir-Website/lib/tripSeatMath.js']) {
    assert.equal(fs.readFileSync(path.join(__dirname,target),'utf8'),source);
  }
});
