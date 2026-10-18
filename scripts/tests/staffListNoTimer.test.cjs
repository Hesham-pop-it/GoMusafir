const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/screens/participants/ParticipantsScreen.js'), 'utf8');

test('the staff participants list is not rebuilt on a timer', () => {
    assert.doesNotMatch(source, /setInterval\s*\(/);
});

test('the staff participants list rebuilds on participant, staff and foreground changes', () => {
    assert.match(source, /watchPath\(`trips_participants\/\$\{tripId\}`/);
    assert.match(source, /watchPath\(`orgs\/\$\{orgId\}\/staff`/);
    assert.match(source, /AppState\.addEventListener\('change'/);
});
