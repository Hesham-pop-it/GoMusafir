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

function fakeDb(data) {
  const reads = [], updates = [];
  const get = path => path.split('/').reduce((v, k) => v?.[k], data);
  return { reads, updates, db: { ref: path => ({
    once: async () => { reads.push(path); const v = get(path); return { exists: () => v != null, val: () => v }; },
    update: async values => { updates.push({ path, values }); },
  }) } };
}
function loadWith(db) {
  const file = path.join(__dirname, '../groups/dashboardStatsFunctions.js');
  const dependencies = {
    'firebase-functions/v2/https': { HttpsError: Error },
    '../middleware/participantAccessMiddleware': { onCall: (opts, handler) => handler },
    'firebase-functions/v2/database': { onValueWritten: (opts, handler) => handler },
    'firebase-functions/v2/scheduler': { onSchedule: (opts, handler) => handler },
    '../admin': { admin: { database: { ServerValue: { TIMESTAMP: 'now' } } }, db },
    '../services/analyticsMetricsService': { getPaymentAmountInEur: p => p.amount, calculateCompanyMetrics: () => [] },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, console,
    require: name => dependencies[name] ?? require(name) }, { filename: file });
  return module.exports;
}
test('joins no longer trigger a stats recalculation', () => {
  const { tripStatsChanged } = load();
  const trip = { title: 'Umrah', participants: 1 };
  assert.equal(tripStatsChanged(trip, { ...trip, participants: 2 }), false);
});
test('trigger path reads only the small org children and never trips_active', async () => {
  const f = fakeDb({ orgs: { o: { metadata: { name: 'x' }, dashboard_stats: { updated_at: 1 },
    payments: { p: { amount: 10.5, gateway: 'stripe' } }, staff: { a: 'admin', b: 'manager' },
    trips: { t: { status: 'active', participants: 3, total_seats: 6 } }, checkout_sessions: { c1: 1, c2: 2 } } } });
  await loadWith(f.db).updateHeadlineStats('o');
  assert.ok(f.reads.every(path => path.startsWith('orgs/o/') && !path.endsWith('/o')));
  const values = f.updates[0].values;
  assert.equal(f.updates[0].path, 'orgs/o/dashboard_stats');
  assert.equal(values.financial.totalRevenue, 10.5);
  assert.equal(values.users.totalAccounts, 2);
  assert.equal(values['participants/registered'], 3);
  assert.equal(values.seats.utilisationPercentage, 50);
  assert.equal(values.payments.conversionRate, 50);
  assert.equal(values.detailed_metrics, undefined);
});
test('trigger path writes nothing before the first full calculation or for a missing org', async () => {
  const none = fakeDb({ orgs: { o: { metadata: { name: 'x' }, payments: {} } } });
  await loadWith(none.db).updateHeadlineStats('o');
  assert.equal(none.updates.length, 0);
  const gone = fakeDb({ orgs: { o: { dashboard_stats: { updated_at: 1 } } } });
  await loadWith(gone.db).updateHeadlineStats('o');
  assert.equal(gone.updates.length, 0);
});
