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
      vm.runInNewContext(src, { module: m, exports: m.exports, require: k => {
        if (k === './visibilityPolicy') return require('../services/visibilityPolicy');
        if (['firebase-functions/v2/https', '../admin', './participantAccessService', './kmsService'].includes(k)) return {};
        throw Error(`Unexpected participant profile dependency ${k}`);
      } });
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
  // Block and decline look the same to the sender: the existing thread answers first.
  await assert.rejects(send(f), e => e.code === 'already-exists' && e.details.threadId === 'alice_bob');
});

test('block then unblock then accept writes complete inbox rows for both sides', async () => {
  const f = await pendingThread();
  await respond(f, 'bob', 'block');
  await call(f.fns.unblockParticipant, 'bob', { tripId: 'trip', uid: 'alice' });
  f.db.ref(`${B}/inbox/alice/alice_bob`).remove();
  await respond(f, 'bob', 'accept');
  const mine = f.db.read(`${B}/inbox/bob/alice_bob`);
  assert.equal(mine.kind, 'dm'); assert.equal(mine.peer, 'alice'); assert.equal(mine.unread, 0);
  assert.equal(mine.peer_name, 'Alice'); assert.equal(mine.last_text, 'Hello Bob'); assert.ok(mine.last_at);
  const theirs = f.db.read(`${B}/inbox/alice/alice_bob`);
  assert.equal(theirs.kind, 'dm'); assert.equal(theirs.peer, 'bob'); assert.equal(theirs.peer_name, 'Bob');
});

test('last name and photo are masked unless visible to everyone', async () => {
  const photos = { 'users/alice/profile/photoURL': 'a.jpg', 'users/bob/profile/photoURL': 'b.jpg' };
  const hidden = load_({ data: world(photos) });
  await send(hidden);
  assert.equal(hidden.db.read(`${B}/inbox/alice/alice_bob`).peer_name, 'Bob');
  assert.equal(hidden.db.read(`${B}/inbox/bob/alice_bob`).peer_name, 'Alice');
  const [hiddenMessage] = Object.values(hidden.db.read(`${B}/dm_messages/alice_bob`));
  assert.equal(hiddenMessage.sender_name, 'Alice'); assert.equal(hiddenMessage.avatar, '');
  assert.equal(hidden.pushes[0].payload.senderImage, '');
  const open = load_({ data: world(photos), trip: { visibility_config: { name: 'Show to everyone', lastname: 'Show to everyone', photo: 'Show to everyone' } } });
  await send(open);
  assert.equal(open.db.read(`${B}/inbox/alice/alice_bob`).peer_name, 'Bob B');
  const [openMessage] = Object.values(open.db.read(`${B}/dm_messages/alice_bob`));
  assert.equal(openMessage.sender_name, 'Alice A'); assert.equal(openMessage.avatar, 'a.jpg');
});

test('unblock removes the block', async () => {
  const f = load_({ data: world({ [`${B}/blocks/bob/alice`]: true }) });
  assert.equal((await call(f.fns.unblockParticipant, 'bob', { tripId: 'trip', uid: 'alice' })).ok, true);
  assert.equal(f.db.read(`${B}/blocks/bob/alice`), null);
});

const open = (f, uid, targetUid) => call(f.fns.openStaffChat, uid, { tripId: 'trip', targetUid });
const privateChat = { [`${B}/dm_threads/alice_staff1`]: { members: { alice: true, staff1: true }, requester: 'alice', status: 'accepted', staff: 'staff1' } };

test('a pilgrim opens a private chat with a staff member: accepted thread and both inbox rows, names never masked', async () => {
  const f = load_({ data: world() });
  assert.equal((await open(f, 'alice', 'staff1')).threadId, 'alice_staff1');
  const thread = f.db.read(`${B}/dm_threads/alice_staff1`);
  assert.equal(thread.status, 'accepted'); assert.equal(thread.staff, 'staff1'); assert.equal(thread.requester, 'alice');
  assert.equal(Object.keys(thread.members).sort().join(), 'alice,staff1');
  const mine = f.db.read(`${B}/inbox/alice/alice_staff1`);
  assert.equal(mine.kind, 'dm'); assert.equal(mine.staff, true); assert.equal(mine.peer, 'staff1'); assert.equal(mine.peer_name, 'Sam S'); assert.equal(mine.unread, 0);
  const theirs = f.db.read(`${B}/inbox/staff1/alice_staff1`);
  assert.equal(theirs.kind, 'dm'); assert.equal(theirs.staff, true); assert.equal(theirs.peer, 'alice'); assert.equal(theirs.peer_name, 'Alice A');
  assert.equal(f.pushes.length, 0);
});

