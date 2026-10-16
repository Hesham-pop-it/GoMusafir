const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '../../src/utils', f), 'utf8');
const strip = (src) => src.replace(/^import .*$/gm, '').replace(/export const/g, 'const').replace(/export function/g, 'function');
const context = {};
vm.runInNewContext(`${strip(read('messagingRules.js'))}\n${strip(read('messagingNotificationTarget.js'))}\nthis.api = { messagingNotificationTarget };`, context);
const { messagingNotificationTarget } = context.api;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('dm_request opens the request review, deriving the thread from the sender for in-app items', () => {
    const t = plain(messagingNotificationTarget('dm_request', { senderUid: 'a', name: 'Aisha' }, 'me'));
    assert.equal(t.route, 'RequestReview');
    assert.deepEqual(t.params, { threadId: 'a_me', peerUid: 'a', name: 'Aisha' });
});

test('dm_request from push data uses the conversation id; without a sender it opens the requests list', () => {
    const t = plain(messagingNotificationTarget('dm_request', { data: { conversationId: 'a_me', senderUid: 'a', name: 'Aisha', senderImage: 'img' } }, 'me'));
    assert.equal(t.params.threadId, 'a_me');
    assert.equal(t.params.avatar, 'img');
    assert.equal(messagingNotificationTarget('dm_request', {}, 'me').route, 'MessageRequests');
});

test('dm_message opens the direct conversation', () => {
    const t = plain(messagingNotificationTarget('dm_message', { conversationId: 'a_me', senderUid: 'a', name: 'Aisha' }, 'me'));
    assert.deepEqual(t, { route: 'TripChat', params: { conversation: { kind: 'dm', id: 'a_me', title: 'Aisha', peerUid: 'a' } } });
});

test('team_message opens the team thread: own thread for a pilgrim, the pilgrim thread for staff', () => {
    const mine = plain(messagingNotificationTarget('team_message', { senderUid: 'staff1', name: 'Maryam' }, 'me'));
    assert.deepEqual(mine.params.conversation, { kind: 'team', id: 'me', title: 'Journey team' });
    const staff = plain(messagingNotificationTarget('team_message', { data: { conversationId: 'p1', name: 'Omar' } }, 'staff1'));
    assert.deepEqual(staff.params.conversation, { kind: 'team', id: 'p1', title: 'Omar' });
});

test('staff_chat, message_report and unknown types', () => {
    assert.equal(messagingNotificationTarget('staff_chat', {}, 'me').params.conversation.kind, 'staff');
    assert.equal(messagingNotificationTarget('message_report', {}, 'me').route, 'Messages');
    assert.equal(messagingNotificationTarget('message_report', {}, 'me').params.filter, 'reports');
    assert.equal(messagingNotificationTarget('chat', {}, 'me'), null);
});

const ctx2 = {};
vm.runInNewContext(`${strip(read('messagingRules.js'))}\n${strip(read('messagingNotificationTarget.js'))}\nthis.api = { isViewingConversation, isGroupChatRoute };`, ctx2);
const { isViewingConversation, isGroupChatRoute } = ctx2.api;

test('banner is suppressed only for the conversation that is open', () => {
    const open = { name: 'TripChat', params: { conversation: { kind: 'dm', id: 'a_me' } } };
    assert.equal(isViewingConversation('dm_message', { conversationId: 'a_me', senderUid: 'a' }, open, 'me'), true);
    assert.equal(isViewingConversation('dm_message', { conversationId: 'b_me', senderUid: 'b' }, open, 'me'), false);
    assert.equal(isViewingConversation('team_message', { conversationId: 'a_me' }, open, 'me'), false);
    assert.equal(isViewingConversation('dm_message', { conversationId: 'a_me' }, { name: 'Messages' }, 'me'), false);
});

test('team thread matches by pilgrim id, and a pilgrim falls back to their own', () => {
    const open = { name: 'TripChat', params: { conversation: { kind: 'team', id: 'me' } } };
    assert.equal(isViewingConversation('team_message', { conversationId: 'me' }, open, 'me'), true);
    assert.equal(isViewingConversation('team_message', {}, open, 'me'), true);
    assert.equal(isViewingConversation('staff_chat', {}, open, 'me'), false);
});

test('the group chat route is TripChat without another conversation open', () => {
    assert.equal(isGroupChatRoute({ name: 'TripChat', params: { trip: {} } }), true);
    assert.equal(isGroupChatRoute({ name: 'TripChat', params: { conversation: { kind: 'dm', id: 'x' } } }), false);
    assert.equal(isGroupChatRoute({ name: 'Messages' }), false);
});
