const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ foreground = 'granted', background = 'granted', platform = 'ios', started = false } = {}) {
    const state = { foreground, background, started, starts: [], stops: 0, watches: 0, reads: 0, writes: 0, stored: new Map() };
    const Location = {
        Accuracy: { Balanced: 3, High: 4 },
        requestForegroundPermissionsAsync: async () => ({ status: state.foreground }),
        requestBackgroundPermissionsAsync: async () => ({ status: state.background }),
        getForegroundPermissionsAsync: async () => ({ status: state.foreground }),
        getBackgroundPermissionsAsync: async () => ({ status: state.background }),
        hasStartedLocationUpdatesAsync: async () => state.started,
        startLocationUpdatesAsync: async (name, options) => { state.starts.push(options); state.started = true; },
        stopLocationUpdatesAsync: async () => { state.stops++; state.started = false; },
        getCurrentPositionAsync: async () => { state.reads++; return { coords: { latitude: 30, longitude: 70 } }; },
        watchPositionAsync: async () => { state.watches++; return { remove() { state.watches--; } }; },
    };
    const source = fs.readFileSync(require.resolve('../../src/services/locationTrackingService.js'), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
    const api = vm.runInNewContext(source + '\n({ startLiveLocationTracking, stopLiveLocationTracking, syncCurrentUserLocationNow })', {
        Location,
        TaskManager: { defineTask: (name, callback) => { state.task = callback; } },
        AsyncStorage: {
            getItem: async key => state.stored.get(key),
            setItem: async (key, value) => state.stored.set(key, value),
            removeItem: async key => state.stored.delete(key),
        },
        auth: { currentUser: { uid: 'user' } }, database: {},
        ref: (_, path) => path, get: async () => ({ exists: () => false }),
        set: async () => { state.writes++; }, serverTimestamp: () => 123,
        Platform: { OS: platform },
        AppState: { currentState: 'active', addEventListener: (_, callback) => { state.resume = callback; return { remove() {} }; } },
        console: { log() {} },
    });
    return { state, ...api };
}

test('foreground denial stops an existing task and never persists or starts tracking', async () => {
    const app = setup({ foreground: 'denied', started: true });
    assert.equal(await app.startLiveLocationTracking('org', 'trip'), false);
    assert.equal(app.state.starts.length, 0);
    assert.equal(app.state.watches, 0);
    assert.equal(app.state.reads, 0);
    assert.equal(app.state.stored.size, 0);
    assert.equal(app.state.stops, 1);
});

test('When In Use / Allow Once stays foreground-only and removes an old background task', async () => {
    const app = setup({ background: 'denied', started: true });
    assert.equal(await app.startLiveLocationTracking('org', 'trip'), true);
    assert.equal(app.state.starts.length, 0);
    assert.equal(app.state.stops, 1);
    assert.equal(app.state.watches, 1);
    assert.equal(app.state.writes, 1);
});

test('Always refreshes existing iOS tasks without opting into optional location UI or pausing updates', async () => {
    const app = setup({ started: true });
    await app.startLiveLocationTracking('org', 'trip');
    const [options] = app.state.starts;
    assert.equal(options.showsBackgroundLocationIndicator, false);
    assert.equal(options.pausesUpdatesAutomatically, false);
    assert.equal(options.foregroundService, undefined);
    await app.stopLiveLocationTracking();
    assert.equal(app.state.started, false);
    assert.equal(app.state.watches, 0);
});

test('Android retains the foreground-service disclosure and permits service survival after task removal', async () => {
    const app = setup({ platform: 'android' });
    await app.startLiveLocationTracking('org', 'trip');
    assert.match(app.state.starts[0].foregroundService.notificationBody, /Sharing your live location/);
    assert.equal(app.state.starts[0].foregroundService.killServiceOnDestroy, false);
});

test('returning from Settings handles background grant, downgrade, and foreground revocation', async () => {
    const app = setup({ background: 'denied' });
    await app.startLiveLocationTracking('org', 'trip');
    app.state.background = 'granted';
    await app.state.resume('active');
    assert.equal(app.state.started, true);
    app.state.background = 'denied';
    await app.state.resume('active');
    assert.equal(app.state.started, false);
    app.state.foreground = 'denied';
    await app.state.resume('active');
    assert.equal(app.state.watches, 0);
    assert.equal(app.state.stored.size, 0);
});

test('queued background locations are discarded after permission downgrade', async () => {
    const app = setup();
    await app.startLiveLocationTracking('org', 'trip');
    app.state.background = 'denied';
    const writes = app.state.writes;
    await app.state.task({ data: { locations: [{ coords: { latitude: 31, longitude: 71 } }] } });
    assert.equal(app.state.writes, writes);
    assert.equal(app.state.started, false);
});
