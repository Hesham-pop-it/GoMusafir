const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Every function messagingFunctions.js exports must be re-exported by index.js, or it is never deployed.
test('index.js re-exports every messaging function', () => {
  const source = fs.readFileSync(path.join(__dirname, '../groups/messagingFunctions.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
  const defined = [...source.matchAll(/^exports\.(\w+)\s*=/gm)].map(m => m[1]).sort();
  const list = index.match(/require\('\.\/groups\/messagingFunctions'\);\s*for \(const name of \[([^\]]*)\]/);
  assert.ok(list, 'messaging export loop not found in index.js');
  const exported = [...list[1].matchAll(/'(\w+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(exported, defined);
});
