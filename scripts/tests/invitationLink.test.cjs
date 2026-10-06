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
test('both invitation domains accept path and query links, including pasted scheme-less links', () => {
    for (const host of ['app.gomusafir.app', 'www.app.gomusafir.app', 'join.gomusafir.app', 'www.join.gomusafir.app']) {
        for (const prefix of ['https://', '']) {
            for (const suffix of [`/link/${code}`, `/link/${code}/?source=share`, `/join?code=${code}`, `/join/?code=${code}&source=share`]) {
                const input = `${prefix}${host}${suffix}`;
                assert.equal(parseInvitationCode(input), code, input);
            }
        }
    }
    assert.equal(parseInvitationCode(`gomusafir://join?code=${code}`), code);
});
test('new domain support still rejects untrusted hosts and malformed query invitations', () => {
    for (const input of [
        `https://join.gomusafir.app.evil.test/link/${code}`,
        `https://join.gomusafir.app@evil.test/link/${code}`,
        `https://user:password@join.gomusafir.app/link/${code}`,
        `https://join.gomusafir.app:8443/link/${code}`,
        'https://join.gomusafir.app/join',
        'https://join.gomusafir.app/join?code=',
        'https://join.gomusafir.app/join?code=bad%2Fcode',
        `https://join.gomusafir.app/join?code=${code}&code=another`,
        `https://join.gomusafir.app/join/extra?code=${code}`,
        `gomusafir://join/${code}`,
    ]) assert.equal(parseInvitationCode(input), null, input);
});
test('service failures are not presented as invalid invitations or leaked server errors', () => {
    for (const code of ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded', 'network-error']) {
        assert.match(invitationErrorMessage({ code, message: 'private backend details' }), /could not check/);
    }
    assert.match(invitationErrorMessage({ code: 'functions/not-found' }), /Invalid link/);
    assert.match(invitationErrorMessage({ code: 'functions/failed-precondition' }), /expired/);
    assert.match(invitationErrorMessage({ code: 'functions/unauthenticated' }), /sign-in/);
});
