const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../src/utils/voiceActivityLifecycle.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function');
const create = vm.runInNewContext(source + '\ncreateVoiceActivityLifecycle', {
    console, isMissingLiveActivity: error => /can't find live activity/i.test(error.message),
});
function fixture(instances = []) {
    const calls = []; const warnings = []; let starts = 0;
    const active = { current: null }, data = { current: { old: true } }, payload = { current: 'old' };
    const factory = { getInstances: () => instances, start: (props, url) => {
        starts++; const activity = { id: 'new', end: async policy => calls.push(['new', policy]) };
        calls.push(['start', props, url]); return activity;
    } };
    const lifecycle = create(factory, active, data, payload, (...args) => warnings.push(args));
    return { lifecycle, factory, active, data, payload, calls, warnings, starts: () => starts };
}
test('disconnect ends orphaned native activities with no in-memory activity', async () => {
    const ended = [];
    const f = fixture([1, 2].map(id => ({ id, end: async policy => ended.push([id, policy]) })));
    await f.lifecycle.end();
    assert.deepEqual(ended, [[1, 'immediate'], [2, 'immediate']]);
    assert.equal(f.active.current, null); assert.equal(f.data.current, null); assert.equal(f.payload.current, null);
});
test('held and native wrappers for the same activity are dismissed once', async () => {
    let ends = 0; const f = fixture([{ id: 'same', end: async () => { ends++; } }]);
    f.active.current = { id: 'same', end: async () => { ends++; } };
    await f.lifecycle.end(); assert.equal(ends, 1);
});
test('cleanup starts immediately and clears refs before native completion', async () => {
    let finish; let invoked = false;
    const f = fixture([{ id: 'old', end: () => { invoked = true; return new Promise(resolve => { finish = resolve; }); } }]);
    f.active.current = { id: 'old' };
    const pending = f.lifecycle.end();
    assert.equal(invoked, true); assert.equal(f.active.current, null);
    finish(); await pending;
});
test('stopping while a connection awaits preferences cannot create a new island', async () => {
    const f = fixture(); const ticket = f.lifecycle.begin();
    await f.lifecycle.end();
    assert.equal(f.lifecycle.isCurrent(ticket), false);
    assert.equal(await f.lifecycle.start(ticket, {}, 'url'), null);
    assert.equal(f.starts(), 0);
});
test('stop during asynchronous orphan dismissal prevents late activity creation', async () => {
    const pendingEnds = [];
    const f = fixture([{ id: 'old', end: () => new Promise(resolve => pendingEnds.push(resolve)) }]);
    const ticket = f.lifecycle.begin();
    const starting = f.lifecycle.start(ticket, {}, 'url');
    const ending = f.lifecycle.end();
    pendingEnds.forEach(resolve => resolve());
    await ending; assert.equal(await starting, null); assert.equal(f.starts(), 0);
});
test('new connection dismisses old native sessions then owns one fresh activity', async () => {
    let ended = false;
    const f = fixture([{ id: 'old', end: async () => { ended = true; } }]);
    const props = { tripName: 'New trip' };
    const activity = await f.lifecycle.start(f.lifecycle.begin(), props, 'gomusafir://voicechat');
    assert.equal(ended, true); assert.equal(f.starts(), 1);
    assert.equal(f.active.current, activity); assert.equal(f.data.current, props);
});
test('one missing or failing activity does not stop cleanup of other native instances', async () => {
    let ended = false;
    const f = fixture([
        { id: 'missing', end: async () => { throw new Error("Can't find live activity"); } },
        { id: 'failed', end: async () => { throw new Error('native failure'); } },
        { id: 'active', end: async () => { ended = true; } },
    ]);
    await f.lifecycle.end(); assert.equal(ended, true); assert.equal(f.warnings.length, 1);
});
test('native lookup failure still ends a held activity', async () => {
    const f = fixture(); let ended = false;
    f.factory.getInstances = () => { throw new Error('lookup failed'); };
    f.active.current = { end: async () => { ended = true; } };
    await f.lifecycle.end(); assert.equal(ended, true); assert.equal(f.warnings.length, 1);
});
