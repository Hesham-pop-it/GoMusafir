// Only demo emulators: real RTDB rules, real Auth emulator and the real invitation callables with the middleware stubbed.
// No network: SendGrid is replaced by a recorder that must stay untouched; mail lands in dev_outbox.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const project = process.env.GCLOUD_PROJECT;
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!project?.startsWith('demo-') || !databaseHost || !authHost) throw new Error('Demo emulators required');
process.env.FUNCTIONS_EMULATOR = 'true';
delete process.env.SENDGRID_API_KEY;
const sendgridCalls = [];
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === '@sendgrid/mail') return { setApiKey: () => sendgridCalls.push('key'), send: async () => { sendgridCalls.push('send'); } };
  return originalLoad.call(this, request, ...rest);
};
const admin = require('firebase-admin');
admin.initializeApp({ projectId: project, databaseURL: `http://${databaseHost}?ns=${project}-default-rtdb` });
const db = admin.database();
const { invitationSeed, invitationId } = require('./fixtures/invitationSeed');
const base = `http://${databaseHost}`, ns = `${project}-default-rtdb`;
const DAY = 86400000, MIN = 60000;
const plain = value => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

function load(file) {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const full = path.join(__dirname, '..', file);
  const localRequire = Module.createRequire(full);
  const overrides = { '../middleware/participantAccessMiddleware': { onCall: (_, handler) => handler } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), { module, exports: module.exports, require: id => overrides[id] || localRequire(id),
    process, console, Date, Buffer, setTimeout, clearTimeout, URL, Number, Object, Promise, Math }, { filename: full });
  return module.exports;
}