test('a staff member opens a private chat with a pilgrim, and opening again returns the same thread untouched', async () => {
  const f = load_({ data: world() });
  assert.equal((await open(f, 'staff2', 'bob')).threadId, 'bob_staff2');
  assert.equal(f.db.read(`${B}/dm_threads/bob_staff2`).staff, 'staff2');
  f.db.ref(`${B}/inbox/bob/bob_staff2/unread`).set(4);
  assert.equal((await open(f, 'bob', 'staff2')).threadId, 'bob_staff2');
  assert.equal(f.db.read(`${B}/inbox/bob/bob_staff2/unread`), 4);
  assert.equal(f.db.read(`${B}/dm_threads/bob_staff2`).requester, 'staff2');
});

test('opening a private staff chat is refused for anything but pilgrim and staff', async () => {
  const f = load_({ data: world({ 'trips_participants/trip/carol': true }) });
  await reject(open(f, 'alice', 'bob'), 'failed-precondition', 'not-eligible');
  await reject(open(f, 'alice', 'alice'), 'failed-precondition', 'not-eligible');
  await reject(open(f, 'staff1', 'staff2'), 'failed-precondition', 'not-eligible');
  await reject(open(f, 'staff1', 'stranger'), 'failed-precondition', 'not-eligible');
  await reject(call(f.fns.openStaffChat, 'alice', { tripId: 'trip' }), 'invalid-argument');
  assert.equal(f.db.read(`${B}/dm_threads`), null);
});

test('pilgrims still cannot send a message request to staff', async () => {
  const f = load_({ data: world() });
  await reject(send(f, 'alice', { targetUid: 'staff1' }), 'failed-precondition', 'not-eligible');
});

test('block is refused on a private staff chat, even for the staff side', async () => {
  const f = load_({ data: world(privateChat) });
  await reject(call(f.fns.respondToMessageRequest, 'staff1', { tripId: 'trip', threadId: 'alice_staff1', action: 'block' }), 'failed-precondition', 'not-eligible');
  assert.equal(f.db.read(`${B}/blocks`), null); assert.equal(f.db.read(`${B}/reports`), null);
});

const report = (f, uid = 'alice', threadId = 'alice_staff1') => call(f.fns.reportStaffChat, uid, { tripId: 'trip', threadId });

test('the pilgrim reports a private staff chat: report, report access and a push to the other Admins only', async () => {
  const f = load_({ data: world({ ...privateChat, 'orgs/org/staff/staff3': 'admin', 'orgs/org/staff/staff4': 'manager', 'users/staff3/profile/firstName': 'Tom' }) });
  assert.equal((await report(f)).ok, true);
  assert.equal(f.db.read(`${B}/report_access/alice_staff1`), true);
  const [entry] = Object.values(f.db.read(`${B}/reports`));
  assert.equal(entry.reporter, 'alice'); assert.equal(entry.reported, 'staff1'); assert.equal(entry.threadId, 'alice_staff1'); assert.equal(entry.staffThread, true);
  assert.equal(f.pushes.map(p => p.uid).join(), 'staff3');
  assert.equal(f.pushes[0].body, 'Alice A reported a private chat with Sam S'); assert.equal(f.pushes[0].payload.type, 'message_report');
  assert.equal(Object.values(f.db.read(`${B}/notifications/staff3`))[0].type, 'message_report');
  assert.equal(f.db.read(`${B}/notifications/staff1`), null);
});

