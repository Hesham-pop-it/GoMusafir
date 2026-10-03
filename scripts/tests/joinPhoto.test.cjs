const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../src/screens/auth/JoinFlowScreens.js'), 'utf8');

test('join screens bind every React hook they call (including Terms after photo selection)', () => {
    const result = babel.transformSync(source, {
        configFile: false, babelrc: false, ast: true, code: false,
        parserOpts: { plugins: ['jsx'] },
    });
    babel.traverse(result.ast, {
        CallExpression(path) {
            const callee = path.get('callee');
            if (callee.isIdentifier() && /^use[A-Z]/.test(callee.node.name)) {
                assert.ok(path.scope.getBinding(callee.node.name), `Unbound hook: ${callee.node.name}`);
            }
        },
    });
});

function fixture({ denied = false, canceled = false, fail = false, processingFail = false } = {}) {
    const calls = [], alerts = [], crops = [];
    const context = {
        pendingPhotoSource: { current: null }, photoPickerBusy: { current: false },
        photoScreenMounted: { current: true },
        setShowSourceModal: visible => calls.push(['sheet', visible]),
        ImagePicker: {
            requestCameraPermissionsAsync: async () => ({ status: denied ? 'denied' : 'granted' }),
            requestMediaLibraryPermissionsAsync: async () => ({ status: denied ? 'denied' : 'granted' }),
            launchCameraAsync: async () => { calls.push(['camera']); if (fail) throw Error('picker'); return { canceled, assets: [{ uri: 'file://photo', width: 100, height: 100 }] }; },
            launchImageLibraryAsync: async () => { calls.push(['gallery']); if (fail) throw Error('picker'); return { canceled, assets: [{ uri: 'file://photo', width: 100, height: 100 }] }; },
        },
        resizeAndOpen: async (...args) => { if (processingFail) throw Error('processing'); crops.push(args); },
        Alert: { alert: (...args) => alerts.push(args) },
        console: { warn() {} }, setTimeout: callback => callback(),
    };
    const start = source.indexOf('    const launchPendingPhotoPicker = async () => {');
    const end = source.indexOf('    const handleSaveCrop = async () => {', start);
    vm.runInNewContext(source.slice(start, end) + '\nthis.select = selectPhotoSource; this.launch = launchPendingPhotoPicker;', context);
    return { context, calls, alerts, crops };
}

test('selection waits for sheet dismissal and ignores duplicate taps/dismissals', async () => {
    const { context, calls, crops } = fixture();
    context.select('gallery');
    context.select('camera');
    assert.deepEqual(calls, [['sheet', false]]);
    await context.launch();
    await context.launch();
    assert.deepEqual(calls, [['sheet', false], ['gallery']]);
    assert.equal(crops.length, 1);
    assert.equal(context.photoPickerBusy.current, false);
});

for (const options of [{ denied: true }, { canceled: true }, { fail: true }, { processingFail: true }]) {
    test(`photo flow recovers: ${JSON.stringify(options)}`, async () => {
        const { context, crops, alerts } = fixture(options);
        context.select('camera');
        await context.launch();
        assert.equal(crops.length, 0);
        assert.equal(context.photoPickerBusy.current, false);
        assert.equal(alerts.length, options.canceled ? 0 : 1);
        context.select('gallery');
        assert.equal(context.pendingPhotoSource.current, 'gallery');
    });
}

test('leaving the photo screen while selecting prevents the cropper opening', async () => {
    const { context, crops } = fixture();
    context.ImagePicker.launchImageLibraryAsync = async () => {
        context.photoScreenMounted.current = false;
        return { assets: [{ uri: 'file://photo' }] };
    };
    context.select('gallery');
    await context.launch();
    assert.equal(crops.length, 0);
    assert.equal(context.photoPickerBusy.current, false);
});
