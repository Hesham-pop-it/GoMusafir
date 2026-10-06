const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../src/navigation/RootNavigator.js'), 'utf8');
const code = source.slice(source.indexOf('const authenticatedLink ='), source.indexOf('export default function'));
function fixture(valid) {
    let listener; let checks = 0;
    const links = vm.runInNewContext(code + '\nlinking', {
        Linking: { createURL: () => 'gomusafir://', parse: url => { const parsed = new URL(url); return { path: parsed.pathname.slice(1), hostname: parsed.hostname }; },
            getInitialURL: async () => 'gomusafir://voicechat?tripId=stale&autoStart=true',
            addEventListener: (_, callback) => { listener = callback; return { remove() {} }; } },
        protectedSession: { validate: async () => { checks++; return valid; } },
        checkAndOpenWebUrl: async () => false,
        WebBrowser: { dismissBrowser: async () => {} },
    });
    return { links, checks: () => checks, send: url => listener({ url }) };
}
for (const valid of [true, false]) {
    test(`cold Widget link ${valid ? 'preserves target after validation' : 'redirects to Login'}`, async () => {
        const f = fixture(valid);
        assert.equal(await f.links.getInitialURL(), valid ? 'gomusafir://voicechat?tripId=stale&autoStart=true' : 'gomusafir://login');
        assert.equal(f.checks(), 1);
    });
    test(`warm Widget and protected app links ${valid ? 'are validated' : 'cannot open protected routes'}`, async () => {
        const f = fixture(valid); const received = [];
        f.links.subscribe(url => received.push(url));
        for (const path of ['voicechat', 'livelocation', 'team', 'settings', 'home', 'trips', 'notifications', 'tripchat', 'alerts', 'participants', 'trip-participants', 'trip-settings']) {
            const url = `gomusafir://${path}?tripId=stale&isAdmin=true`;
            await f.send(url);
            assert.equal(received.at(-1), valid ? url : 'gomusafir://login');
        }
        assert.equal(f.checks(), 12);
    });
}
test('public enrollment links stay accessible without authentication', async () => {
    const f = fixture(false); const received = []; f.links.subscribe(url => received.push(url));
    for (const url of ['gomusafir://team-join', 'https://join.gomusafir.app/link/code']) {
        await f.send(url); assert.equal(received.at(-1), url);
    }
    assert.equal(f.checks(), 0);
});
