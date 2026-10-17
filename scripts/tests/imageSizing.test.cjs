const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load() {
    const calls = [];
    const context = {
        SaveFormat: { JPEG: 'jpeg' },
        manipulateAsync: async (uri, actions, options) => {
            calls.push({ uri, actions, options });
            const r = actions[0]?.resize;
            return { uri: `${uri}+`, width: r?.width || r?.height || 2000, height: r?.height || r?.width || 1000 };
        },
    };
    const src = fs.readFileSync(path.join(__dirname, '../../src/utils/imageSizing.js'), 'utf8');
    vm.runInNewContext(src.replace(/^import .*;\n/gm, '').replace(/^export /gm, '') + '\nthis.api = { longSideResize, preparePhoto, prepareAvatar };', context);
    return { api: context.api, calls };
}

test('long side resize picks the longer axis and skips small images', () => {
    const { api } = load();
    assert.deepEqual(JSON.parse(JSON.stringify(api.longSideResize(4000, 3000, 1280))), { resize: { width: 1280 } });
    assert.deepEqual(JSON.parse(JSON.stringify(api.longSideResize(3000, 4000, 1280))), { resize: { height: 1280 } });
    assert.equal(api.longSideResize(800, 600, 1280), null);
    assert.equal(api.longSideResize(0, 0, 1280), null);
});

test('photos are made at 1280 px q0.7 with a 480 px thumbnail', async () => {
    const { api, calls } = load();
    const { full, thumb } = await api.preparePhoto('file://p', 4000, 3000);
    assert.equal(calls[0].actions[0].resize.width, 1280);
    assert.equal(calls[0].options.compress, 0.7);
    assert.equal(calls[1].actions[0].resize.width, 480);
    assert.ok(full.uri && thumb.uri);
});

test('avatars are made at 256 px with a 96 px variant', async () => {
    const { api, calls } = load();
    await api.prepareAvatar('file://a', 1000, 1000);
    assert.equal(calls[0].actions[0].resize.width, 256);
    assert.equal(calls[1].actions[0].resize.width, 96);
});

test('unknown dimensions are probed before resizing', async () => {
    const { api, calls } = load();
    await api.preparePhoto('file://p');
    assert.equal(calls[0].actions.length, 0);
    assert.equal(calls[1].actions[0].resize.width, 1280);
});
