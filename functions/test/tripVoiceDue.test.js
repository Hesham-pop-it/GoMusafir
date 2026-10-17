const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { voiceDueAt } = require('../services/tripFeatureState');

test('voiceDueAt: live sessions every minute, idle trips at their next boundary, finished trips never', () => {
  assert.equal(voiceDueAt(null), null);
  assert.equal(voiceDueAt({ session: { id: 's' }, nextCheckAt: 99 }), 0);
  assert.equal(voiceDueAt({ session: null, nextCheckAt: 5000 }), 5000);
  assert.equal(voiceDueAt({ session: null, nextCheckAt: 0, voiceAccess: 'EXPIRED' }), null);
});

function load(data) {
  const sets = [], removes = [], queries = [], reconciled = [];
  const snap = v => ({ val: () => v });
  const db = { ref: path => ({
    get: async () => snap(data[path]),
    set: async value => { sets.push([path, value]); },
    remove: async () => { removes.push(path); },
    orderByChild: field => ({ endAt: limit => ({ get: async () => {
      queries.push(`${path}.${field}<=${limit}`);
      return snap(Object.fromEntries(Object.entries(data[path] || {}).filter(([, v]) => v[field] <= limit)));
    } }) }),
  }) };
  const file = require.resolve('../groups/tripFeatureFunctions.js');
  const deps = {
    '../middleware/participantAccessMiddleware': { onCall: (o, h) => h },
    'firebase-functions/v2/database': { onValueWritten: (o, h) => h },
    'firebase-functions/v2/tasks': { onTaskDispatched: (o, h) => h },
    'firebase-functions/v2/scheduler': { onSchedule: (o, h) => h },
    'firebase-admin/functions': {},
    '../services/participantAccessService': {},
    '../admin': { db },
    '../services/tripVoiceService': { refreshFeatures() {}, accessRef: (o, t) => db.ref(`trip_feature_access/${o}/${t}`),
      reconcileSession: async (o, t) => { reconciled.push(t); } },
    '../services/tripFeatureState': { voiceDueAt },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, console, Date,
    require: name => deps[name] }, { filename: file });
  return { fns: module.exports, sets, removes, queries, reconciled };
}

test('the minute job reconciles only trips listed as due', async () => {
  const f = load({ trip_voice_due: { a: { orgId: 'o', dueAt: 0 }, b: { orgId: 'o', dueAt: Date.now() + 3600000 } } });
  await f.fns.reconcileTripVoiceAccess();
  assert.deepEqual(f.reconciled, ['a']);
  assert.equal(f.queries.length, 1);
});

test('the access trigger keeps the due list in step and skips writes that change nothing', async () => {
  const f = load({});
  const write = (before, after) => f.fns.onTripFeatureAccessChanged({ params: { orgId: 'o', tripId: 't' },
    data: { before: { val: () => before }, after: { val: () => after } } }).catch(() => {});
  await write({ session: null, nextCheckAt: 5000 }, { session: { id: 's' }, nextCheckAt: 9000 });
  assert.equal(JSON.stringify(f.sets), JSON.stringify([['trip_voice_due/t', { orgId: 'o', dueAt: 0 }]]));
  f.sets.length = 0;
  await write({ session: { id: 's' }, nextCheckAt: 1 }, { session: { id: 's' }, nextCheckAt: 2 });
  assert.equal(f.sets.length, 0);
  await write({ session: { id: 's' } }, null);
  assert.deepEqual(f.removes, ['trip_voice_due/t']);
});
