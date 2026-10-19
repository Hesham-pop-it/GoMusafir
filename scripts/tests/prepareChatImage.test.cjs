const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('sends chat photos as a bounded JPEG without base64', async () => {
    const helper = fs.readFileSync(path.join(__dirname, '../../src/utils/prepareChatImage.js'), 'utf8');
    const context = {
        SaveFormat: { JPEG: 'jpeg' },
        manipulateAsync: async (uri, actions, options) => {
            assert.equal(uri, 'file://photo.heic');
            assert.equal(actions[0].resize.width, 1600);
            assert.equal(options.format, 'jpeg');
            assert.equal(options.base64, undefined);
            return { uri: 'file://photo.jpg' };
        },
    };
    vm.runInNewContext(helper.replace(/^import .*;\n/gm, '').replace('export async function', 'async function') + '\nthis.prepare = prepareChatImage;', context);
    assert.equal(await context.prepare('file://photo.heic'), 'file://photo.jpg');
});
