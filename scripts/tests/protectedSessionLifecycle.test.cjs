const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../src/services/protectedSessionService.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export const', 'const');
function fixture() {
    let listener; let admitted = true;
    vm.runInNewContext(source, {
        AppState: { currentState: 'active', addEventListener: (_, callback) => { listener = callback; } },
        auth: {}, fetchAppAccess() {}, signOut() {}, isAccessDeniedError() {}, AsyncStorage: {},
        createProtectedSessionValidator: () => ({ clearAdmission: () => { admitted = false; } }),
    });
    return { send: state => listener(state), hasAdmission: () => admitted, validateBackgroundWidget: () => { admitted = true; } };
}
test('public-screen backgrounding and resume clear admission even after a background Widget validation', () => {
    const f = fixture();
    f.send('background'); assert.equal(f.hasAdmission(), false);
    f.validateBackgroundWidget(); assert.equal(f.hasAdmission(), true);
    f.send('inactive'); f.send('active'); assert.equal(f.hasAdmission(), false);
});
test('a permission dialog does not invalidate foreground navigation admission', () => {
    const f = fixture(); f.send('inactive'); f.send('active');
    assert.equal(f.hasAdmission(), true);
});
