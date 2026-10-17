const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../scripts/eraseAccountNow');

test('the erase script refuses to run without uid, operator, reason and ticket', () => {
  assert.throws(() => parseArgs(['--uid', 'u1']), /--operator, --reason, --ticket/);
  assert.throws(() => parseArgs(['--uid', 'u1', '--operator', 'a', '--reason', '--apply', '--ticket', 't']), /--reason/);
});
test('the erase script is a dry run unless --apply is given', () => {
  const base = ['--uid', 'u1', '--operator', 'abdullah', '--reason', 'GDPR art. 17', '--ticket', 'SUP-7'];
  assert.deepEqual(parseArgs(base), { apply: false, uid: 'u1', operator: 'abdullah', reason: 'GDPR art. 17', ticket: 'SUP-7' });
  assert.equal(parseArgs([...base, '--apply']).apply, true);
});
