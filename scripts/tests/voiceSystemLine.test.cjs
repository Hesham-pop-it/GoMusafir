const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/utils/voiceSystemLine.js'), 'utf8');
const context = {};
vm.runInNewContext(source.replace(/export function/g, 'function') + '\nthis.api = { parseVoiceLine };', context);
const parse = (t) => JSON.parse(JSON.stringify(context.api.parseVoiceLine(t)));

test('parseVoiceLine reads the started line', () => {
    assert.deepEqual(parse('Voice chat started by Ustadh Hamza'), { kind: 'started', name: 'Ustadh Hamza' });
});
test('parseVoiceLine reads the ended line', () => {
    assert.deepEqual(parse('Voice chat ended · 42 min'), { kind: 'ended', minutes: 42 });
});
test('parseVoiceLine leaves other text alone', () => {
    assert.equal(parse('Hello'), null);
    assert.equal(parse(undefined), null);
});
