const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const babel = require('@babel/core');

test('Android widget imports and lifecycle run without SwiftUI or native widgets', async () => {
    const cache = new Map();
    const load = filename => {
        if (cache.has(filename)) return cache.get(filename);
        const exports = {};
        cache.set(filename, exports);
        const { code } = babel.transformFileSync(filename, {
            caller: { name: 'metro', platform: 'android' },
        });
        vm.runInNewContext(code, {
            exports,
            require: name => {
                if (name.startsWith('@babel/runtime/helpers/')) return require(name);
                // Exercise the installed Expo Android stubs, rejecting any
                // native/UI dependency that would be evaluated at startup.
                if (name === 'expo-widgets') return load(require.resolve('expo-widgets/src/Widgets.ts'));
                if (name === './ExpoWidgets') return load(require.resolve('expo-widgets/src/ExpoWidgets.ts'));
                throw new Error(`Unexpected Android widget dependency: ${name}`);
            },
        });
        return exports;
    };
    const { MyWidget, MyLiveActivity } = load(require.resolve('../../src/components/Widget.android.js'));
    MyWidget.updateSnapshot({ tripId: 'trip' });
    MyWidget.updateTimeline([]);
    MyWidget.reload();
    assert.equal((await MyWidget.getTimeline()).length, 0);
    assert.equal(MyLiveActivity.getInstances().length, 0);
    const activity = MyLiveActivity.start({ isConnected: true });
    await activity.update({ isMuted: true });
    await activity.end('immediate');
});
