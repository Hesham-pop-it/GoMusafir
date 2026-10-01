const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/utils/chatStaffRole.js'), 'utf8');
const context = {};
vm.runInNewContext(source.replace('export function', 'function'), context);
const { getChatStaffRole } = context;

test('only exact backend staff permissions receive organization badges', () => {
    for (const [role, label] of [['admin', 'Admin'], ['manager', 'Manager'], ['co-host', 'Co-Host']]) {
        assert.equal(getChatStaffRole({ user: role }, 'user'), label);
    }
    for (const role of [null, false, true, 'none', 'participant', 'Admin', { role: 'admin' }]) {
        assert.equal(getChatStaffRole({ user: role }, 'user'), null);
    }
    assert.equal(getChatStaffRole({}, 'user'), null);
    assert.equal(getChatStaffRole(null, 'user'), null);
    assert.equal(getChatStaffRole(Object.create({ user: 'admin' }), 'user'), null);
});

test('existing messages reflect promotion, role changes and removal from the live map', () => {
    const message = { sender_id: 'user', senderRole: 'admin', isAdmin: true };
    assert.equal(getChatStaffRole({}, message.sender_id), null);
    assert.equal(getChatStaffRole({ user: 'manager' }, message.sender_id), 'Manager');
    assert.equal(getChatStaffRole({ user: 'co-host' }, message.sender_id), 'Co-Host');
    assert.equal(getChatStaffRole({ user: 'none' }, message.sender_id), null);
    assert.equal(getChatStaffRole({}, message.sender_id), null);
});
