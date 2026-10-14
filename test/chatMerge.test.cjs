const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeMessages } = require('../src/utils/chatMerge');

test('cache load keeps live messages that arrived first', () => {
    const live = [{ id: 'c', rawTimestamp: 30 }];
    const cache = [{ id: 'b', timestamp: 20 }, { id: 'a', timestamp: 10 }];
    assert.deepEqual(mergeMessages(cache, live).map(m => m.id), ['c', 'b', 'a']);
});

test('live message after cache load is inserted in timestamp order, not overwritten', () => {
    const current = [{ id: 'b', rawTimestamp: 20 }, { id: 'a', rawTimestamp: 10 }];
    assert.deepEqual(mergeMessages(current, [{ id: 'c', rawTimestamp: 30 }]).map(m => m.id), ['c', 'b', 'a']);
    assert.deepEqual(mergeMessages(current, [{ id: 'x', rawTimestamp: 15 }]).map(m => m.id), ['b', 'x', 'a']);
});

test('duplicate ids keep the newest timestamp', () => {
    const merged = mergeMessages([{ id: 'a', rawTimestamp: 50, text: 'new' }], [{ id: 'a', timestamp: 10, text: 'old' }]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].text, 'new');
});

test('on equal timestamps the preferred (live) entry wins and keeps cached fields', () => {
    const merged = mergeMessages([{ id: 'a', timestamp: 5, text: 'cached', avatar: 'x' }], [{ id: 'a', rawTimestamp: 5, text: 'live' }]);
    assert.equal(merged[0].text, 'live');
    assert.equal(merged[0].avatar, 'x');
});

test('empty and invalid input is tolerated', () => {
    assert.deepEqual(mergeMessages(), []);
    assert.deepEqual(mergeMessages([null, { text: 'no id' }], [undefined]), []);
});
