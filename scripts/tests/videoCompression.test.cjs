const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(mod) {
    const context = { require: () => { if (!mod) throw new Error('missing'); return mod; }, console: { log() {} } };
    const src = fs.readFileSync(path.join(__dirname, '../../src/utils/videoCompression.js'), 'utf8');
    vm.runInNewContext(src.replace(/^export /gm, '') + '\nthis.api = { compressVideoIfPossible, isVideoCompressionAvailable };', context);
    return context.api;
}

test('returns the original video when the native compressor is absent', async () => {
    const api = load(null);
    assert.equal(api.isVideoCompressionAvailable(), false);
    assert.equal(await api.compressVideoIfPossible('file://v.mp4'), 'file://v.mp4');
});

test('uses the compressor when present and falls back when it throws', async () => {
    assert.equal(await load({ Video: { compress: async () => 'file://small.mp4' } }).compressVideoIfPossible('file://v.mp4'), 'file://small.mp4');
    assert.equal(await load({ Video: { compress: async () => { throw new Error('x'); } } }).compressVideoIfPossible('file://v.mp4'), 'file://v.mp4');
});
