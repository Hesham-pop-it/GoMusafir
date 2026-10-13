const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class HttpsError extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const B = 'trips_active/org/trip';
const visibleEveryone = { visibility_config: { name: 'Show to everyone' } };

// In-memory RTDB addressed by full path; multi-path update() writes each path.
function fakeDb(initial) {
  const store = { ...initial }; let counter = 0;
  const under = prefix => Object.keys(store).filter(k => k === prefix || k.startsWith(`${prefix}/`));
  const read = p => {
    if (p in store) return store[p];
    const kids = under(p);
    if (!kids.length) return null;
    const out = {};
    for (const k of kids) out[k.slice(p.length + 1).split('/')[0]] = read(`${p}/${k.slice(p.length + 1).split('/')[0]}`);
    return out;
  };
  const write = (p, v) => {
    for (const k of under(p)) delete store[k];
    if (v === null || v === undefined) return;
    if (v && typeof v === 'object') for (const [k, c] of Object.entries(v)) write(`${p}/${k}`, c);
    else store[p] = v;
  };
  const ref = p => ({
    get: async () => { const v = read(p); return { exists: () => v !== null, val: () => v }; },
    set: async v => write(p, v),
    remove: async () => write(p, null),
    update: async v => { for (const [k, c] of Object.entries(v)) write(p ? `${p}/${k}` : k, c); },
    push: () => { const key = `k${++counter}`; const r = ref(`${p}/${key}`); r.key = key; return r; },
    transaction: async fn => {
      const next = fn(read(p));
      if (next === undefined) return { committed: false };
      write(p, next); return { committed: true };
    },
  });
  return { ref, store, read };
}

function load(file, { data = {}, trip = visibleEveryone, staffAccess = false, inVoice = [] } = {}) {
  const db = fakeDb(data); const pushes = [];
  const handlers = [];
  const dependencies = {
    'firebase-functions/v2/https': { HttpsError, onCall: (opts, handler) => handler },
    'firebase-functions/v2/database': { onValueCreated: (opts, handler) => handler },
    '../admin': { admin: { database: { ServerValue: { TIMESTAMP: 'TS' } } }, db },
    '../services/participantAccessService': { requireTripAccess: async request => ({
      orgId: 'org', trip, staff: staffAccess || request.auth.uid.startsWith('staff') }) },
    '../services/participantProfileService': { visible: (() => {
      // Load the real visibility rule without its heavy imports.
      const m = { exports: {} };
      const src = fs.readFileSync(path.join(__dirname, '../services/participantProfileService.js'), 'utf8');
      vm.runInNewContext(src, { module: m, exports: m.exports, require: k => (k === './participantAccessService' ? {} : {}) });
      return m.exports.visible;
    })() },
    '../services/kmsService': { decrypt: v => v },
    '../services/notificationService': { sendPushNotification: async (uid, title, body, payload, options) => {
      pushes.push({ uid, title, body, payload, options });
    } },
    '../services/voicePresenceService': { isInVoice: async (o, t, uid) => inVoice.includes(uid) },
    '../middleware/appCheckMiddleware': { verifyAppCheck: () => {} },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    module, exports: module.exports, Date, Object, Array, JSON, String, Promise, Math, Map, console,
    require: key => { if (!(key in dependencies)) throw Error(`Unexpected dependency ${key}`); return dependencies[key]; },
  });
  return { fns: module.exports, db, pushes, handlers };
}
const load_ = (opts) => load('../groups/messagingFunctions.js', opts);

function world(extra = {}) {
  return {
    'trips_participants/trip/alice': true, 'trips_participants/trip/bob': true,
    'orgs/org/staff/staff1': 'admin', 'orgs/org/staff/staff2': 'co-host',
    'users/alice/profile/firstName': 'Alice', 'users/alice/profile/lastName': 'A',
    'users/bob/profile/firstName': 'Bob', 'users/bob/profile/lastName': 'B',
    'users/staff1/profile/firstName': 'Sam', 'users/staff1/profile/lastName': 'S',
    'users/staff2/profile/firstName': 'Sue', ...extra,
  };
}
const call = (fn, uid, data) => fn({ auth: { uid, token: {} }, data });
const send = (f, uid = 'alice', data = {}) => call(f.fns.sendMessageRequest, uid, { tripId: 'trip', targetUid: 'bob', text: 'Hello Bob', ...data });
const reject = async (promise, code, message) => assert.rejects(promise, e => e.code === code && (!message || e.message === message));

