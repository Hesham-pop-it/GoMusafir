const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

// Loads notificationService with a fake database and a fake FCM.
function load(users, records = {}) {
  const sent = [], singles = [], removed = [];
  const val = v => ({ exists: () => v != null, val: () => v });
  const db = { ref: p => ({
    get: async () => {
      const [, uid, field] = p.split('/');
      if (p.startsWith('users/')) return val(field === 'fcmToken' ? users[uid]?.token : users[uid]?.[field]);
      return val(records[p] ?? null);
    },
    remove: async () => { removed.push(p); },
    set: async () => {}, push: () => ({ key: 'k', set: async () => {} }),
  }) };
  const messaging = {
    send: async m => { singles.push(m); return 'id'; },
    sendEachForMulticast: async m => { sent.push(m); return { responses: m.tokens.map(t => t.startsWith('dead') ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true }) }; },
  };
  const target = path.resolve(__dirname, '../services/notificationService.js');
  const gate = require('../services/pushGate').createPushGate({ db });
  const originalLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (parent && parent.filename === target && request === '../admin') return { admin: { messaging: () => messaging }, db };
    if (parent && parent.filename === target && request === './pushGate') return { getPushGate: () => gate };
    return originalLoad.call(this, request, parent, ...rest);
  };
  delete require.cache[target];
  try { return { service: require(target), sent, singles, removed }; } finally { Module._load = originalLoad; }
}
const people = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`u${i}`, { token: `t${i}` }]));

test('deletion blocks single and multicast pushes using organization or trip context', async () => {
  const f = load({ a: { token: 'ta' }, b: { token: 'tb' } }, {
    'account_deletions/a': { at: 1 },
    'orgs/deleted/metadata/deleted_at': 1,
    'trips_orgs/trip': 'deleted',
  });
  await f.service.sendPushNotification('a', 'Title', 'Body');
  await f.service.sendPushNotification('b', 'Title', 'Body', { orgId: 'deleted' });
  await f.service.sendPushNotification('b', 'Title', 'Body', { tripId: 'trip' });
  await f.service.sendPushToMany(['a', 'b'], 'Title', 'Body', { tripId: 'trip' });
  await f.service.sendPushToMany(['a', 'b'], 'Title', 'Body', {}, { orgId: 'deleted' });
  assert.equal(f.singles.length, 0);
  assert.equal(f.sent.length, 0);
  await f.service.sendPushToMany(['a', 'b'], 'Title', 'Body');
  assert.deepEqual(f.sent.map(m => m.tokens), [['tb']]);
});

test('a thousand recipients go out in calls of at most 500 tokens, never as a topic', async () => {
  const f = load(people(1200));
  await f.service.sendPushToMany(Object.keys(people(1200)), 'Ann', 'hi', { type: 'chat_message', tripId: 't' }, { tripId: 't', androidChannelId: 'Chat' });
  assert.deepEqual(f.sent.map(m => m.tokens.length), [500, 500, 200]);
  assert.ok(f.sent.every(m => m.topic === undefined && m.token === undefined));
  assert.equal(f.singles.length, 0);
});

test('Do Not Disturb, muted trips and missing tokens are skipped; quiet people get a soundless push', async () => {
  const f = load({ a: { token: 'ta' }, b: { token: 'tb', preferences: { dnd_enabled: true } }, c: { token: 'tc', preferences: { muted_trips: { t: true } } }, d: {}, e: { token: 'te' } });
  await f.service.sendPushToMany(['a', 'b', 'c', 'd', 'e'], 'Ann', 'hi', { type: 'chat_message', tripId: 't' }, { tripId: 't', androidChannelId: 'Chat' }, async uid => uid === 'e');
  const byTokens = Object.fromEntries(f.sent.map(m => [m.tokens.join(), m]));
  assert.deepEqual(Object.keys(byTokens).sort(), ['ta', 'te']);
  assert.equal(byTokens.te.android.notification.defaultSound, false);
  assert.equal(byTokens.ta.android.notification.defaultSound, undefined);
});

test('tokens FCM reports as dead are removed from their owner', async () => {
  const f = load({ a: { token: 'dead1' }, b: { token: 'ok' } });
  await f.service.sendPushToMany(['a', 'b'], 'x', 'y', { type: 'chat_message' }, {});
  assert.deepEqual(f.removed, ['users/a/fcmToken']);
});

test('the push time to live equals the notification term', async () => {
  const f = load({ a: { token: 'ta' } });
  await f.service.sendPushNotification('a', 'Help', 'now', { type: 'location_request' }, { skipDbSave: true });
  const message = f.singles[0];
  assert.equal(message.token, 'ta');
  assert.ok(Math.abs(message.android.ttl - 86400000) < 5000);
  assert.ok(Math.abs(Number(message.apns.headers['apns-expiration']) - (Date.now() + 86400000) / 1000) < 5);
});

test('an open SOS keeps the default delivery window', async () => {
  const f = load({ a: { token: 'ta' } });
  await f.service.sendPushNotification('a', 'SOS', 'help', { type: 'emergency' }, { skipDbSave: true, interruptionLevel: 'time-sensitive' });
  assert.equal(f.singles[0].android.ttl, undefined);
  assert.equal(f.singles[0].apns.headers['apns-expiration'], undefined);
});
