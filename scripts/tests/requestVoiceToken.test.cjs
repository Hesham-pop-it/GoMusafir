const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../../src/utils/requestVoiceToken.js'), 'utf8')
    .replace('export async function ', 'async function '), context);
const request = context.requestVoiceToken;

test('token request waits for the callable instead of discarding a delayed response', async () => {
    let complete;
    const response = { data: { token: 'token', url: 'wss://voice.example.com' } };
    const pending = request({}, (_, name, options) => {
        assert.equal(name, 'generateLiveKitToken');
        assert.equal(options.timeout, 60000);
        return args => {
            assert.equal(args.tripId, 'trip');
            return new Promise(resolve => { complete = resolve; });
        };
    }, 'trip');
    await Promise.resolve();
    complete(response);
    assert.equal(await pending, response);
});

test('a callable deadline identifies the Voice service, not a lost internet connection', async () => {
    await assert.rejects(request({}, () => async () => {
        throw Object.assign(new Error('deadline'), { code: 'functions/deadline-exceeded' });
    }, 'trip'), /Voice service took too long/);
});

test('authentication, allowance and service errors are preserved', async () => {
    for (const code of ['functions/unauthenticated', 'functions/resource-exhausted', 'functions/unavailable']) {
        const error = Object.assign(new Error('original server message'), { code });
        await assert.rejects(request({}, () => async () => { throw error; }, 'trip'), actual => actual === error);
    }
});