test('eligible request writes thread, message and both inbox rows in one go', async () => {
  const f = load_({ data: world() });
  assert.equal((await send(f)).threadId, 'alice_bob');
  const thread = f.db.read(`${B}/dm_threads/alice_bob`);
  assert.equal(thread.status, 'pending'); assert.equal(thread.requester, 'alice');
  assert.equal(Object.keys(thread.members).sort().join(), 'alice,bob');
  const [message] = Object.values(f.db.read(`${B}/dm_messages/alice_bob`));
  assert.equal(message.type, 'text'); assert.equal(message.text, 'Hello Bob'); assert.equal(message.timestamp, 'TS');
  assert.equal(f.db.read(`${B}/inbox/alice/alice_bob`).kind, 'request_out');
  const inboxBob = f.db.read(`${B}/inbox/bob/alice_bob`);
  assert.equal(inboxBob.kind, 'request_in'); assert.equal(inboxBob.unread, 1);
});

test('request push never contains the message text and adds a trip notification', async () => {
  const f = load_({ data: world() });
  await send(f, 'alice', { text: 'secret words' });
  assert.equal(f.pushes.length, 1);
  const [push] = f.pushes;
  assert.equal(push.uid, 'bob'); assert.equal(push.title, 'Message request');
  assert.equal(push.body, 'Message request from Alice'); assert.equal(push.payload.type, 'dm_request');
  assert.ok(!JSON.stringify(push).includes('secret words'));
  const items = Object.values(f.db.read(`${B}/notifications/bob`));
  assert.equal(items.length, 1); assert.equal(items[0].type, 'dm_request');
  assert.ok(!JSON.stringify(items).includes('secret words'));
});

test('every eligibility failure returns the same not-eligible error', async () => {
  const cases = {
    'staff caller': [world(), 'staff1', undefined],
    'target not in trip': [(() => { const w = world(); delete w['trips_participants/trip/bob']; return w; })()],
    'target is staff': [world({ 'trips_participants/trip/staff2': true })],
    'blocked by caller': [world({ [`${B}/blocks/alice/bob`]: true })],
    'blocked by target': [world({ [`${B}/blocks/bob/alice`]: true })],
    'requests nobody': [world({ [`${B}/message_settings/bob/requests`]: 'nobody' })],
    'hidden name': [world(), 'alice', { trip: { visibility_config: { name: 'Show to organizer' } } }],
  };
  for (const [name, [data, uid = 'alice', opts = {}]] of Object.entries(cases)) {
    const f = load_({ data, ...opts });
    const target = name === 'target is staff' ? { targetUid: 'staff2' } : {};
    await assert.rejects(send(f, uid, target), e => e.code === 'failed-precondition' && e.message === 'not-eligible', name);
    assert.equal(f.db.read(`${B}/dm_threads`), null, name);
    assert.equal(f.pushes.length, 0, name);
  }
});

test('an existing thread returns already-exists with its id', async () => {
  const f = load_({ data: world({ [`${B}/dm_threads/alice_bob/status`]: 'pending' }) });
  await assert.rejects(send(f), e => e.code === 'already-exists' && e.details.threadId === 'alice_bob');
  const g = load_({ data: world({ [`${B}/dm_threads/alice_bob/status`]: 'pending' }) });
  await assert.rejects(send(g, 'bob', { targetUid: 'alice' }), e => e.code === 'already-exists' && e.details.threadId === 'alice_bob');
});