test('reporting twice is idempotent and only the pilgrim of a private staff chat can report', async () => {
  const f = load_({ data: world({ ...privateChat, 'orgs/org/staff/staff3': 'admin' }) });
  await report(f); f.pushes.length = 0;
  assert.equal((await report(f)).ok, true);
  assert.equal(f.pushes.length, 0); assert.equal(Object.keys(f.db.read(`${B}/reports`)).length, 1);
  const g = load_({ data: world({ ...privateChat, ...acceptedThread }) });
  await reject(report(g, 'staff1'), 'failed-precondition', 'not-eligible');
  await reject(report(g, 'bob'), 'failed-precondition', 'not-eligible');
  await reject(report(g, 'alice', 'alice_bob'), 'failed-precondition', 'not-eligible');
  await reject(report(g, 'alice', 'missing'), 'failed-precondition', 'not-eligible');
  assert.equal(g.db.read(`${B}/report_access`), null);
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

test('dm push title is built server-side from the masked name, not the message sender_name', async () => {
  const hidden = load_({ data: world(acceptedThread) });
  await hidden.fns.onDirectMessageCreated(event({ threadId: 'alice_bob', messageId: 'm1' }, { sender_id: 'alice', sender_name: 'Alice A', avatar: 'a.jpg', text: 'hi' }));
  assert.equal(hidden.pushes[0].title, 'Someone'); assert.equal(hidden.pushes[0].payload.senderImage, '');
  const firstOnly = load_({ data: world({ ...acceptedThread, 'orgs/org/trips/trip/visibility_config/name': 'Show to everyone' }) });
  await firstOnly.fns.onDirectMessageCreated(event({ threadId: 'alice_bob', messageId: 'm1' }, { sender_id: 'alice', sender_name: 'Alice A', text: 'hi' }));
  assert.equal(firstOnly.pushes[0].title, 'Alice');
  const full = load_({ data: world({ ...acceptedThread, 'orgs/org/trips/trip/visibility_config/name': 'Show to everyone',
    'orgs/org/trips/trip/visibility_config/lastname': 'Show to everyone' }) });
  await full.fns.onDirectMessageCreated(event({ threadId: 'alice_bob', messageId: 'm1' }, { sender_id: 'alice', text: 'hi' }));
  assert.equal(full.pushes[0].title, 'Alice A');
});

test('private staff chat push shows full names, the staff role and the photo whatever the visibility settings say', async () => {
  const photos = { 'users/alice/profile/photoURL': 'a.jpg', 'users/staff1/profile/photoURL': 's.jpg' };
  const f = load_({ data: world({ ...privateChat, ...photos, [`${B}/inbox/alice/alice_staff1/staff`]: true }) });
  await f.fns.onDirectMessageCreated(event({ threadId: 'alice_staff1', messageId: 'm1' }, { sender_id: 'staff1', sender_name: 'x', text: 'salaam' }));
  assert.equal(f.pushes[0].uid, 'alice'); assert.equal(f.pushes[0].title, 'Sam S (Admin)');
  assert.equal(f.pushes[0].payload.name, 'Sam S'); assert.equal(f.pushes[0].payload.senderImage, 's.jpg');
  assert.equal(f.db.read(`${B}/inbox/alice/alice_staff1`).staff, true); assert.equal(f.db.read(`${B}/inbox/alice/alice_staff1`).unread, 1);
  f.pushes.length = 0;
  await f.fns.onDirectMessageCreated(event({ threadId: 'alice_staff1', messageId: 'm2' }, { sender_id: 'alice', text: 'thanks' }));
  assert.equal(f.pushes[0].uid, 'staff1'); assert.equal(f.pushes[0].title, 'Alice A'); assert.equal(f.pushes[0].payload.senderImage, 'a.jpg');
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
  const pushes = [], written = {}, signals = [];
  const db = fakeDb({ 'trips_participants/trip/alice': true, 'trips_participants/trip/bob': true, 'orgs/org/staff/staff1': 'admin',
    'users/staff1': { profile: { firstName: 'Sam', lastName: 'Host' } } });
  const dependencies = {
    'firebase-functions/v2/database': { onValueCreated: (o, h) => h, onValueUpdated: (o, h) => h, onValueWritten: (o, h) => h },
    '../services/notificationService': {
      sendPushNotification: async (uid, t, b, p, o) => pushes.push({ uid, o }),
      sendPushToMany: async (uids, t, b, p, o, quietFor) => { for (const uid of uids) pushes.push({ uid, o: await quietFor(uid) ? { ...o, quiet: true } : o }); },
    },
    '../services/notificationStamp': { stampNotification: async () => null, onlyStamped: () => false },
    '../services/tripSignals': {
      signalChat: async (d, o, t, id) => signals.push(['chat', id]),
      signalVoice: async (d, o, t, id) => signals.push(['voice', id]),
      signalNotifications: async (d, o, t, uid, id) => signals.push(['notifications', uid, id]),
    },
    '../admin': { admin: { database: { ServerValue: { TIMESTAMP: 'TS' } } }, db: { ref: p => ({
      once: async () => { const v = db.read(p) ?? written[p] ?? null; return { val: () => v, exists: () => v != null }; },
      push: () => ({ set: async () => {} }),
      set: async v => { written[p] = v; } }) } },
    '../services/kmsService': { decrypt: v => v },
    '../services/voicePresenceService': { isInVoice: async (o, t, uid) => inVoice.includes(uid) },
  };
  const module = { exports: {} };
  const src = fs.readFileSync(path.join(__dirname, '../groups/notificationFunctions.js'), 'utf8');
  vm.runInNewContext(src, { module, exports: module.exports, console, Date, Object, Array, Set, String, Promise, Number,
    Math, JSON, require: key => { if (!(key in dependencies)) throw Error(`Unexpected dependency ${key}`); return dependencies[key]; } });
  return { fn: module.exports.onChatCreated, voice: module.exports.onVoiceChannelUpdated, pushes, written, signals };
}

test('onChatCreated skips system lines and is quiet for recipients in voice', async () => {
  const n = notifications({ inVoice: ['bob'] });
  await n.fn(event({ messageId: 'm1' }, { sender_id: 'system', sender_name: 'GoMusafir', type: 'system', text: 'Voice chat started' }));
  assert.equal(n.pushes.length, 0);
  await n.fn(event({ messageId: 'm2' }, { sender_id: 'alice', sender_name: 'Alice', text: 'hello' }));
  const byUid = Object.fromEntries(n.pushes.map(p => [p.uid, p.o]));
  assert.equal(Object.keys(byUid).sort().join(), 'bob,staff1');
  assert.equal(byUid.bob.quiet, true); assert.equal(byUid.staff1.quiet, undefined);
  // Both lines move the chat signal, the system line included.
  assert.deepEqual(n.signals, [['chat', 'm1'], ['chat', 'm2']]);
});

const CHAT = 'trips_active/org/trip/chat/';
const voiceEvent = (before, after) => ({ id: 'ev1', params: { orgId: 'org', tripId: 'trip' },
  data: { before: { val: () => before }, after: { val: () => after } } });

test('voice start writes one system chat line keyed by the session, naming the starter', async () => {
  const n = notifications();
  const started = { isChannelStarted: true, lastUpdatedBy: 'staff1', sessionRequestedAt: 1000 };
  await n.voice(voiceEvent({ isChannelStarted: false }, started));
  assert.deepEqual(JSON.parse(JSON.stringify(n.written[CHAT + 'voice_start_1000'])),
    { type: 'system', sender_id: 'system', sender_name: 'GoMusafir', text: 'Voice chat started by Sam Host', timestamp: 'TS' });
  await n.voice(voiceEvent({ isChannelStarted: false }, started));
  assert.equal(Object.keys(n.written).length, 1);
});

test('voice start without a known starter falls back to the plain line', async () => {
  const n = notifications();
  await n.voice(voiceEvent({}, { isChannelStarted: true, lastUpdatedBy: 'system', sessionRequestedAt: 5 }));
  assert.equal(n.written[CHAT + 'voice_start_5'].text, 'Voice chat started');
});

test('voice end writes the duration in whole minutes, at least one', async () => {
  const n = notifications();
  const realNow = Date.now;
  try {
    Date.now = () => 1000 + 42 * 60000 + 20000;
    await n.voice(voiceEvent({ isChannelStarted: true, sessionRequestedAt: 1000 }, { isChannelStarted: false, sessionRequestedAt: 1000 }));
    assert.equal(n.written[CHAT + 'voice_end_1000'].text, 'Voice chat ended \u00b7 42 min');
    Date.now = () => 1000 + 5000;
    await n.voice(voiceEvent({ isChannelStarted: true, sessionRequestedAt: 1000 }, { isChannelStarted: false, sessionRequestedAt: 2000 }));
    assert.equal(n.written[CHAT + 'voice_end_1000'].text, 'Voice chat ended \u00b7 42 min');
    const other = notifications();
    await other.voice(voiceEvent({ isChannelStarted: true, sessionRequestedAt: 1000 }, { isChannelStarted: false }));
    assert.equal(other.written[CHAT + 'voice_end_1000'].text, 'Voice chat ended \u00b7 1 min');
  } finally { Date.now = realNow; }
});

test('other voice channel updates write no chat line', async () => {
  const n = notifications();
  await n.voice(voiceEvent({ isChannelStarted: true, isAllMuted: false }, { isChannelStarted: true, isAllMuted: true }));
  await n.voice(voiceEvent({ isChannelStarted: false }, { isChannelStarted: false, endReason: 'x' }));
  assert.equal(Object.keys(n.written).length, 0);
  assert.deepEqual(n.signals, [['voice', 'ev1'], ['voice', 'ev1']]);
  await n.voice(voiceEvent({ isChannelStarted: false }, null));
  assert.equal(n.signals.length, 2);
});
