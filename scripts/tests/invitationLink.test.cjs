const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { URL };
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../../src/utils/invitationLink'), 'utf8').replaceAll('export function ', 'function '), context);
const { parseInvitationCode, invitationErrorMessage } = context;
const code = '02d67f4d-a220-47d0-a6e9-2f488fed1a1d';

test('shared link, raw code and pasted URL variants resolve to the same invitation', () => {
    for (const input of [code, `https://app.gomusafir.app/link/${code}`,
        `\u00a0https://app.gomusafir.app/link/${code}/?source=share#join\u00a0`,
        `app.gomusafir.app/link/${code}`, `gomusafir://link/${code}`,
        `https://app.gomusafir.app/link/${code}\u200b`]) {
        assert.equal(parseInvitationCode(input), code);
    }
});
test('rejects unrelated hosts, missing codes and extra path segments', () => {
    for (const input of ['', 'https://app.gomusafir.app/link/',
        `https://evil.test/app.gomusafir.app/link/${code}`,
        `https://app.gomusafir.app/link/${code}/extra`,
        `https://user:password@app.gomusafir.app/link/${code}`]) {
        assert.equal(parseInvitationCode(input), null);
    }
});
test('service failures are not presented as invalid invitations or leaked server errors', () => {
    for (const code of ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded', 'network-error']) {
        assert.match(invitationErrorMessage({ code, message: 'private backend details' }), /could not check/);
    }
    assert.match(invitationErrorMessage({ code: 'functions/not-found' }), /Invalid link/);
    assert.match(invitationErrorMessage({ code: 'functions/failed-precondition' }), /expired/);
    assert.match(invitationErrorMessage({ code: 'functions/unauthenticated' }), /sign-in/);
});