test('a thread created between the check and the claim aborts with already-exists', async () => {
  const f = load_({ data: world() });
  const realRef = f.db.ref;
  let raced = false;
  // Simulate the other side winning: the thread appears after the pre-check read.
  f.db.ref = p => {
    const r = realRef(p);
    if (p.endsWith('/dm_threads/alice_bob')) {
      const tx = r.transaction;
      r.transaction = async fn => {
        if (!raced) { raced = true; await realRef(p).set({ requester: 'bob', status: 'pending', members: { alice: true, bob: true } }); }
        return tx(fn);
      };
    }
    return r;
  };
  await assert.rejects(send(f), e => e.code === 'already-exists' && e.details.threadId === 'alice_bob');
  assert.equal(f.db.read(`${B}/dm_threads/alice_bob`).requester, 'bob');
  assert.equal(f.db.read(`${B}/dm_messages`), null);
  assert.equal(f.pushes.length, 0);
});

test('invalid input and the hourly limit are rejected', async () => {
  const f = load_({ data: world() });
  await reject(send(f, 'alice', { text: '   ' }), 'invalid-argument');
  await reject(send(f, 'alice', { text: 'x'.repeat(501) }), 'invalid-argument');
  const g = load_({ data: world() });
  for (let i = 0; i < 10; i++) await send(g, 'carol', { targetUid: 'bob' }).catch(() => {});
  await reject(send(g, 'carol', { targetUid: 'bob' }), 'resource-exhausted');
});

async function pendingThread() {
  const f = load_({ data: world() });
  await send(f); f.pushes.length = 0;
  return f;
}
const respond = (f, uid, action) => call(f.fns.respondToMessageRequest, uid, { tripId: 'trip', threadId: 'alice_bob', action });

test('decline is silent for the sender, then accept works from declined', async () => {
  const f = await pendingThread();
  await respond(f, 'bob', 'decline');
  assert.ok(f.db.read(`${B}/dm_private/bob/alice_bob`).declined_at);
  assert.equal(f.db.read(`${B}/inbox/bob/alice_bob`).kind, 'declined');
  assert.equal(f.db.read(`${B}/inbox/alice/alice_bob`).kind, 'request_out');
  assert.equal(f.db.read(`${B}/dm_threads/alice_bob`).status, 'pending');
  assert.equal(f.pushes.length, 0);
  await respond(f, 'bob', 'accept');
  const thread = f.db.read(`${B}/dm_threads/alice_bob`);
  assert.equal(thread.status, 'accepted'); assert.equal(thread.accepted_at, 'TS');
  assert.equal(f.db.read(`${B}/inbox/bob/alice_bob`).kind, 'dm');
  assert.equal(f.db.read(`${B}/inbox/alice/alice_bob`).kind, 'dm');
  assert.equal(f.db.read(`${B}/dm_private/bob`), null);
});

test('only the non-requester can respond', async () => {
  const f = await pendingThread();
  await reject(respond(f, 'alice', 'accept'), 'failed-precondition', 'not-eligible');
  await reject(respond(f, 'carol', 'accept'), 'failed-precondition', 'not-eligible');
});

test('block writes the block and a report, removes my row, and alerts all staff', async () => {
  const f = await pendingThread();
  await respond(f, 'bob', 'block');
  assert.equal(f.db.read(`${B}/blocks/bob/alice`), true);
  const [report] = Object.values(f.db.read(`${B}/reports`));
  assert.equal(JSON.stringify(report), JSON.stringify({ reporter: 'bob', reported: 'alice', threadId: 'alice_bob', at: 'TS' }));
  assert.equal(f.db.read(`${B}/inbox/bob/alice_bob`), null);
  assert.equal(f.db.read(`${B}/inbox/alice/alice_bob`).kind, 'request_out');
  assert.equal(f.pushes.map(p => p.uid).sort().join(), ['staff1', 'staff2'].join());
  assert.ok(f.pushes.every(p => p.payload.type === 'message_report' && p.body === 'Bob B blocked and reported someone'));
  assert.equal(Object.keys(f.db.read(`${B}/notifications`)).sort().join(), 'bob,staff1,staff2');
  // The block now makes a new request from the sender look like any other ineligibility.
  await assert.rejects(send(f), e => e.message === 'not-eligible');
});

