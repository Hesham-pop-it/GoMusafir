const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('resolveSos calls the server callable with the trip and the notification', async () => {
  const source = fs.readFileSync(require.resolve('../../src/services/visibilityData.js'), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const calls = [];
  const api = vm.runInNewContext(source + '\n({resolveSos})', {
    auth: {}, functions: {}, URL, console, httpsCallable: (_, name) => async params => { calls.push({ name, params }); return { data: {} }; },
    useState: () => ['', () => {}], useEffect: () => {}, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  });
  await api.resolveSos('t1', 'n1');
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ name: 'resolveSos', params: { tripId: 't1', notificationId: 'n1' } }]);
});

test('the notification screen offers the resolve action only on SOS items, with translated labels', () => {
  const screen = fs.readFileSync(require.resolve('../../src/screens/notifications/NotificationScreen.js'), 'utf8');
  assert.match(screen, /item\.type === 'emergency' && \(item\.resolved_at/);
  const translations = fs.readFileSync(require.resolve('../../src/constants/translations.js'), 'utf8');
  for (const key of ['notif_sos_resolve', 'notif_sos_resolved']) {
    assert.match(screen, new RegExp(`t\\('${key}'\\)`));
    assert.match(translations, new RegExp(`^    ${key}: "`, 'm'));
  }
});
