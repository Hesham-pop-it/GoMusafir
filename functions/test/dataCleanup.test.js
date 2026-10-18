const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(data) {
  const queries = [], updates = [];
  const db = { ref: node => {
    if (!node) return { update: async values => { updates.push(values); } };
    return { orderByChild: field => ({ endAt: limit => ({ once: async () => {
      queries.push(`${node}.${field}<=${limit}`);
      const rows = Object.entries(data[node] || {}).filter(([, v]) => v[field] == null || v[field] <= limit);
      return { exists: () => rows.length > 0, forEach: fn => rows.forEach(([key, value]) => fn({ key, val: () => value })) };
    } }) }) };
  } };
  const file = path.join(__dirname, '../groups/systemFunctions.js');
  const dependencies = {
    'firebase-functions/v2': {},
    'firebase-functions/v2/scheduler': { onSchedule: (opts, handler) => handler },
    'firebase-functions/v2/database': { onValueCreated: (opts, handler) => handler },
    '../admin': { db },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, console, Date,
    require: name => dependencies[name] ?? { onCall: (o, h) => h, verifyAppCheck() {}, requireRole() {}, HttpsError: Error } },
  { filename: file });
  return { cron: module.exports.dataCleanupCron, queries, updates };
}
test('daily cleanup prunes expired invites, old codes and finished email windows by index', async () => {
  const now = Date.now(), day = 24 * 60 * 60 * 1000;
  const f = load({
    invites: { old: { expires_at: now - 1000 }, live: { expires_at: now + 1000 } },
    otp_codes: { stale: { expiresAt: now - 2 * day }, recent: { expiresAt: now - 1000 },
      locked: { expiresAt: now - 2 * day, lockedUntil: now + 60000 } },
    otp_email_rate: { old: { start: now - 2 * day, count: 3 }, fresh: { start: now - 1000, count: 1 } },
  });
  await f.cron();
  assert.deepEqual(f.queries.map(q => q.split('<=')[0]), ['invites.expires_at', 'otp_codes.expiresAt', 'otp_email_rate.start']);
  const removed = Object.assign({}, ...f.updates);
  assert.deepEqual(Object.keys(removed).sort(), ['invites/old', 'otp_codes/stale', 'otp_email_rate/old']);
  assert.ok(Object.values(removed).every(v => v === null));
});
