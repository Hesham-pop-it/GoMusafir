const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('converts local photos to JPEG and validates the enrollment upload response', async () => {
    const helper = fs.readFileSync(path.join(__dirname, '../../src/utils/uploadJoinPhoto.js'), 'utf8');
    const context = {
        SaveFormat: { JPEG: 'jpeg' }, functions: {}, console: { warn() {} },
        manipulateAsync: async (uri, actions, options) => {
            assert.equal(uri, 'file://photo');
            assert.equal(actions[0].resize.width, 768);
            assert.equal(options.format, 'jpeg');
            assert.equal(options.base64, true);
            return { base64: '/9j/AA==' };
        },
        httpsCallable: (_, name) => async data => {
            assert.equal(name, 'uploadProfilePhoto');
            assert.equal(data.dataUrl, 'data:image/jpeg;base64,/9j/AA==');
            return { data: { url: 'https://storage.example/photo.jpg' } };
        },
    };
    vm.runInNewContext(helper.replace(/^import .*;\n/gm, '').replace('export async function', 'async function') + '\nthis.upload = uploadJoinPhoto;', context);
    assert.equal(await context.upload('file://photo'), 'https://storage.example/photo.jpg');
    context.httpsCallable = () => async () => ({ data: {} });
    await assert.rejects(context.upload('file://photo'), /photo could not be uploaded/);
    context.httpsCallable = () => async () => { throw Object.assign(new Error('Verify your email first.'), { code: 'functions/permission-denied' }); };
    await assert.rejects(context.upload('file://photo'), /Verify your email first/);
    context.manipulateAsync = async () => { throw new Error('Unreadable photo'); };
    await assert.rejects(context.upload('file://photo'), /photo could not be uploaded/);
});

test('join waits for upload, retries failures, and reuses uploads after a failed join', async () => {
    let uploadFails = true, joinFails = true, uploads = 0, joins = 0, navigations = 0;
    const alerts = [];
    const context = {
        joiningRef: { current: false }, uploadedPhotoRef: { current: null }, accepted: true,
        route: { params: {} }, previousData: { image: 'file://photo', invitationCode: 'invite' },
        auth: { currentUser: { uid: 'owner' } },
        prepareTripJoinSession: async () => ({ uid: context.auth.currentUser.uid }),
        uploadJoinPhoto: async () => { uploads++; if (uploadFails) throw new Error('upload failed'); return 'https://storage.example/photo.jpg'; },
        completeTripJoin: async data => {
            joins++;
            assert.equal(data.photoURL, 'https://storage.example/photo.jpg');
            if (joinFails) throw new Error('join failed');
            return { tripId: 'trip', orgId: 'org' };
        },
        setIsLoading() {}, setError() {}, Alert: { alert: (...args) => alerts.push(args) },
        navigation: { reset() { navigations++; } },
    };
    const source = fs.readFileSync(path.join(__dirname, '../../src/screens/auth/JoinFlowScreens.js'), 'utf8');
    const terms = source.slice(source.indexOf('export const JoinTermsScreen'));
    const start = terms.indexOf('    const handleContinue = async () => {');
    const end = terms.indexOf('    // Auto-join', start);
    vm.runInNewContext(terms.slice(start, end) + '\nthis.join = handleContinue;', context);
    await context.join();
    assert.equal(joins, 0);
    assert.equal(context.joiningRef.current, false);
    uploadFails = false;
    await context.join();
    assert.equal(uploads, 2);
    assert.equal(joins, 1);
    joinFails = false;
    await context.join();
    assert.equal(uploads, 2);
    assert.equal(joins, 2);
    assert.equal(navigations, 1);
    context.previousData.image = 'file://replacement';
    await context.join();
    assert.equal(uploads, 3);
    context.auth.currentUser.uid = 'other-owner';
    await context.join();
    assert.equal(uploads, 4);
    assert.equal(alerts.length, 2);
});