test('unblock removes the block', async () => {
  const f = load_({ data: world({ [`${B}/blocks/bob/alice`]: true }) });
  assert.equal((await call(f.fns.unblockParticipant, 'bob', { tripId: 'trip', uid: 'alice' })).ok, true);
  assert.equal(f.db.read(`${B}/blocks/bob/alice`), null);
});

const event = (params, data) => ({ params: { orgId: 'org', tripId: 'trip', ...params }, data: { val: () => data } });
const acceptedThread = { [`${B}/dm_threads/alice_bob`]: { members: { alice: true, bob: true }, requester: 'alice', status: 'accepted' } };

test('dm trigger skips a pending thread', async () => {
  const f = await pendingThread();
  await f.fns.onDirectMessageCreated(event({ threadId: 'alice_bob', messageId: 'm1' }, { sender_id: 'alice', text: 'hi', timestamp: 5 }));
  assert.equal(f.pushes.length, 0);
  assert.equal(f.db.read(`${B}/inbox/bob/alice_bob`).unread, 1);
});

test('dm trigger updates both rows, increments peer unread and pushes the text', async () => {
  const f = load_({ data: world({ ...acceptedThread, [`${B}/inbox/bob/alice_bob/unread`]: 2 }) });
  await f.fns.onDirectMessageCreated(event({ threadId: 'alice_bob', messageId: 'm1' }, { sender_id: 'alice', sender_name: 'Alice', text: 'hi bob', timestamp: 5 }));
  assert.equal(f.db.read(`${B}/inbox/bob/alice_bob`).unread, 3);
  assert.equal(f.db.read(`${B}/inbox/bob/alice_bob`).last_text, 'hi bob');
  assert.equal(f.db.read(`${B}/inbox/alice/alice_bob`).last_at, 5);
  assert.equal(f.db.read(`${B}/inbox/alice/alice_bob/unread`), null);
  assert.equal(f.pushes.length, 1);
  assert.equal(f.pushes[0].uid, 'bob'); assert.equal(f.pushes[0].body, 'hi bob'); assert.equal(f.pushes[0].payload.type, 'dm_message');
  assert.equal(f.pushes[0].options.quiet, undefined);
});

test('quiet when the recipient is in the voice channel', async () => {
  const f = load_({ data: world(acceptedThread), inVoice: ['bob'] });
  await f.fns.onDirectMessageCreated(event({ threadId: 'alice_bob', messageId: 'm1' }, { sender_id: 'alice', text: 'hi' }));
  assert.equal(f.pushes[0].options.quiet, true);
});

const team = (f, sender, text = 'help', name = 'X') => f.fns.onTeamMessageCreated(
  event({ pilgrimUid: 'alice', messageId: `m${Math.random()}` }, { sender_id: sender, sender_name: name, text, timestamp: 9 }));

test('pilgrim team message pushes every staff member and marks needs_reply', async () => {
  const f = load_({ data: world() });
  await team(f, 'alice', 'where is the bus');
  assert.equal(f.pushes.map(p => p.uid).sort().join(), ['staff1', 'staff2'].join());
  assert.ok(f.pushes.every(p => p.title === 'Alice A · Journey team' && p.body === 'where is the bus' && p.payload.type === 'team_message'));
  assert.ok(f.pushes.every(p => p.options.collapseKey === 'team_alice' && !p.options.quiet));
  const meta = f.db.read(`${B}/team_meta/alice`);
  assert.equal(meta.needs_reply, true); assert.equal(meta.last_text, 'where is the bus'); assert.equal(meta.last_sender_id, 'alice');
});

test('a second pilgrim message while needs_reply is quiet', async () => {
  const f = load_({ data: world() });
  await team(f, 'alice', 'one');
  f.pushes.length = 0;
  await team(f, 'alice', 'two');
  assert.equal(f.pushes.length, 2);
  assert.ok(f.pushes.every(p => p.options.quiet === true && p.options.collapseKey === 'team_alice'));
});

