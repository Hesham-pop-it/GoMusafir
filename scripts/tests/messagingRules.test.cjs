const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/utils/messagingRules.js'), 'utf8');
const context = {};
vm.runInNewContext(source.replace(/export function/g, 'function') + '\nthis.api = { threadIdFor, canRequest, detailButtonFor, inboxSort, totalUnread, teamRowState };', context);
const { threadIdFor, canRequest, detailButtonFor, inboxSort, totalUnread, teamRowState } = context.api;

// Results come from another vm realm, so compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

const pilgrim = { viewerIsStaff: false, targetIsStaff: false, isSelf: false, nameVisible: true };

test('threadIdFor is order independent and sorted', () => {
    assert.equal(threadIdFor('b', 'a'), 'a_b');
    assert.equal(threadIdFor('a', 'b'), threadIdFor('b', 'a'));
});

test('canRequest allows a visible pilgrim who is not blocked', () => {
    assert.equal(canRequest({ ...pilgrim, blocked: false }), true);
});
test('canRequest rejects self, staff on either side, hidden name and blocks', () => {
    assert.equal(canRequest({ ...pilgrim, isSelf: true }), false);
    assert.equal(canRequest({ ...pilgrim, viewerIsStaff: true }), false);
    assert.equal(canRequest({ ...pilgrim, targetIsStaff: true }), false);
    assert.equal(canRequest({ ...pilgrim, nameVisible: false }), false);
    assert.equal(canRequest({ ...pilgrim, blocked: true }), false);
});

test('detailButtonFor is null for self and hidden names', () => {
    assert.equal(detailButtonFor({ ...pilgrim, isSelf: true }), null);
    assert.equal(detailButtonFor({ ...pilgrim, viewerIsStaff: true, isSelf: true }), null);
    assert.equal(detailButtonFor({ ...pilgrim, nameVisible: false }), null);
});
test('detailButtonFor staff viewer messages pilgrims only', () => {
    assert.equal(detailButtonFor({ ...pilgrim, viewerIsStaff: true }), 'message_staff');
    assert.equal(detailButtonFor({ ...pilgrim, viewerIsStaff: true, targetIsStaff: true }), null);
});
test('detailButtonFor pilgrim viewing staff opens the team thread', () => {
    assert.equal(detailButtonFor({ ...pilgrim, targetIsStaff: true }), 'team');
});
test('detailButtonFor follows the inbox row kind', () => {
    assert.equal(detailButtonFor({ ...pilgrim, inboxRow: { kind: 'dm' } }), 'open_chat');
    assert.equal(detailButtonFor({ ...pilgrim, inboxRow: { kind: 'request_out' } }), 'waiting');
    assert.equal(detailButtonFor({ ...pilgrim, inboxRow: { kind: 'request_in' } }), 'accept');
    assert.equal(detailButtonFor({ ...pilgrim, inboxRow: { kind: 'declined' } }), 'accept');
});
test('detailButtonFor offers a request when there is no row', () => {
    assert.equal(detailButtonFor({ ...pilgrim, inboxRow: null }), 'request');
    assert.equal(detailButtonFor({ ...pilgrim }), 'request');
});

test('inboxSort puts newest first', () => {
    const out = inboxSort([{ id: 1, last_at: 10 }, { id: 2, last_at: 30 }, { id: 3, last_at: 20 }]);
    assert.deepEqual(out.map((r) => r.id), [2, 3, 1]);
});
test('inboxSort is stable for equal times and does not mutate', () => {
    const rows = [{ id: 1, last_at: 5 }, { id: 2, last_at: 5 }, { id: 3, last_at: 5 }];
    assert.deepEqual(inboxSort(rows).map((r) => r.id), [1, 2, 3]);
    assert.deepEqual(rows.map((r) => r.id), [1, 2, 3]);
});
test('inboxSort handles missing input and missing last_at', () => {
    assert.deepEqual(plain(inboxSort(undefined)), []);
    assert.deepEqual(inboxSort([{ id: 1 }, { id: 2, last_at: 1 }]).map((r) => r.id), [2, 1]);
});

test('totalUnread sums group, team and inbox', () => {
    assert.equal(totalUnread({ groupUnread: 2, teamUnread: 3, inboxRows: [{ kind: 'dm', unread: 4 }] }), 9);
});
test('totalUnread counts a request_in as at least one', () => {
    assert.equal(totalUnread({ inboxRows: [{ kind: 'request_in', unread: 0 }] }), 1);
    assert.equal(totalUnread({ inboxRows: [{ kind: 'request_in', unread: 3 }] }), 3);
});
test('totalUnread ignores declined rows and tolerates empty input', () => {
    assert.equal(totalUnread({ inboxRows: [{ kind: 'declined', unread: 5 }] }), 0);
    assert.equal(totalUnread({}), 0);
    assert.equal(totalUnread(), 0);
});

test('teamRowState is none without meta', () => {
    assert.deepEqual(plain(teamRowState(null, 'me')), { state: 'none', repliedBy: null, role: null });
    assert.equal(teamRowState({}, 'me').state, 'none');
});
test('teamRowState needs_reply', () => {
    const s = teamRowState({ last_at: 1, needs_reply: true, replied_by: 'Sam' }, 'me');
    assert.equal(s.state, 'needs_reply');
    assert.equal(s.repliedBy, null);
});
test('teamRowState replied by me reads you', () => {
    const s = teamRowState({ last_at: 1, needs_reply: false, replied_by: 'Sam', replied_by_uid: 'me', replied_role: 'admin' }, 'me');
    assert.equal(s.state, 'replied');
    assert.equal(s.repliedBy, 'you');
    assert.equal(s.role, 'admin');
});
test('teamRowState replied by another staff reads their name', () => {
    const s = teamRowState({ last_at: 1, needs_reply: false, replied_by: 'Sam', replied_by_uid: 'x', replied_role: 'co-host' }, 'me');
    assert.equal(s.repliedBy, 'Sam');
    assert.equal(s.role, 'co-host');
});
