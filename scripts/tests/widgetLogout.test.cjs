const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const recoverySource = fs.readFileSync(require.resolve('../../src/utils/widgetTimelineRecovery.js'), 'utf8');
const createWidgetTimelineRecovery = vm.runInNewContext(recoverySource.replace('export function', 'function') + '\ncreateWidgetTimelineRecovery');
const service = fs.readFileSync(require.resolve('../../src/services/journeyWidgetService.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export const', 'const');
function fixture(blocked) {
    const snapshots = []; const ended = [];
    const widget = vm.runInNewContext(service + '\njourneyWidget', {
        createWidgetTimelineRecovery, protectedSession: { isBlocked: () => blocked },
        MyWidget: { updateSnapshot: props => snapshots.push(props) },
        MyLiveActivity: { getInstances: () => [1, 2].map(id => ({ end: async policy => ended.push([id, policy]) })) },
    });
    return { widget, snapshots, ended };
}
test('logout clears snapshot and dismisses native activities surviving a process restart', () => {
    const f = fixture(true); f.widget.clear();
    assert.equal(f.snapshots[0].tripId, '');
    assert.deepEqual(f.ended, [[1, 'immediate'], [2, 'immediate']]);
});
test('late voice effects cannot put a logged-out trip back on the Widget', () => {
    const f = fixture(true);
    f.widget.updateSnapshot({ tripId: 'old', activeChannelName: 'Private', isConnected: true });
    assert.equal(f.snapshots[0].tripId, '');
    assert.equal(f.snapshots[0].isConnected, false);
    const valid = fixture(false); const props = { tripId: 'current' };
    valid.widget.updateSnapshot(props); assert.equal(valid.snapshots[0], props);
});
