const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../src/utils/widgetTimelineRecovery.js'), 'utf8');
const { createWidgetTimelineRecovery } = vm.runInNewContext(
    source.replace('export function', 'function') + '\n({ createWidgetTimelineRecovery })'
);

test('a fresh install gets an offline timeline before session loading completes', async () => {
    const snapshots = [];
    const recovery = createWidgetTimelineRecovery({
        getTimeline: async () => [],
        updateSnapshot: props => snapshots.push(props),
    });
    await recovery.refresh();
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].activeChannelName, 'No Channel');
    assert.equal(snapshots[0].isConnected, false);
});

test('foreground recovery reloads an existing timeline without replacing its data', async () => {
    let reloads = 0;
    const recovery = createWidgetTimelineRecovery({
        getTimeline: async () => [{ props: { activeChannelName: 'Current trip' } }],
        updateSnapshot: () => assert.fail('must preserve saved timeline'),
        reload: () => reloads++,
    });
    await recovery.refresh();
    assert.equal(reloads, 1);
});

test('a slow startup read cannot overwrite a newer voice snapshot', async () => {
    let resolveRead;
    const snapshots = [];
    const recovery = createWidgetTimelineRecovery({
        getTimeline: () => new Promise(resolve => { resolveRead = resolve; }),
        updateSnapshot: props => snapshots.push(props),
    });
    const pending = recovery.refresh();
    const liveProps = { activeChannelName: 'Current trip', isConnected: true };
    recovery.updateSnapshot(liveProps);
    resolveRead([]);
    await pending;
    assert.deepEqual(snapshots, [liveProps]);
});

test('logout erases cached trip and speaker data and defeats an in-flight recovery', async () => {
    let finish; const snapshots = []; let reloads = 0;
    const recovery = createWidgetTimelineRecovery({
        getTimeline: () => new Promise(resolve => { finish = resolve; }),
        updateSnapshot: props => snapshots.push(props), reload: () => reloads++,
    });
    const pending = recovery.refresh(); recovery.clear();
    finish([{ props: { tripId: 'old', activeChannelName: 'Private trip' } }]);
    await pending;
    assert.equal(reloads, 0);
    assert.equal(snapshots.length, 1);
    for (const key of ['tripId', 'orgId', 'activeChannelImageURL', 'activeSpeakerName', 'activeSpeakerAvatar']) assert.equal(snapshots[0][key], '');
    assert.equal(snapshots[0].isConnected, false);
    assert.equal(snapshots[0].isAdmin, false);
});
