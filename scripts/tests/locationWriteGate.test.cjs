const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function setup() {
    const state = { writes: [], now: 1000000, fail: false };
    const source = fs.readFileSync(require.resolve('../../src/services/locationTrackingService.js'), 'utf8')
        .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
    const vm = require('node:vm');
    const api = vm.runInNewContext(source + '\n({ shouldWriteLocation, syncLocationToFirebase, stopLiveLocationTracking })', {
        Location: { Accuracy: {}, hasStartedLocationUpdatesAsync: async () => false },
        TaskManager: { defineTask() {} },
        AsyncStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
        auth: { currentUser: { uid: 'user' } }, database: {},
        ref: (_, path) => path, get: async () => ({}),
        set: async (path, value) => { if (state.fail) throw new Error('x'); state.writes.push({ path, value }); },
        serverTimestamp: () => 'ts', Platform: { OS: 'ios' },
        AppState: { addEventListener() {} }, console: { log() {} },
        Date: { now: () => state.now },
    });
    return { state, ...api };
}

const trip = { orgId: 'o', tripId: 't', userId: 'user' };
const M = 0.0001; // about 11 m of latitude

test('gate: first write, trip change and force always pass', () => {
    const { shouldWriteLocation } = setup();
    assert.equal(shouldWriteLocation(null, 'a', 1, 1, 0), true);
    assert.equal(shouldWriteLocation({ key: 'a', at: 0, lat: 1, lng: 1 }, 'b', 1, 1, 1), true);
    assert.equal(shouldWriteLocation({ key: 'a', at: 0, lat: 1, lng: 1 }, 'a', 1, 1, 1, true), true);
});

test('gate: needs both 15 s and 10 m', () => {
    const { shouldWriteLocation } = setup();
    const last = { key: 'a', at: 0, lat: 30, lng: 70 };
    assert.equal(shouldWriteLocation(last, 'a', 30 + M, 70, 14999), false);
    assert.equal(shouldWriteLocation(last, 'a', 30 + M, 70, 15000), true);
    assert.equal(shouldWriteLocation(last, 'a', 30 + M / 2, 70, 60000), false);
});

test('writer: drops points inside the window, keeps payload shape, retries after failure', async () => {
    const app = setup();
    const c = { latitude: 30, longitude: 70, speed: 1, heading: 2, accuracy: 3 };
    await app.syncLocationToFirebase(c, { trip });
    await app.syncLocationToFirebase({ ...c, latitude: 30 + M }, { trip });
    assert.equal(app.state.writes.length, 1);
    assert.deepEqual(Object.keys(app.state.writes[0].value), ['lat', 'lng', 'latitude', 'longitude', 'speed', 'heading', 'accuracy', 'updated_at']);
    assert.equal(app.state.writes[0].path, 'trips_active/o/t/locations/user');
    app.state.now += 20000;
    await app.syncLocationToFirebase({ ...c, latitude: 30 + M }, { trip });
    assert.equal(app.state.writes.length, 2);
    await app.syncLocationToFirebase({ ...c, latitude: 30 + M }, { trip, force: true });
    assert.equal(app.state.writes.length, 3);
    app.state.fail = true;
    app.state.now += 20000;
    await app.syncLocationToFirebase({ ...c, latitude: 31 }, { trip });
    app.state.fail = false;
    await app.syncLocationToFirebase({ ...c, latitude: 31 }, { trip });
    assert.equal(app.state.writes.length, 4);
});
