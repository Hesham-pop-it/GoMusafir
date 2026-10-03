const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../src/screens/trip/TripOverviewScreen.js'), 'utf8');
const effect = source.slice(source.indexOf('// Real-time Data Synchronization'), source.indexOf('}, [passedTripId, passedOrgId, trip, tripLoadAttempt]);') + '}, [passedTripId, passedOrgId, trip, tripLoadAttempt]);'.length);
async function fixture({ fail = false, missing = false, profileOnly = false } = {}) {
    const state = {}, paths = [];
    let cleanup, listener, stopped = false;
    const context = {
        useEffect: fn => { cleanup = fn(); },
        passedTripId: profileOnly ? undefined : 'trip1', passedOrgId: profileOnly ? undefined : 'org1',
        trip: undefined, tripLoadAttempt: 0, orgId: 'org1', invitationCode: 'private-invite',
        auth: { currentUser: { uid: 'participant', getIdTokenResult: async () => ({ claims: { role: 'participant' } }) } },
        database: {}, ref: (_, path) => path,
        get: async () => ({ exists: () => true, val: () => ({ current_trip: 'trip1', org_id: 'org1' }) }),
        update: async () => {}, navigation: { navigate: () => {} }, isAdminRef: {}, console: { warn: () => {} },
        onValue: (path, success, error) => { paths.push(path); listener = { success, error }; return () => { stopped = true; }; },
    };
    for (const key of ['IsLoading','TripLoadError','LiveTripData','UserRole','IsAdmin','CurrentUserFullName','CurrentUserPhoto','ResolvedOrgId']) {
        context[`set${key}`] = value => { state[key] = value; };
    }
    vm.runInNewContext(effect, context);
    await new Promise(resolve => setImmediate(resolve));
    if (fail) listener.error(new Error('Permission denied'));
    else listener.success({ exists: () => !missing, val: () => ({ title: 'Joined trip', start_date: 100, end_date: 200 }) });
    return { state, paths, cleanup, listener, stopped: () => stopped };
}
test('joined participant loads trip directly even when an invitation code is present', async () => {
    const f = await fixture();
    assert.deepEqual(f.paths, ['orgs/org1/trips/trip1']);
    assert.equal(f.state.LiveTripData.title, 'Joined trip');
    assert.equal(f.state.LiveTripData.endDate, 200);
    assert.equal(f.state.IsLoading, false);
});
test('restored participant resolves membership IDs from own profile', async () => {
    const f = await fixture({ profileOnly: true });
    assert.deepEqual(f.paths, ['orgs/org1/trips/trip1']);
});
test('denied and missing trips leave loading and expose a retryable error', async () => {
    for (const options of [{ fail: true }, { missing: true }]) {
        const f = await fixture(options);
        assert.equal(f.state.IsLoading, false);
        assert.match(f.state.TripLoadError, /try again/);
    }
});
test('unmount detaches listener and ignores late updates', async () => {
    const f = await fixture();
    f.cleanup();
    assert.equal(f.stopped(), true);
    f.listener.error(new Error('late error'));
    assert.equal(f.state.TripLoadError, null);
});
