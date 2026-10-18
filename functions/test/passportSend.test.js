const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
// Pure helpers only: the database handle is never touched, so the admin module is replaced.
const original = Module._load;
Module._load = function (request, ...rest) {
  if (request === '../../admin') return { db: {}, auth: {}, admin: {} };
  return original.call(this, request, ...rest);
};
const { dueAt, cleanSettings, DEFAULT_SETTINGS, queueKey } = require('../services/passport/passportSend');
Module._load = original;

const HOUR = 3600000, DAY = 24 * HOUR;
test('send timing counts from the moment of joining', () => {
  assert.equal(dueAt({ mode: 'direct' }, 1000), 1000);
  assert.equal(dueAt({ mode: 'hours', amount: 6 }, 1000), 1000 + 6 * HOUR);
  assert.equal(dueAt({ mode: 'days', amount: 2 }, 1000), 1000 + 2 * DAY);
  assert.equal(dueAt({ mode: 'manual', amount: 0 }, 1000), null);
});
test('organisations start on manual so nothing goes out by surprise', () => {
  assert.equal(DEFAULT_SETTINGS.mode, 'manual');
});
test('settings are cleaned: known mode, whole delay in range, known language', () => {
  assert.deepEqual(cleanSettings({ mode: 'days', amount: 3 }), { mode: 'days', amount: 3, lang: 'en' });
  assert.deepEqual(cleanSettings({ mode: 'direct', amount: 99 }), { mode: 'direct', amount: 0, lang: 'en' });
  assert.deepEqual(cleanSettings({ lang: 'nl' }, { mode: 'hours', amount: 5, lang: 'en' }), { mode: 'hours', amount: 5, lang: 'nl' });
  for (const input of [{ mode: 'weekly' }, { mode: 'hours' }, { mode: 'hours', amount: 0 }, { mode: 'hours', amount: 1.5 }, { mode: 'days', amount: 61 }, { mode: 'hours', amount: 337 }, { lang: 'xx' }]) {
    assert.throws(() => cleanSettings(input), e => e.code === 'invalid-argument', JSON.stringify(input));
  }
});
test('a queue entry is one per trip and person', () => {
  assert.equal(queueKey('t1', 'u1'), 't1_u1');
});
