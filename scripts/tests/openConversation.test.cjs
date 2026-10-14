const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '../../src/utils', f), 'utf8');
const strip = (src) => src.replace(/^import .*$/gm, '').replace(/export const/g, 'const').replace(/export (async )?function/g, '$1function');
const context = {};
vm.runInNewContext(`${strip(read('messagingRules.js'))}\n${strip(read('openConversation.js'))}\nthis.api = { decideOpen, openConversation, staffPrivateConversation, openStaffPrivate };`, context);
const { decideOpen, openConversation, staffPrivateConversation, openStaffPrivate } = context.api;
const plain = (v) => JSON.parse(JSON.stringify(v));

const base = { viewerUid: 'me', viewerIsStaff: false, inbox: {} };
const pilgrim = { id: 'p1', name: 'Omar Farouk', image: 'x', isStaff: false, nameVisible: true };

test('pilgrim with no thread opens the request composer', () => {
    const d = plain(decideOpen({ ...base, target: pilgrim }));
    assert.equal(d.route, 'ComposeRequest');
    assert.equal(d.params.targetUid, 'p1');
});

test('staff target opens my Journey team thread', () => {
    const d = plain(decideOpen({ ...base, target: { ...pilgrim, isStaff: true } }));
    assert.deepEqual(d, { route: 'TripChat', params: { conversation: { kind: 'team', id: 'me', title: 'Journey team' } } });
});

test('hidden name opens nothing', () => {
    assert.equal(decideOpen({ ...base, target: { ...pilgrim, nameVisible: false } }), null);
});

test('self opens nothing', () => {
    assert.equal(decideOpen({ ...base, target: { ...pilgrim, id: 'me' } }), null);
});

test('accepted chat opens the dm thread', () => {
    const d = plain(decideOpen({ ...base, target: pilgrim, inbox: { me_p1: { kind: 'dm' } } }));
    assert.equal(d.route, 'TripChat');
    assert.equal(d.params.conversation.id, 'me_p1');
    assert.equal(d.params.conversation.pending, undefined);
});

test('request I sent opens the dm pending', () => {
    const d = plain(decideOpen({ ...base, target: pilgrim, inbox: { me_p1: { kind: 'request_out' } } }));
    assert.equal(d.params.conversation.pending, true);
});

test('recipients of a pending or declined request go to review, never the locked chat', () => {
    for (const kind of ['request_in', 'declined']) {
        const d = plain(decideOpen({ ...base, target: pilgrim, inbox: { me_p1: { kind } } }));
        assert.equal(d.route, 'RequestReview');
        assert.equal(d.params.threadId, 'me_p1');
    }
});

test('staff viewer opens the pilgrim team thread and nothing for staff', () => {
    const d = plain(decideOpen({ ...base, viewerIsStaff: true, target: pilgrim }));
    assert.deepEqual(d.params.conversation, { kind: 'team', id: 'p1', title: 'Omar Farouk' });
    assert.equal(decideOpen({ ...base, viewerIsStaff: true, target: { ...pilgrim, isStaff: true } }), null);
});

test('openConversation navigates with the trip', () => {
    const calls = [];
    const nav = { navigate: (...a) => calls.push(a) };
    assert.equal(openConversation(nav, { id: 't' }, { ...base, target: pilgrim }), true);
    assert.equal(calls[0][0], 'ComposeRequest');
    assert.equal(calls[0][1].trip.id, 't');
    assert.equal(openConversation(nav, { id: 't' }, { ...base, target: { ...pilgrim, nameVisible: false } }), false);
    assert.equal(calls.length, 1);
});

test('staffPrivateConversation is a dm keyed by both uids and flagged as a staff chat', () => {
    const c = plain(staffPrivateConversation('me', { id: 'a1', name: 'Maryam S', image: 'img' }));
    assert.deepEqual(c, { kind: 'dm', id: 'a1_me', title: 'Maryam S', avatar: 'img', peerUid: 'a1', staff: true });
});

test('openStaffPrivate creates the chat first, then opens it', async () => {
    const calls = [];
    const navigation = { navigate: (route, params) => calls.push(['navigate', route, plain(params)]) };
    await openStaffPrivate(navigation, { id: 't1' }, { viewerUid: 'me', target: { id: 'a1', name: 'Maryam S' }, openChat: async (args) => calls.push(['open', args]) });
    assert.deepEqual(plain(calls[0]), ['open', { tripId: 't1', targetUid: 'a1' }]);
    assert.equal(calls[1][1], 'TripChat');
    assert.equal(calls[1][2].conversation.id, 'a1_me');
    await assert.rejects(openStaffPrivate(navigation, { id: 't1' }, { viewerUid: 'me', target: { id: 'a1' }, openChat: async () => { throw new Error('no'); } }));
    assert.equal(calls.length, 2);
});
