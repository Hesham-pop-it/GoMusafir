const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('a person is in voice when either presence location says so', async () => {
  const code = fs.readFileSync(require.resolve('../services/voicePresenceService'), 'utf8');
  const run = async store => {
    const db = { ref: path => ({ get: async () => ({ val: () => store[path] ?? null }) }) };
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require: () => ({ db }) });
    return module.exports.isInVoice('o', 't', 'u');
  };
  assert.equal(await run({ 'trips_active/o/t/voice_presence/u': true }), true);
  assert.equal(await run({ 'trips_active/o/t/voice_channel/presence/u': true }), true);
  assert.equal(await run({}), false);
});
