const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture({ denied = false, unavailable = false } = {}) {
  let checks = 0, reservations = 0, minted = 0;
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const module = { exports: {} };
  const onCall = (_, handler) => handler;
  vm.runInNewContext(fs.readFileSync(require.resolve('../groups/voiceFunctions'), 'utf8'), {
    module, exports: module.exports, Date, Math, console: { error() {} },
    process: { env: { LIVEKIT_API_KEY: 'test', LIVEKIT_API_SECRET: 'test', LIVEKIT_URL: 'wss://voice.example.com' } },
    require: name => {
      if (name === 'firebase-functions/v2/https') return { onCall, onRequest: onCall, HttpsError };
      if (name.includes('participantAccessMiddleware')) return { onCall: (_, handler) => async request => {
        checks++; return handler(request);
      } };
      if (name.includes('participantAccessService')) return { requireTripAccess: async () => {
        checks++;
        if (denied) throw new HttpsError('permission-denied', 'Access denied');
        return { orgId: 'o', staff: true };
      } };
      if (name.includes('tripVoiceService')) return { reserveSession: async () => {
        reservations++;
        if (unavailable) throw new Error('LiveKit request timed out');
        return { tripEndsAt: Date.now() + 86400000, voiceAccess: 'PRE_TRIP_LIMITED',
          preTripVoiceRemainingSeconds: 3500, session: { roomName: 'reserved-room' } };
      } };
      if (name === 'firebase-functions/v2/database') return { onValueWritten: onCall };
      if (name === '../admin') return { db: { ref: () => ({ get: async () => ({ val: () => null }) }) } };
      if (name === 'livekit-server-sdk') return { AccessToken: class {
        constructor() { minted++; }
        addGrant(grant) {
          assert.equal(grant.room, 'reserved-room');
          assert.equal(grant.canPublish, false, 'joining must not bypass the speaker allocator');
          assert.equal(grant.canSubscribe, true);
        }
        async toJwt() { return 'signed-token'; }
      }, WebhookReceiver: class {} };
      throw new Error(name);
    },
  });
  return { run: () => module.exports.generateLiveKitToken({ data: { tripId: 't' }, auth: { uid: 'host', token: {} } }),
    counts: () => ({ checks, reservations, minted }) };
}

test('token generation checks trip access once and uses the metered room', async () => {
  const f = fixture();
  assert.equal((await f.run()).token, 'signed-token');
  assert.deepEqual(f.counts(), { checks: 1, reservations: 1, minted: 1 });
});
test('denied access cannot reserve a session or mint a token', async () => {
  const f = fixture({ denied: true });
  await assert.rejects(f.run(), { code: 'permission-denied' });
  assert.deepEqual(f.counts(), { checks: 1, reservations: 0, minted: 0 });
});
test('session preparation failure reports service unavailability and issues no token', async () => {
  const f = fixture({ unavailable: true });
  await assert.rejects(f.run(), { code: 'unavailable', message: 'The Voice service could not prepare this session. Please try again shortly.' });
  assert.equal(f.counts().minted, 0);
});