test('staff reply pushes only the pilgrim and records who replied', async () => {
  const f = load_({ data: world() });
  await team(f, 'alice', 'question');
  f.pushes.length = 0;
  await team(f, 'staff1', 'on its way', 'Sam S');
  assert.equal(f.pushes.map(p => p.uid).join(), ['alice'].join());
  assert.equal(f.pushes[0].title, 'Sam S (Admin) · Journey team'); assert.equal(f.pushes[0].payload.type, 'team_message');
  const meta = f.db.read(`${B}/team_meta/alice`);
  assert.equal(meta.needs_reply, false); assert.equal(meta.replied_by, 'Sam S');
  assert.equal(meta.replied_by_uid, 'staff1'); assert.equal(meta.replied_role, 'admin');
  assert.equal(Object.values(f.db.read(`${B}/notifications/alice`))[0].type, 'team_message');
  assert.equal(f.db.read(`${B}/notifications/staff2`), null);
  // The next pilgrim message sounds again because the thread was replied to.
  f.pushes.length = 0;
  await team(f, 'alice', 'thanks');
  assert.ok(f.pushes.every(p => !p.options.quiet));
});

test('team message from someone else is ignored', async () => {
  const f = load_({ data: world() });
  await team(f, 'bob');
  assert.equal(f.pushes.length, 0); assert.equal(f.db.read(`${B}/team_meta`), null);
});

test('staff chat pushes the other staff but not the sender, quiet in voice', async () => {
  const f = load_({ data: world(), inVoice: ['staff2'] });
  await f.fns.onStaffChatCreated(event({ messageId: 'm1' }, { sender_id: 'staff1', sender_name: 'Sam S', text: 'meet at 5' }));
  assert.equal(f.pushes.map(p => p.uid).join(), ['staff2'].join());
  assert.equal(f.pushes[0].body, 'meet at 5'); assert.equal(f.pushes[0].payload.type, 'staff_chat');
  assert.equal(f.pushes[0].options.quiet, true);
});

function notifications({ inVoice = [] } = {}) {
  const pushes = [];
  const db = fakeDb({ 'trips_participants/trip/alice': true, 'trips_participants/trip/bob': true, 'orgs/org/staff/staff1': 'admin' });
  const dependencies = {
    'firebase-functions/v2/database': { onValueCreated: (o, h) => h, onValueWritten: (o, h) => h },
    '../services/notificationService': { sendPushNotification: async (uid, t, b, p, o) => pushes.push({ uid, o }) },
    '../admin': { db: { ref: p => ({ once: async () => ({ val: () => db.read(p) }), push: () => ({ set: async () => {} }) }) } },
    '../services/voicePresenceService': { isInVoice: async (o, t, uid) => inVoice.includes(uid) },
  };
  const module = { exports: {} };
  const src = fs.readFileSync(path.join(__dirname, '../groups/notificationFunctions.js'), 'utf8');
  vm.runInNewContext(src, { module, exports: module.exports, console, Date, Object, Array, Set, String, Promise,
    require: key => { if (!(key in dependencies)) throw Error(`Unexpected dependency ${key}`); return dependencies[key]; } });
  return { fn: module.exports.onChatCreated, pushes };
}

test('onChatCreated skips system lines and is quiet for recipients in voice', async () => {
  const n = notifications({ inVoice: ['bob'] });
  await n.fn(event({ messageId: 'm1' }, { sender_id: 'system', sender_name: 'GoMusafir', type: 'system', text: 'Voice chat started' }));
  assert.equal(n.pushes.length, 0);
  await n.fn(event({ messageId: 'm2' }, { sender_id: 'alice', sender_name: 'Alice', text: 'hello' }));
  const byUid = Object.fromEntries(n.pushes.map(p => [p.uid, p.o]));
  assert.equal(Object.keys(byUid).sort().join(), 'bob,staff1');
  assert.equal(byUid.bob.quiet, true); assert.equal(byUid.staff1.quiet, undefined);
});
