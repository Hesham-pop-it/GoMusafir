const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
    const listeners = new Map(), statuses = [];
    const source = fs.readFileSync(path.join(__dirname, '../../src/utils/voiceChannelStatus.js'), 'utf8')
        .replace(/^import .*;\n/gm, '').replace('export function ', 'function ');
    const context = { ref: (_, key) => key, onValue: (key, next, error) => {
        listeners.set(key, { next, error }); return () => listeners.delete(key);
    } };
    vm.createContext(context); vm.runInContext(source, context);
    const stop = context.watchVoiceChannelStatus({}, 'o', 't', value => statuses.push(value));
    const emit = (kind, value) => listeners.get(kind === 'features' ? 'trip_feature_access/o/t' : 'trips_active/o/t/voice_channel/isChannelStarted')
        .next({ val: () => value });
    return { stop, emit, statuses, listeners, current: () => statuses.at(-1) };
}

test('active canonical session shows Stop despite a missing or stale legacy flag', () => {
    const f = fixture();
    f.emit('legacy', false); assert.equal(f.current(), null);
    f.emit('features', { voiceAccess: 'PRE_TRIP_LIMITED', session: { status: 'active' } });
    assert.equal(f.current(), true);
    f.emit('legacy', false); assert.equal(f.current(), true);
});
test('pending starts show checking, then active, then stopped without waiting for legacy mirror', () => {
    const f = fixture();
    f.emit('features', { session: { status: 'pending' } }); assert.equal(f.current(), null);
    f.emit('legacy', false); assert.equal(f.current(), null);
    f.emit('features', { session: { status: 'active' } }); assert.equal(f.current(), true);
    f.emit('features', { session: { status: 'ending' } }); assert.equal(f.current(), false);
    f.emit('legacy', true); assert.equal(f.current(), false);
    f.emit('features', { session: null }); assert.equal(f.current(), false);
});
test('expired trips cannot display an active channel from stale data', () => {
    const f = fixture(); f.emit('legacy', true);
    f.emit('features', { voiceAccess: 'EXPIRED', session: { status: 'active' } });
    assert.equal(f.current(), false);
});
test('unmigrated trips use the live legacy flag only after confirming no canonical record', () => {
    const f = fixture(); f.emit('features', null); assert.equal(f.current(), null);
    f.emit('legacy', true); assert.equal(f.current(), true);
    f.emit('legacy', false); assert.equal(f.current(), false);
});
test('late callbacks for a previously viewed trip cannot update its replacement', () => {
    const f = fixture(); const callback = f.listeners.get('trip_feature_access/o/t').next;
    f.stop(); const count = f.statuses.length;
    callback({ val: () => ({ session: { status: 'active' } }) });
    assert.equal(f.statuses.length, count); assert.equal(f.listeners.size, 0);
});
test('a denied status read remains unknown instead of inviting another start', () => {
    const f = fixture(); f.emit('legacy', false);
    f.listeners.get('trip_feature_access/o/t').error(new Error('permission denied'));
    assert.equal(f.current(), null);
});

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
test('connected provider confirms the session immediately and retries without the Voice screen', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/context/VoiceContext.js'), 'utf8');
    const start = source.indexOf('    useEffect(() => {', source.indexOf('// Confirm media connectivity'));
    const effect = source.slice(start, source.indexOf('\n    // Fetch Trip Title', start));
    let requests = 0, tick, cleanup, release;
    const context = {
        isConnected: true, activeTripId: 't', activeOrgId: 'o', isChannelActive: null,
        functions: {}, console, useEffect: fn => cleanup = fn(),
        httpsCallable: (_, name) => async args => {
            assert.equal(name, 'getTripFeatureAccess'); assert.equal(args.tripId, 't'); requests++;
            await new Promise(resolve => release = resolve);
        },
        setInterval: fn => { tick = fn; return 1; }, clearInterval: () => {},
    };
    vm.createContext(context); vm.runInContext(effect, context);
    assert.equal(requests, 1);
    tick(); assert.equal(requests, 1); // No overlapping requests.
    release(); await flush(); tick(); assert.equal(requests, 2);
    release(); await flush(); cleanup(); tick(); assert.equal(requests, 2);
});
