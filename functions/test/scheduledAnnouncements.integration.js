// Only demo emulators: real RTDB rules and the real send path, never production.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT;
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!project?.startsWith('demo-') || !databaseHost || !authHost) throw new Error('Demo emulators required');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: project, databaseURL: `http://${databaseHost}?ns=${project}-default-rtdb` });
const db = admin.database();
const { sendDue, sendScheduled, recordFailure, queueKey } = require('../services/scheduledAnnouncementService');
const base = `http://${databaseHost}`, ns = `${project}-default-rtdb`;
const DAY = 86400000;

async function main() {
  const users = {};
  for (const role of ['admin', 'manager', 'co-host', 'participant']) {
    const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${role}-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }),
    });
    const { localId: uid, idToken: token } = await r.json();
    assert.ok(uid && token); users[role] = { uid, token };
  }
  const now = Date.now(), end = now + 14 * DAY;
  const staff = {}, participants = {}, appAccess = {};
  for (const [role, { uid }] of Object.entries(users)) {
    if (role !== 'participant') staff[uid] = role;
    participants[uid] = true;
    appAccess[uid] = { expires_at: end, revoked_before: 0 };
  }
  await db.ref().set({
    orgs: { o: { staff, trips: { t: { status: 'active', start_date: now + DAY, end_date: end }, done: { status: 'closed', start_date: now - DAY, end_date: end } } } },
    trips_orgs: { t: 'o' }, trips_participants: { t: participants }, app_access: appAccess,
    users: { [users.admin.uid]: { full_name: 'Saif' } },
  });

  let checks = 0;
  const call = async (role, path, method, value) => {
    const response = await fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(users[role].token)}`, {
      method, headers: { 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
    return response.status;
  };
  const check = async (role, path, method, value, allowed) => {
    assert.equal(await call(role, path, method, value), allowed ? 200 : 401, `${role} ${method} ${path}`); checks++;
  };
  const mk = (uid, over = {}) => ({ text: 'Fajr in 30 minutes', send_at: now + 60000, created_by: uid, created_at: now,
    mode: 'prayer', prayer: 'fajr', offset_min: -30, status: 'pending', ...over });
  const P = id => `trips_active/o/t/scheduled/${id}`;

  for (const role of ['admin', 'manager', 'co-host']) {
    const uid = users[role].uid;
    await check(role, P(`c-${role}`), 'PUT', mk(uid), true);
    await check(role, P(`c-${role}`), 'GET', undefined, true);
    await check(role, `${P(`c-${role}`)}/status`, 'PUT', 'cancelled', true);
    await check(role, `${P(`c-${role}`)}/status`, 'PUT', 'sent', false);
    await check(role, P(`x-${role}`), 'PUT', mk('someone-else'), false);   // created_by must be the caller
    await check(role, P(`s-${role}`), 'PUT', mk(uid, { status: 'sent' }), false);
    await check(role, P(`bad-${role}`), 'PUT', { ...mk(uid), extra: 1 }, false);
    await check(role, P(`bad-${role}`), 'PUT', mk(uid, { prayer: 'duha' }), false);
    await check(role, P(`bad-${role}`), 'PUT', mk(uid, { send_at: 'soon' }), false);
  }
  const uid = users.admin.uid;
  await check('admin', P('edit'), 'PUT', mk(uid), true);
  await check('admin', `${P('edit')}/text`, 'PUT', 'changed after scheduling', false);
  await check('admin', `${P('edit')}/send_at`, 'PUT', now + 1, false);
  await check('admin', P('forged1'), 'PUT', mk(uid, { chat_key: 'preset' }), false);        // chat_key is server-only
  await check('admin', P('forged2'), 'PUT', mk(uid, { sent_at: now }), false);              // so is sent_at
  await check('admin', P('forged3'), 'PUT', mk(uid, { status: 'failed' }), false);          // and failed
  await db.ref(P('keyed')).set(mk(uid, { chat_key: 'serverkey' }));
  await check('admin', `${P('keyed')}/status`, 'PUT', 'failed', false);
  await check('admin', P('keyed'), 'PUT', { ...mk(uid, { chat_key: 'other' }), status: 'cancelled' }, false); // cancel keeps chat_key
  await check('admin', P('keyed'), 'PUT', { ...mk(uid, { chat_key: 'serverkey' }), status: 'cancelled' }, true);
  await check('admin', P('edit'), 'DELETE', undefined, true);               // pending items may be removed
  await db.ref(P('sentone')).set(mk(uid, { status: 'sent', sent_at: now }));
  await check('admin', P('sentone'), 'DELETE', undefined, false);           // sent history stays
  await check('admin', `${P('sentone')}/status`, 'PUT', 'cancelled', false);
  // Participants and strangers cannot read or write at all.
  await check('participant', 'trips_active/o/t/scheduled', 'GET', undefined, false);
  await check('participant', P('sentone'), 'GET', undefined, false);
  await check('participant', P('p1'), 'PUT', mk(users.participant.uid), false);
  await check('participant', `${P('sentone')}/status`, 'PUT', 'cancelled', false);
  // The due-queue is server-only.
  for (const role of Object.keys(users)) {
    await check(role, 'scheduled_queue', 'GET', undefined, false);
    await check(role, 'scheduled_queue/forged', 'PUT', { org_id: 'o', trip_id: 't', send_at: 1 }, false);
  }

  // Sending: due items post once, future/cancelled/sent ones never, closed trips cancel.
  await db.ref('trips_active/o/t').set(null);
  const item = (over = {}) => mk(uid, { mode: 'time', prayer: null, offset_min: null, ...over });
  const clean = o => JSON.parse(JSON.stringify(o));
  const items = {
    due: item({ text: 'Due now', send_at: now - 5000 }),
    older: item({ text: 'Older', send_at: now - 9000 }),
    future: item({ text: 'Future', send_at: now + DAY }),
    cancelled: item({ text: 'Cancelled', send_at: now - 5000, status: 'cancelled' }),
    sent: item({ text: 'Already sent', send_at: now - 5000, status: 'sent', sent_at: now - 1 }),
  };
  for (const [id, it] of Object.entries(items)) {
    await db.ref(P(id)).set(clean(it));
    if (it.status === 'pending') await db.ref(`scheduled_queue/${queueKey('o', 't', id)}`).set({ org_id: 'o', trip_id: 't', item_id: id, send_at: it.send_at });
  }
  await db.ref('trips_active/o/done/scheduled/dead').set(clean(item({ text: 'Closed trip', send_at: now - 1000 })));
  await db.ref(`scheduled_queue/${queueKey('o', 'done', 'dead')}`).set({ org_id: 'o', trip_id: 'done', item_id: 'dead', send_at: now - 1000 });

  const ts = admin.database.ServerValue.TIMESTAMP;
  const results = await Promise.all([sendDue({ db, now, timestamp: ts }), sendDue({ db, now, timestamp: ts })]);
  assert.ok(results.flat().every(r => r !== 'error'), JSON.stringify(results));
  await sendDue({ db, now, timestamp: ts });
  const chat = Object.values((await db.ref('trips_active/o/t/chat').get()).val() || {});
  assert.deepEqual(chat.map(m => m.text).sort(), ['Due now', 'Older'], 'each due item posts exactly once');
  const message = chat.find(m => m.text === 'Due now');
  assert.deepEqual(Object.keys(message).sort(), ['sender_id', 'sender_name', 'text', 'timestamp', 'type']);
  assert.equal(message.type, 'text'); assert.equal(message.sender_id, uid); assert.equal(message.sender_name, 'Saif');
  assert.equal(typeof message.timestamp, 'number');
  const after = (await db.ref('trips_active/o/t/scheduled').get()).val();
  assert.equal(after.due.status, 'sent'); assert.equal(typeof after.due.sent_at, 'number');
  assert.equal(after.older.status, 'sent');
  assert.equal(after.future.status, 'pending'); assert.equal(after.cancelled.status, 'cancelled');
  assert.equal(after.sent.status, 'sent');
  assert.equal((await db.ref('trips_active/o/done/scheduled/dead/status').get()).val(), 'cancelled');
  assert.equal((await db.ref('trips_active/o/done/chat').get()).exists(), false);
  assert.deepEqual(Object.keys((await db.ref('scheduled_queue').get()).val() || {}), [queueKey('o', 't', 'future')]);
  // Re-running a crashed attempt (chat written, item still pending) must not duplicate.
  await db.ref(P('retry')).set(clean(item({ text: 'Retry', send_at: now - 100, chat_key: 'fixedkey' })));
  await db.ref('trips_active/o/t/chat/fixedkey').set({ type: 'text', text: 'Retry', sender_id: uid, sender_name: 'Saif', timestamp: now });
  assert.equal(await sendScheduled({ db, orgId: 'o', tripId: 't', id: 'retry', now, timestamp: ts }), 'sent');
  // A crashed attempt that already notified must not notify again on retry (create-only, keyed by item id).
  await db.ref(P('renotify')).set(clean(item({ text: 'Renotify', send_at: now - 100 })));
  await sendScheduled({ db, orgId: 'o', tripId: 't', id: 'renotify', now, timestamp: ts });
  await db.ref(P('renotify/status')).set('pending');
  await sendScheduled({ db, orgId: 'o', tripId: 't', id: 'renotify', now: now + 1, timestamp: ts });
  const notifs = (await db.ref('trips_active/o/t/notifications').get()).val();
  assert.equal(notifs[uid], undefined, 'the sender gets no notification');
  for (const role of ['manager', 'co-host', 'participant']) {
    const mine = Object.entries(notifs[users[role].uid]);
    assert.equal(mine.filter(([, n]) => n.message === 'Due now').length, 1);
    assert.deepEqual(notifs[users[role].uid].sched_due, { name: 'Saif', message: 'Due now', timestamp: now, type: 'alert', senderUid: uid });
    assert.equal(mine.filter(([, n]) => n.message === 'Renotify').length, 1, 'retry does not duplicate');
    assert.equal(mine.filter(([, n]) => n.message === 'Future' || n.message === 'Cancelled').length, 0);
  }
  assert.equal((await db.ref('trips_active/o/done/notifications').get()).exists(), false);
  // A failing notification write never fails the item.
  const realRef = db.ref.bind(db);
  db.ref = p => { if (String(p).startsWith('trips_participants/')) throw new Error('boom'); return realRef(p); };
  await realRef(P('nofail')).set(clean(item({ text: 'No fail', send_at: now - 100 })));
  assert.equal(await sendScheduled({ db, orgId: 'o', tripId: 't', id: 'nofail', now, timestamp: ts }), 'sent');
  db.ref = realRef;
  assert.equal((await db.ref(P('nofail/status')).get()).val(), 'sent');
  const retried = Object.values((await db.ref('trips_active/o/t/chat').get()).val()).filter(m => m.text === 'Retry');
  assert.equal(retried.length, 1);
  // Malformed chat keys are replaced, ended trips cancel, repeated failures give up.
  await db.ref('orgs/o/trips/over').set({ status: 'active', start_date: now - 3 * DAY, end_date: now - 1000 });
  await db.ref(P('badkey')).set(clean(item({ text: 'Bad key', send_at: now - 100, chat_key: '../escape' })));
  await db.ref(`scheduled_queue/${queueKey('o', 't', 'badkey')}`).set({ org_id: 'o', trip_id: 't', item_id: 'badkey', send_at: now - 100 });
  assert.equal(await sendScheduled({ db, orgId: 'o', tripId: 't', id: 'badkey', now, timestamp: ts }), 'sent');
  const badKeyItem = (await db.ref(P('badkey')).get()).val();
  assert.match(badKeyItem.chat_key, /^[-\w]{1,64}$/); assert.notEqual(badKeyItem.chat_key, '../escape');
  await db.ref('trips_active/o/over/scheduled/late').set(clean(item({ text: 'Too late', send_at: now - 100 })));
  await db.ref(`scheduled_queue/${queueKey('o', 'over', 'late')}`).set({ org_id: 'o', trip_id: 'over', item_id: 'late', send_at: now - 100 });
  assert.equal(await sendScheduled({ db, orgId: 'o', tripId: 'over', id: 'late', now, timestamp: ts }), 'cancelled');
  assert.equal((await db.ref('trips_active/o/over/scheduled/late/status').get()).val(), 'cancelled');
  assert.equal((await db.ref('trips_active/o/over/chat').get()).exists(), false);
  await db.ref(P('doomed')).set(clean(item({ text: 'Doomed', send_at: now - 100 })));
  const dKey = queueKey('o', 't', 'doomed');
  await db.ref(`scheduled_queue/${dKey}`).set({ org_id: 'o', trip_id: 't', item_id: 'doomed', send_at: now - 100 });
  for (let i = 0; i < 2; i++) await recordFailure({ db, orgId: 'o', tripId: 't', id: 'doomed' });
  assert.equal((await db.ref(P('doomed/status')).get()).val(), 'pending'); assert.equal((await db.ref(`scheduled_queue/${dKey}/attempts`).get()).val(), 2);
  await recordFailure({ db, orgId: 'o', tripId: 't', id: 'doomed' });
  assert.equal((await db.ref(P('doomed/status')).get()).val(), 'failed'); assert.equal((await db.ref(`scheduled_queue/${dKey}`).get()).exists(), false);
  console.log(`PASS: scheduled announcements rules (${checks} checks) and send path (once-only, cancelled, future, closed and ended trips, bad chat key, retry, give up after 3 failures).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => admin.app().delete());
