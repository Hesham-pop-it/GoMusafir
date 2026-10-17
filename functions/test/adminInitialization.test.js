const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Admin initialization uses runtime credentials instead of bundled private keys', () => {
  const calls = [];
  const admin = { apps: [], initializeApp: options => calls.push(options),
    database: () => 'db', auth: () => 'auth', storage: () => 'storage' };
  const module = { exports: {} };
  const context = { module, process: { env: {} }, require: name => {
    assert.equal(name, 'firebase-admin', 'Initialization must not load a local key file');
    return admin;
  } };
  const source = fs.readFileSync(require.resolve('../admin'), 'utf8');
  vm.runInNewContext(source, context);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].credential, undefined);
  assert.equal(calls[0].databaseURL, 'https://go-musafir-default-rtdb.europe-west1.firebasedatabase.app');
  assert.equal(module.exports.db, 'db');
  admin.apps.push({});
  vm.runInNewContext(source, { ...context, module: { exports: {} } });
  assert.equal(calls.length, 1, 'An existing Admin app must be reused');
});

test('Firebase deployment excludes Admin SDK key files', () => {
  const config = require('../../firebase.json');
  assert.ok(config.functions[0].ignore.includes('**/*firebase-adminsdk*.json'));
});
