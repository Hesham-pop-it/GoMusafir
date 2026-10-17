const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load() {
  const file = path.join(__dirname, '../groups/dashboardStatsFunctions.js');
  const dependencies = {
    'firebase-functions/v2/https': { HttpsError: Error },
    '../middleware/participantAccessMiddleware': { onCall: (opts, handler) => handler },
    'firebase-functions/v2/database': { onValueWritten: (opts, handler) => handler },
    'firebase-functions/v2/scheduler': { onSchedule: (opts, handler) => handler },
    '../admin': { admin: {}, db: {} },
    '../services/analyticsMetricsService': {},
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, console,
    require: name => dependencies[name] ?? require(name) }, { filename: file });
  return module.exports;
}
test('dashboard stats skip live trip writes but follow fields the stats show', () => {
  const { tripStatsChanged } = load();
  const trip = { title: 'Umrah', status: 'active', end_date: 1 };
  assert.equal(tripStatsChanged(trip, { ...trip, live_data: { x: 1 } }), false);
  assert.equal(tripStatsChanged(trip, { ...trip, title: 'Umrah March' }), true);
  assert.equal(tripStatsChanged(trip, { ...trip, completed_at: 2 }), true);
  assert.equal(tripStatsChanged(trip, { ...trip, returnDate: '2026-11-01' }), true);
  assert.equal(tripStatsChanged(null, trip), true);
  assert.equal(tripStatsChanged(trip, null), true);
});
