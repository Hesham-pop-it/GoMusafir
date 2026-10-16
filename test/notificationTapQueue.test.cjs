const test = require('node:test');
const assert = require('node:assert/strict');
const { createTapQueue } = require('../src/utils/notificationTapQueue');

function setup() {
    const state = { ready: false, navigated: [] };
    const queue = createTapQueue({ isReady: () => state.ready, navigate: async (item) => { state.navigated.push(item.id); } });
    return { state, queue };
}

test('taps wait until navigation is ready, then flush in order', async () => {
    const { state, queue } = setup();
    await queue.enqueue({ id: 'a' });
    await queue.enqueue({ id: 'b' });
    assert.deepEqual(state.navigated, []);
    assert.equal(queue.pendingCount(), 2);
    state.ready = true;
    await queue.flush();
    assert.deepEqual(state.navigated, ['a', 'b']);
    assert.equal(queue.pendingCount(), 0);
});

test('the same notification from cold start and warm paths is handled once', async () => {
    const { state, queue } = setup();
    await queue.enqueue({ id: 'a' });
    await queue.enqueue({ id: 'a' });
    state.ready = true;
    await queue.flush();
    await queue.enqueue({ id: 'a' });
    assert.deepEqual(state.navigated, ['a']);
});

test('ready navigation handles a tap immediately', async () => {
    const { state, queue } = setup();
    state.ready = true;
    await queue.enqueue({ id: 'x' });
    assert.deepEqual(state.navigated, ['x']);
});

test('a failing navigation does not block later taps', async () => {
    const seen = [];
    const queue = createTapQueue({ isReady: () => true, navigate: async (i) => { if (i.id === 'bad') throw new Error('x'); seen.push(i.id); } });
    const warn = console.warn;
    console.warn = () => {};
    await queue.enqueue({ id: 'bad' });
    await queue.enqueue({ id: 'good' });
    console.warn = warn;
    assert.deepEqual(seen, ['good']);
});

test('the same id is handled again after the dedupe window', async () => {
    let t = 0;
    const seen = [];
    const queue = createTapQueue({ isReady: () => true, navigate: async (i) => { seen.push(i.id); }, now: () => t });
    await queue.enqueue({ id: 'a' });
    t = 31000;
    await queue.enqueue({ id: 'a' });
    assert.deepEqual(seen, ['a', 'a']);
});