async function main() {
  const stamp = Date.now(), org = `invorg${stamp}`, other = `invother${stamp}`;
  const trip = `trip${stamp}`, prev = `prev${stamp}`, otherTrip = `otrip${stamp}`;
  const code = crypto.randomUUID(), now = Date.now();
  const mk = async (name, claims) => {
    const email = `${name}-${stamp}@example.test`;
    const user = await admin.auth().createUser({ email, password: 'test-password', emailVerified: true });
    if (claims) await admin.auth().setCustomUserClaims(user.uid, claims);
    const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-password', returnSecureToken: true }) });
    return { uid: user.uid, email, token: (await r.json()).idToken };
  };
  const admin1 = await mk('admin', { role: 'admin', orgId: org });
  const host = await mk('host', { role: 'co-host', orgId: org });
  const manager = await mk('mgr', { role: 'manager', orgId: org });
  const outsider = await mk('out', { role: 'admin', orgId: other });
  const member = await mk('member'), p1 = await mk('prevone'), p2 = await mk('prevtwo'), pilgrim = await mk('pilgrim');
  const joiner = await mk('joiner'), walkin = await mk('walkin'), oldTimer = await mk('oldtimer');
  const trips = (id, status, extra = {}) => ({ title: id, destination: 'Makkah', status, total_seats: 10, participants: 2,
    start_date: now + 20 * DAY, end_date: now + 30 * DAY, created_at: now - DAY, ...extra });
  await db.ref().update({
    [`orgs/${org}/metadata/name`]: 'Noor Travel',
    [`orgs/${org}/staff/${admin1.uid}`]: 'admin', [`orgs/${org}/staff/${host.uid}`]: 'co-host', [`orgs/${org}/staff/${manager.uid}`]: 'manager',
    [`orgs/${other}/staff/${outsider.uid}`]: 'admin',
    [`orgs/${org}/trips/${trip}`]: trips(trip, 'active', { invitation_code: code, participants: 2 }),
    [`orgs/${org}/trips/${prev}`]: trips(prev, 'closed', { start_date: now - 90 * DAY, end_date: now - 80 * DAY }),
    [`orgs/${other}/trips/${otherTrip}`]: trips(otherTrip, 'active'),
    [`trips_orgs/${trip}`]: org, [`trips_orgs/${prev}`]: org, [`trips_orgs/${otherTrip}`]: other,
    [`invites/${code}`]: { org_id: org, trip_id: trip, role: 'participant', expires_at: now + 30 * DAY },
    [`trips_participants/${trip}/${member.uid}`]: true,
    [`trips_participants/${prev}/${p1.uid}`]: true, [`trips_participants/${prev}/${p2.uid}`]: true, [`trips_participants/${prev}/${member.uid}`]: true,
    [`trips_participants/${prev}/${admin1.uid}`]: true,
  });
  const fns = load('groups/invitationFunctions.js');
  const invite = load('groups/inviteFunctions.js');
  const as = (person, role, data, orgId = org) => ({ app: {}, auth: { uid: person.uid, token: { role, orgId, auth_time: 1 } }, data });
  const A = data => as(admin1, 'admin', data), H = data => as(host, 'co-host', data);
  const base1 = { orgId: org, tripId: trip };
  let checks = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
  const eq = (a, b, msg) => { assert.deepEqual(plain(a), plain(b), msg); checks++; };
  const outbox = async () => Object.values((await db.ref('dev_outbox').get()).val() || {});
  const records = async () => (await db.ref(`trip_invitations/${trip}`).get()).val() || {};

  // Rights: managers and other organisations are refused on every callable, as is a missing login or a foreign org id.
  for (const name of ['previewInvitations', 'sendInvitations', 'resendInvitation', 'backfillOrgParticipants']) {
    const data = { ...base1, emails: ['x@example.test'], lang: 'en', id: 'abc' };
    await assert.rejects(fns[name](as(manager, 'manager', data)), { code: 'permission-denied' }, name);
    await assert.rejects(fns[name](as(outsider, 'admin', data, other)), { code: 'permission-denied' }, name + ' foreign org');
    await assert.rejects(fns[name](as(outsider, 'admin', data, org)), { code: 'permission-denied' }, name + ' forged claim');
    await assert.rejects(fns[name]({ app: {}, data }), { code: 'unauthenticated' }, name + ' anonymous');
    checks += 4;
  }
  await assert.rejects(fns.backfillOrgParticipants(H({ orgId: org })), { code: 'permission-denied' });
  await assert.rejects(fns.previewInvitations(A({ orgId: org, tripId: otherTrip, emails: [] })), { code: 'not-found' });
  await assert.rejects(fns.previewInvitations(A({ ...base1, emails: [], fromTripId: otherTrip })), { code: 'not-found' });
  await assert.rejects(fns.sendInvitations(A({ ...base1, emails: Array.from({ length: 501 }, (_, i) => `u${i}@example.test`), lang: 'en' })), { code: 'invalid-argument' });
  await assert.rejects(fns.sendInvitations(A({ ...base1, emails: [], lang: 'en' })), { code: 'invalid-argument' });
  await assert.rejects(fns.sendInvitations(A({ ...base1, emails: ['a@example.test'], lang: 'xx' })), { code: 'invalid-argument' });
  checks += 5;

  // Preview: normalised, deduplicated, validated, members found by account address; seats after = free seats - ready.
  let preview = plain(await fns.previewInvitations(A({ ...base1, emails: [` Ahmed@Example.test `, 'ahmed@example.test', 'ahmed@gmial', member.email.toUpperCase(), 'fatima@example.test'] })));
  eq(preview.ready, ['ahmed@example.test', 'fatima@example.test']);
  eq([preview.invalid, preview.members, preview.already], [['ahmed@gmial'], [member.email], []]);
  eq(preview.seats_after, 10 - 2 - 2);
  ok(preview.emails.length === 4, 'emails lists every unique address checked');

  // Copy hand-off: the previous trip's participants, checked like typed input (member of this trip is a member, staff included as any account).
  const hand = plain(await fns.previewInvitations(H({ ...base1, emails: [], fromTripId: prev })));
  eq(hand.members, [member.email]);
  eq([...hand.ready].sort(), [p1.email, p2.email, admin1.email].sort());
  eq([...hand.emails].sort(), [p1.email, p2.email, member.email, admin1.email].sort());

  // Send: records, mail in the outbox in the requested language with the trip link, SendGrid untouched.
  const sent = plain(await fns.sendInvitations(A({ ...base1, emails: ['Ahmed@example.test', 'fatima@example.test', 'bad', member.email], lang: 'nl' })));
  eq(sent, { sent: 2, skipped: 2, failed: 0, lang_fallback: false });
  let recs = await records();
  eq(Object.keys(recs).sort(), [invitationId('ahmed@example.test'), invitationId('fatima@example.test')].sort());
  const rec = recs[invitationId('ahmed@example.test')];
  eq([rec.email, rec.status, rec.lang, rec.by], ['ahmed@example.test', 'sent', 'nl', admin1.uid]);
  ok(Number.isFinite(rec.sent_at) && rec.joined_at === undefined, 'sent_at set');
  let mail = (await outbox()).filter(m => m.to === 'ahmed@example.test');
  eq(mail.length, 1);
  ok(mail[0].subject.includes('nodigt je uit') && mail[0].subject.includes('Noor Travel'), 'dutch subject');
  ok(mail[0].html.includes(`https://app.gomusafir.app/link/${code}`), 'trip link');
  eq(mail[0].template, 'd-eff261607ce94c2ab816abce9c740ef2');
  ok(Number.isFinite(mail[0].created_at), 'created_at');
  eq(mail[0].custom_args, { org_id: org, trip_id: trip, invitation_id: invitationId('ahmed@example.test') });
  eq(sendgridCalls, []);
  const tr = plain(await fns.sendInvitations(H({ ...base1, emails: ['mehmet@example.test'], lang: 'tr' })));
  eq(tr, { sent: 1, skipped: 0, failed: 0, lang_fallback: true });
  ok((await outbox()).find(m => m.to === 'mehmet@example.test').subject.includes('invites you'), 'English fallback');
  const ar = await fns.sendInvitations(A({ ...base1, emails: ['amal@example.test'], lang: 'ar' }));
  ok((await outbox()).find(m => m.to === 'amal@example.test').html.startsWith('<div dir="rtl"'), 'arabic is right to left');
  eq(plain(ar).lang_fallback, false);

  // Already invited: skipped, no second mail; seats after count the pending invitations.
  const again = plain(await fns.sendInvitations(A({ ...base1, emails: ['AHMED@example.test', 'fatima@example.test'], lang: 'en' })));
  eq(again, { sent: 0, skipped: 2, failed: 0, lang_fallback: false });
  eq((await outbox()).filter(m => m.to === 'ahmed@example.test').length, 1);
  preview = plain(await fns.previewInvitations(A({ ...base1, emails: ['ahmed@example.test', 'new@example.test'] })));
  eq([preview.already, preview.ready, preview.seats_after], [['ahmed@example.test'], ['new@example.test'], 10 - 2 - 4 - 1]);
  // Two sends of the same address at once make one record and one mail.
  await Promise.allSettled([fns.sendInvitations(A({ ...base1, emails: ['race@example.test'], lang: 'en' })), fns.sendInvitations(H({ ...base1, emails: ['race@example.test'], lang: 'en' }))]);
  eq((await outbox()).filter(m => m.to === 'race@example.test').length, 1);

  // Resend: not within 10 minutes, then once the gap has passed; a bounce goes back to sent; joined cannot be resent.
  const ahmedId = invitationId('ahmed@example.test');
  await assert.rejects(fns.resendInvitation(A({ ...base1, id: ahmedId })), { code: 'resource-exhausted' });
  await assert.rejects(fns.resendInvitation(A({ ...base1, id: 'doesnotexist' })), { code: 'not-found' });
  await db.ref(`trip_invitations/${trip}/${ahmedId}/sent_at`).set(Date.now() - 11 * MIN);
  await db.ref(`trip_invitations/${trip}/${ahmedId}`).update({ status: 'bounced', bounced_at: Date.now(), bounce_reason: 'mailbox full' });
  const results = await Promise.allSettled([fns.resendInvitation(A({ ...base1, id: ahmedId })), fns.resendInvitation(H({ ...base1, id: ahmedId }))]);
  eq(results.filter(r => r.status === 'fulfilled').length, 1);
  const resent = (await records())[ahmedId];
  eq([resent.status, resent.bounced_at, resent.bounce_reason], ['sent', undefined, undefined]);
  ok(Math.abs(resent.resent_at - Date.now()) < 10000, 'resent_at');
  eq((await outbox()).filter(m => m.to === 'ahmed@example.test').length, 2);
  await db.ref(`trip_invitations/${trip}/${ahmedId}`).update({ status: 'joined', joined_at: Date.now() });
  await db.ref(`trip_invitations/${trip}/${ahmedId}/resent_at`).set(Date.now() - 20 * MIN);
  await assert.rejects(fns.resendInvitation(A({ ...base1, id: ahmedId })), { code: 'failed-precondition' });
  await db.ref(`trip_invitations/${trip}/${ahmedId}`).update({ status: 'sent', joined_at: null });

  // Closed trips send nothing.
  await assert.rejects(fns.sendInvitations(A({ orgId: org, tripId: prev, emails: ['late@example.test'], lang: 'en' })), { code: 'failed-precondition' });
  // An organisation cannot mail more than the hourly budget.
  await db.ref(`invitation_limits/${org}`).set({ window_start: Date.now(), count: 999 });
  await assert.rejects(fns.sendInvitations(A({ ...base1, emails: ['b1@example.test', 'b2@example.test'], lang: 'en' })), { code: 'resource-exhausted' });
  await db.ref(`invitation_limits/${org}`).remove();
  eq(sendgridCalls, []);

  // Webhook: a bounce marks the record, other mails and joined people are left alone.
  const { createWebhookHandler } = require('../services/invitations/sendgridWebhook');
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const key = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const hook = createWebhookHandler({ getPublicKey: () => key });
  const post = async events => {
    const body = JSON.stringify(events), ts = String(Date.now()), signer = crypto.createSign('sha256'); signer.update(ts + body);
    const res = { status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = b; return this; } };
    const headers = { 'x-twilio-email-event-webhook-signature': signer.sign(pair.privateKey).toString('base64'), 'x-twilio-email-event-webhook-timestamp': ts };
    await hook({ method: 'POST', rawBody: Buffer.from(body), get: n => headers[n.toLowerCase()] }, res);
    return res;
  };
  const fatimaId = invitationId('fatima@example.test'), mehmetId = invitationId('mehmet@example.test');
  const args = (id, email) => ({ email, org_id: org, trip_id: trip, invitation_id: id });
  await db.ref(`trip_invitations/${trip}/${mehmetId}`).update({ status: 'joined', joined_at: Date.now() });
  const res = await post([
    { ...args(fatimaId, 'fatima@example.test'), event: 'bounce', reason: '550 no such user' },
    { ...args(ahmedId, 'someone@else.test'), event: 'bounce' },
    { ...args(mehmetId, 'mehmet@example.test'), event: 'dropped' },
    { ...args(invitationId('amal@example.test'), 'amal@example.test'), event: 'delivered' },
    { ...args(invitationId('race@example.test'), 'race@example.test'), event: 'blocked', type: 'blocked' },
    { event: 'bounce', email: 'x@example.test' }, { ...args('../etc', 'x@example.test'), event: 'bounce' },
  ]);
  eq([res.code, res.body], [200, { marked: 2 }]);
  recs = await records();
  eq([recs[fatimaId].status, recs[fatimaId].bounce_reason], ['bounced', '550 no such user']);
  ok(Number.isFinite(recs[fatimaId].bounced_at), 'bounced_at');
  eq([recs[ahmedId].status, recs[mehmetId].status, recs[invitationId('amal@example.test')].status, recs[invitationId('race@example.test')].status],
    ['sent', 'joined', 'sent', 'bounced']);

  // Joining: redeemInvitation marks the invitation of the joiner's verified address and the index; others still reach the index.
  await fns.sendInvitations(A({ ...base1, emails: [joiner.email], lang: 'en' }));
  const redeem = (person, data) => invite.redeemInvitation({ app: {}, auth: { uid: person.uid, token: {} }, data: { inviteCode: code, ...data } });
  const joinedResult = await redeem(joiner, {});
  eq(joinedResult.success, true);
  const joinRec = (await records())[invitationId(joiner.email)];
  eq(joinRec.status, 'joined');
  ok(Math.abs(joinRec.joined_at - Date.now()) < 15000, 'joined_at');
  let index = (await db.ref(`orgs/${org}/participants/${joiner.uid}`).get()).val();
  eq(Object.keys(index.trips), [trip]);
  eq(index.last_joined_at, index.trips[trip]);
  eq(index.trips[trip], joinRec.joined_at);
  await redeem(walkin, {});
  index = (await db.ref(`orgs/${org}/participants/${walkin.uid}`).get()).val();
  eq(Object.keys(index.trips), [trip]);
  eq((await records())[invitationId(walkin.email)], null);
  // Repeating the join changes nothing.
  const joinedAt = joinRec.joined_at;
  eq((await redeem(joiner, {})).message, 'Already joined.');
  eq((await records())[invitationId(joiner.email)].joined_at, joinedAt);
  eq((await db.ref(`orgs/${org}/participants/${joiner.uid}/trips/${trip}`).get()).val(), joinedAt);
  // A joined person does not count as pending any more and cannot be invited again.
  preview = plain(await fns.previewInvitations(A({ ...base1, emails: [joiner.email] })));
  eq([preview.already, preview.ready], [[joiner.email], []]);

  // Backfill: joins from before the index existed, staff left out, existing entries kept, idempotent.
  await db.ref().update({
    [`trips_participants/${prev}/${oldTimer.uid}`]: true, [`trips_participants/${trip}/${oldTimer.uid}`]: true,
    [`users/${oldTimer.uid}/joined_trips/${prev}`]: { org_id: org, status: 'joined', joined_at: now - 85 * DAY },
    [`users/${oldTimer.uid}/joined_trips/${trip}`]: { org_id: org, status: 'joined', joined_at: now - 2 * DAY },
    [`users/${admin1.uid}/joined_trips/${prev}`]: { org_id: org, status: 'organizer', joined_at: now - 95 * DAY },
    [`trips_participants/${trip}/${pilgrim.uid}`]: true,
  });
  const fill = plain(await fns.backfillOrgParticipants(A({ orgId: org })));
  const oldIndex = (await db.ref(`orgs/${org}/participants/${oldTimer.uid}`).get()).val();
  eq(oldIndex, { trips: { [prev]: now - 85 * DAY, [trip]: now - 2 * DAY }, last_joined_at: now - 2 * DAY });
  eq((await db.ref(`orgs/${org}/participants/${admin1.uid}`).get()).exists(), false);
  eq((await db.ref(`orgs/${org}/participants/${joiner.uid}/trips/${trip}`).get()).val(), joinedAt);
  const pilgrimIndex = (await db.ref(`orgs/${org}/participants/${pilgrim.uid}`).get()).val();
  eq(Object.keys(pilgrimIndex.trips), [trip]);
  ok(fill.participants >= 5 && fill.links_added >= 3, JSON.stringify(fill));
  const second = plain(await fns.backfillOrgParticipants(A({ orgId: org })));
  eq(second.links_added, 0);
  eq((await db.ref(`orgs/${org}/participants/${oldTimer.uid}`).get()).val(), oldIndex);
  ok((await db.ref(`orgs/${org}/logs`).get()).val() !== null, 'audit log written');

  // Rules: staff of the trip's organisation read the records and the index, nobody writes, the outbox is server only.
  const rest = async (person, path, method = 'GET', value) => {
    const r = await fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(person.token)}`, { method, headers: { 'Content-Type': 'application/json' },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    return r.status;
  };
  for (const person of [admin1, host, manager]) {
    eq(await rest(person, `trip_invitations/${trip}`), 200, 'staff read invitations');
    eq(await rest(person, `orgs/${org}/participants`), 200, 'staff read index');
    eq(await rest(person, `trip_invitations/${trip}/${ahmedId}/status`, 'PUT', 'joined'), 401, 'staff cannot write');
    eq(await rest(person, `trip_invitations/${trip}/forged`, 'PUT', { email: 'x@y.test', status: 'sent' }), 401);
    eq(await rest(person, `orgs/${org}/participants/${person.uid}`, 'PUT', { trips: {} }), 401);
    eq(await rest(person, 'dev_outbox', 'GET'), 401, 'outbox read');
    eq(await rest(person, 'dev_outbox/x', 'PUT', { to: 'x' }), 401, 'outbox write');
    eq(await rest(person, `invitation_limits/${org}`, 'GET'), 401);
  }
  for (const person of [outsider, pilgrim, member]) {
    eq(await rest(person, `trip_invitations/${trip}`), 401, 'others cannot read invitations');
    eq(await rest(person, `orgs/${org}/participants`), 401, 'others cannot read the index');
    eq(await rest(person, `orgs/${org}/participants/${person.uid}`, 'PUT', { trips: {} }), 401);
    eq(await rest(person, 'dev_outbox', 'GET'), 401);
  }
  eq(await rest(outsider, `trip_invitations/${trip}/${ahmedId}`), 401, 'another organisation cannot read');
  eq(sendgridCalls, [], 'SendGrid was never called');

  console.log(`PASS: invitations backend (${checks} checks): rights, preview, copy hand-off, send, languages, outbox, resend, webhook, join marking, index, backfill, rules, SendGrid untouched.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => admin.app().delete());
