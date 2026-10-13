const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/utils/messagesInbox.js'), 'utf8');
const context = {};
vm.runInNewContext(source.replace(/export function/g, 'function').replace(/export const/g, 'const') + '\nthis.api = { initialsOf, formatInboxTime, teamUnreadCount, buildStaffRows, filterStaffRows, sortReports, splitInbox, fill, previewMessages };', context);
const api = context.api;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('initialsOf', () => {
    assert.equal(api.initialsOf('Bilal Ahmed'), 'BA');
    assert.equal(api.initialsOf('Omar'), 'O');
    assert.equal(api.initialsOf(''), '?');
});

test('formatInboxTime today, yesterday, weekday, older', () => {
    const now = new Date(2026, 9, 14, 12, 0).getTime();
    assert.equal(api.formatInboxTime(new Date(2026, 9, 14, 9, 5).getTime(), now), '09:05');
    assert.equal(api.formatInboxTime(new Date(2026, 9, 13, 23, 0).getTime(), now, 'Gisteren'), 'Gisteren');
    assert.equal(api.formatInboxTime(new Date(2026, 9, 11, 10, 0).getTime(), now), 'Sun');
    assert.equal(api.formatInboxTime(new Date(2026, 8, 1, 10, 0).getTime(), now), '01/09');
    assert.equal(api.formatInboxTime(0, now), '');
});

test('teamUnreadCount counts pilgrim messages newer than my pointer', () => {
    const meta = {
        a: { last_at: 10, last_sender_id: 'a' },
        b: { last_at: 10, last_sender_id: 'me' },
        c: { last_at: 10, last_sender_id: 'c' },
        d: {},
    };
    assert.equal(api.teamUnreadCount(meta, { c: 10 }, 'me'), 1);
    assert.equal(api.teamUnreadCount(meta, {}, 'me'), 2);
    assert.equal(api.teamUnreadCount(null, null, 'me'), 0);
});

test('buildStaffRows sorts newest first and flags unread; filters', () => {
    const meta = { a: { last_at: 5, last_sender_id: 'a' }, b: { last_at: 9, last_sender_id: 'b' } };
    const rows = plain(api.buildStaffRows(meta, { b: 9 }, 'me'));
    assert.deepEqual(rows.map((r) => [r.pilgrimUid, r.unread]), [['b', 0], ['a', 1]]);
    assert.equal(api.filterStaffRows(rows, 'unread').length, 1);
    assert.equal(api.filterStaffRows(rows, 'reports').length, 0);
    assert.equal(api.filterStaffRows(rows, 'all').length, 2);
});

test('sortReports newest first', () => {
    assert.deepEqual(plain(api.sortReports({ x: { at: 1 }, y: { at: 2 } }).map((r) => r.id)), ['y', 'x']);
});

test('splitInbox groups rows by kind and keeps thread ids', () => {
    const s = plain(api.splitInbox({
        t1: { kind: 'dm', last_at: 1 }, t2: { kind: 'request_out' },
        t3: { kind: 'request_in', last_at: 3 }, t4: { kind: 'request_in', last_at: 5 }, t5: { kind: 'declined' },
    }));
    assert.deepEqual(s.chats.map((r) => r.threadId), ['t1', 't2']);
    assert.deepEqual(s.requests.map((r) => r.threadId), ['t4', 't3']);
    assert.deepEqual(s.declined.map((r) => r.threadId), ['t5']);
});

test('fill replaces known placeholders only', () => {
    assert.equal(api.fill('Hi {name}, {n} left {x}', { name: 'A', n: 2 }), 'Hi A, 2 left {x}');
});

test('previewMessages skips system lines and falls back to one only when nothing else exists', () => {
    const sys = { id: 's', type: 'system', sender_id: 'system', text: 'Voice chat started by A' };
    const a = { id: 'a', sender_id: 'u1', text: 'hi' };
    const b = { id: 'b', sender_id: 'u2', text: 'salam' };
    assert.deepEqual(plain(api.previewMessages([a, b, sys], 2)), [a, b]);
    assert.deepEqual(plain(api.previewMessages([a, sys, b, sys], 1)), [b]);
    assert.deepEqual(plain(api.previewMessages([sys], 2)), [sys]);
    assert.deepEqual(plain(api.previewMessages([], 2)), []);
});
