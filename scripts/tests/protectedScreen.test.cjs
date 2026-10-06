const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require.resolve('../../src/navigation/withProtectedSession.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export function', 'function');
const code = babel.transformSync(source, { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;
function fixture(valid, initiallyAdmitted = false) {
    let admissionUser; let checks = 0;
    let state; let effect; let authCallback; let appCallback; let invalidate;
    const auth = { currentUser: { uid: 'u' } }; const resets = [];
    if (initiallyAdmitted) admissionUser = auth.currentUser;
    const React = { useState: initial => { if (state === undefined) state = typeof initial === 'function' ? initial() : initial; return [state, value => { state = value; }]; },
        useCallback: callback => callback, createElement: (type, props) => ({ type, props }) };
    const wrap = vm.runInNewContext(code + '\nwithProtectedSession', {
        React, auth, View: 'View', ActivityIndicator: 'Spinner',
        useFocusEffect: callback => { effect ||= callback; },
        onAuthStateChanged: (_, callback) => { authCallback = callback; return () => {}; },
        protectedSession: {
            hasAdmission: () => !!admissionUser && admissionUser === auth.currentUser,
            clearAdmission: () => { admissionUser = null; },
            validate: async () => { checks++; admissionUser = valid ? auth.currentUser : null; return valid; }, subscribe: callback => { invalidate = callback; return () => {}; } },
        AppState: { addEventListener: (_, callback) => { appCallback = callback; return { remove() {} }; } },
    });
    const Screen = () => {}; const Wrapped = wrap(Screen);
    const props = { navigation: { reset: value => resets.push(value) }, route: { params: { tripId: 'a' } } };
    return { auth, Screen, props, resets, checks: () => checks, render: () => Wrapped(props), mount: () => effect(), check: () => authCallback(), background: () => appCallback('background'), invalidate: () => invalidate() };
}
test('protected child and its data effects cannot mount before validation', async () => {
    const f = fixture(true);
    assert.equal(f.render().type, 'View'); f.mount();
    await f.check(); assert.equal(f.render().type, f.Screen);
    f.background(); assert.equal(f.render().type, 'View');
});
test('failed validation sends Login without ever mounting protected child', async () => {
    const f = fixture(false); f.render(); f.mount(); await f.check();
    assert.equal(f.render().type, 'View');
    assert.equal(f.resets[0].routes[0].name, 'Login');
});
test('internal parameter changes reuse session admission but logout blocks rendering', async () => {
    const f = fixture(true); f.render(); f.mount(); await f.check();
    assert.equal(f.render().type, f.Screen);
    f.props.route.params = { tripId: 'b' };
    assert.equal(f.render().type, f.Screen);
    await f.check(); assert.equal(f.render().type, f.Screen);
    f.auth.currentUser = null;
    assert.equal(f.render().type, 'View');
});

test('new screens in an admitted session render immediately with no loading or validation', async () => {
    const f = fixture(true, true);
    assert.equal(f.render().type, f.Screen);
    const blur = f.mount(); await f.check();
    assert.equal(f.checks(), 0);
    blur(); assert.equal(f.render().type, f.Screen);
    f.mount(); await f.check();
    assert.equal(f.checks(), 0);
    assert.equal(f.render().type, f.Screen);
});
