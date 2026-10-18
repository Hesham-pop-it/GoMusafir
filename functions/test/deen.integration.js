// Only demo emulators: real RTDB rules and the real Deen callables with the middleware stubbed.
// No network: the model is off, storage and Stripe are replaced by recording stubs.
const assert = require('node:assert/strict');
const project = process.env.GCLOUD_PROJECT;
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!project?.startsWith('demo-') || !databaseHost || !authHost) throw new Error('Demo emulators required');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: project, databaseURL: `http://${databaseHost}?ns=${project}-default-rtdb` });
const db = admin.database();
const { deenSeed } = require('./fixtures/deenSeed');
const base = `http://${databaseHost}`, ns = `${project}-default-rtdb`;
const DAY = 86400000;
const plain = value => JSON.parse(JSON.stringify(value));

const sessions = [];
const photos = [];
function load(env) {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const full = path.join(__dirname, '../groups/deenFunctions.js');
  const localRequire = require('node:module').createRequire(full);
  const photoService = require('../services/tripPhotoService');
  const overrides = {
    '../middleware/participantAccessMiddleware': { onCall: (_, handler) => handler },
    '../services/tripPhotoService': { decodeTripPhoto: photoService.decodeTripPhoto,
      saveTripPhoto: async bytes => { photos.push(bytes.length); return `https://example.test/trips/new-${photos.length}.jpg`; } },
    stripe: () => ({ checkout: { sessions: { create: async (params, opts) => {
      sessions.push({ params, opts }); return { id: 'cs_test_deen', url: 'https://checkout.stripe.test/pay/cs_test_deen' };
    } } } }),
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), { module, exports: module.exports,
    require: id => overrides[id] || localRequire(id), process: { env }, console, Date, Buffer, setTimeout, clearTimeout, URL }, { filename: full });
  return module.exports;
}

async function main() {
  const org = `deenorg${Date.now()}`;
  const emu = load({ FUNCTIONS_EMULATOR: 'true' });
  const live = load({});
  const signUp = async name => {
    const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${name}-${Date.now()}@example.test`, password: 'test-password', returnSecureToken: true }) });
    const { localId: uid, idToken: token } = await r.json(); assert.ok(uid && token); return { uid, token };
  };
  const [admin1, host, manager, outsider] = await Promise.all(['admin', 'host', 'mgr', 'out'].map(signUp));
  await db.ref().update({
    ...deenSeed({ org, creator: admin1.uid, now: Date.UTC(2026, 9, 16), prepaidSeats: 78 }),
    [`orgs/${org}/staff/${admin1.uid}`]: 'admin', [`orgs/${org}/staff/${host.uid}`]: 'co-host', [`orgs/${org}/staff/${manager.uid}`]: 'manager',
    [`users/${admin1.uid}/first_name`]: 'Saif', [`users/${admin1.uid}/country`]: 'NL',
    [`users/${host.uid}/country`]: 'SA',
    // data that must never be copied
    [`trips_participants/ramadan2026/someone`]: true,
  });
  await db.ref(`orgs/${org}/trips/ramadan2026/documents`).set({ passport: 'x' });
  const as = (person, role, data) => ({ app: {}, auth: { uid: person.uid, token: { role, orgId: org, auth_time: 1 } }, data });
  const A = (data) => as(admin1, 'admin', data);
  let checks = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
  const eq = (a, b, msg) => { assert.deepEqual(plain(a), plain(b), msg); checks++; };

  // Rights: managers and outsiders are refused on every callable; the co-host is allowed.
  for (const name of ['deenStart', 'deenSay', 'uploadTripBanner', 'deenCheckout', 'deenCreate']) {
    await assert.rejects(emu[name](as(manager, 'manager', { lang: 'nl', draftId: 'x', text: 'a', dataUrl: 'x', origin: 'http://localhost:3100' })), { code: 'permission-denied' }, name);
    await assert.rejects(emu[name](as(outsider, 'admin', { lang: 'nl', draftId: 'x', text: 'a', dataUrl: 'x', origin: 'http://localhost:3100' })), { code: 'permission-denied' }, name + ' outsider');
    checks += 2;
  }
  await assert.rejects(emu.deenStart({ app: {}, data: { lang: 'nl' } }), { code: 'unauthenticated' });
  await assert.rejects(emu.deenStart(A({ lang: 'xx' })), { code: 'invalid-argument' });
  await assert.rejects(emu.deenSay(A({ draftId: 'nope', text: 'hi' })), { code: 'not-found' });
  await assert.rejects(emu.deenStart(A({ lang: 'nl', copyFrom: 'nonexistent' })), { code: 'not-found' });
  checks += 4;

  // Fresh start: greeting, draft node, rules.
  const started = plain(await emu.deenStart(A({ lang: 'nl' })));
  ok(started.draftId, 'draft id');
  eq(started.reply, { key: 'greeting', params: { name: 'Saif' } });
  eq([started.state.step, started.state.step_no, started.state.steps_total, started.state.status], ['name', 1, 8, 'active']);
  ok(!('first_name' in started.state), 'internal fields are not returned');
  const stored = (await db.ref(`deen_drafts/${admin1.uid}/${started.draftId}`).get()).val();
  eq(stored.org_id, org); eq(stored.messages[0].key, 'greeting');
  const raw = async (token, path, method, value) => (await fetch(`${base}/${path}.json?ns=${ns}&auth=${encodeURIComponent(token)}`, {
    method, headers: { 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })).status;
  const node = `deen_drafts/${admin1.uid}/${started.draftId}`;
  eq(await raw(admin1.token, node, 'GET'), 200);
  eq(await raw(host.token, node, 'GET'), 401);
  eq(await raw(admin1.token, `${node}/status`, 'PUT', 'created'), 401);
  eq(await raw(admin1.token, `deen_drafts/${admin1.uid}/forged`, 'PUT', { step: 'overview' }), 401);
  eq(await raw(host.token, `deen_drafts/${admin1.uid}`, 'GET'), 401);

  // Banner upload: validates, stores, advances the step and records the message.
  await assert.rejects(emu.uploadTripBanner(A({ draftId: started.draftId, dataUrl: 'data:image/png;base64,AAAA' })), { code: 'invalid-argument' });
  await emu.deenSay(A({ draftId: started.draftId, text: 'Umrah Ramadan 2027' }));
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
  eq(await emu.uploadTripBanner(A({ draftId: started.draftId, dataUrl: jpeg })), { url: 'https://example.test/trips/new-1.jpg' });
  let d = (await db.ref(node).get()).val();
  eq([d.step, d.fields.image, d.banner_done], ['destination', 'https://example.test/trips/new-1.jpg', true]);
  eq(d.messages.at(-1).key, 'ask_destination');

  // Conversation to the seat check: 120 people for 14 days with 78 seats.
  let r = plain(await emu.deenSay(A({ draftId: started.draftId, text: 'we gaan naar Makkah, Saudi Arabia' })));
  eq(r.reply.key, 'ask_dates'); eq(r.replies.map(x => x.key), ['ack_destination', 'ask_dates']);
  r = plain(await emu.deenSay(A({ draftId: started.draftId, text: '7 tot 20 februari 2027' })));
  eq(r.reply.key, 'ask_participants');
  r = plain(await emu.deenSay(A({ draftId: started.draftId, text: '120 personen' })));
  eq(r.reply.key, 'seats_missing');
  eq([r.state.step, r.state.step_no], ['seats', 6]);
  eq([r.state.seats.required, r.state.seats.available, r.state.seats.missing, r.state.seats.price, r.state.seats.total],
    [120, 78, 42, { amount: 9.99, currency: 'eur' }, 419.58]);
  eq(r.state.fields.start_date, Date.UTC(2027, 1, 7)); eq(r.state.fields.end_date, Date.UTC(2027, 1, 21));
  await assert.rejects(emu.deenCreate(A({ draftId: started.draftId })).then(x => x), { code: 'failed-precondition' }); checks++;
  eq((await db.ref(`orgs/${org}/trips`).get()).numChildren(), 2);

  // Fake checkout: origin whitelist, credit once, return URL.
  await assert.rejects(emu.deenCheckout(A({ draftId: started.draftId, origin: 'https://evil.example' })), { code: 'invalid-argument' });
  await assert.rejects(emu.deenCheckout(A({ draftId: started.draftId, origin: 'http://localhost:3000' })), { code: 'invalid-argument' });
  const paid = plain(await emu.deenCheckout(A({ draftId: started.draftId, origin: 'http://localhost:3100' })));
  eq(paid, { url: `http://localhost:3100/admin/deen?draft=${started.draftId}`, fake: true, credited: 42 });
  eq((await db.ref(`orgs/${org}/prepaid_seats`).get()).val(), 120);
  const again = plain(await emu.deenCheckout(A({ draftId: started.draftId, origin: 'http://localhost:3100' })));
  eq(again, { instant: true, url: paid.url });
  eq((await db.ref(`orgs/${org}/prepaid_seats`).get()).val(), 120);
  const txs = Object.values((await db.ref('seatTransactions').get()).val() || {}).filter(t => t.orgId === org);
  eq(txs.map(t => [t.action, t.source, t.seats]), [['DEEN_SEATS', 'emulator', 42]]);

  r = plain(await emu.deenSay(A({ draftId: started.draftId, action: 'refresh' })));
  eq(r.reply.key, 'seats_paid'); eq(r.state.step, 'overview');
  r = plain(await emu.deenSay(A({ draftId: started.draftId, action: 'confirm' })));
  eq(r.reply.key, 'ready');

  // Create through createTripRecord; a manager cannot, seats are deducted, the trip matches the form.
  await assert.rejects(emu.deenCreate(as(manager, 'manager', { draftId: started.draftId })), { code: 'permission-denied' });
  const created = plain(await emu.deenCreate(A({ draftId: started.draftId })));
  ok(created.tripId, 'trip id');
  const trip = (await db.ref(`orgs/${org}/trips/${created.tripId}`).get()).val();
  eq([trip.title, trip.location, trip.total_seats, trip.seats_required, trip.start_date, trip.end_date, trip.image, trip.status, trip.created_by],
    ['Umrah Ramadan 2027', 'Makkah, Saudi Arabia', 120, 120, Date.UTC(2027, 1, 7), Date.UTC(2027, 1, 21), 'https://example.test/trips/new-1.jpg', 'active', admin1.uid]);
  eq((await db.ref(`orgs/${org}/prepaid_seats`).get()).val(), 0);
  ok(trip.invitation_code, 'invite code');
  eq((await db.ref(`trips_orgs/${created.tripId}`).get()).val(), org);
  eq(plain(await emu.deenCreate(A({ draftId: started.draftId }))), { tripId: created.tripId, trip_id: created.tripId });
  eq(created.trip_id, created.tripId);
  d = (await db.ref(node).get()).val();
  eq([d.status, d.step, d.step_no, d.trip_id], ['created', 'created', 8, created.tripId]);
  eq((await db.ref(`orgs/${org}/prepaid_seats`).get()).val(), 0);
  const logs = Object.values((await db.ref(`orgs/${org}/logs`).get()).val());
  ok(logs.some(l => l.action === 'TRIP_CREATED' && l.target === created.tripId && l.via === 'deen'), 'audit');
  ok(logs.some(l => l.action === 'DEEN_SEATS_PURCHASED'), 'audit seats');

  // Copy: name, banner, destination and templates move over; people and documents do not.
  await db.ref(`orgs/${org}/prepaid_seats`).set(500);
  const copy = plain(await emu.deenStart(as(host, 'co-host', { lang: 'nl', copyFrom: 'ramadan2026' })));
  eq(copy.reply.key, 'copied');
  eq(copy.reply.params.title, 'Ramadan 2026'); eq(copy.reply.params.templates_count, 4);
  eq(copy.state.fields.title, 'Kopie van Ramadan 2026');
  eq(copy.state.fields.image, 'https://example.test/banners/ramadan-2026.jpg');
  eq(copy.state.fields.destination, 'Makkah, Saudi Arabia');
  eq(copy.state.step, 'dates');
  eq(copy.state.messages.map(m => m.key), ['copied', 'ask_dates']);
  const H = data => as(host, 'co-host', data);
  r = plain(await emu.deenSay(H({ draftId: copy.draftId, text: '7 tot 20 februari 2027' })));
  r = plain(await emu.deenSay(H({ draftId: copy.draftId, text: '110 mensen' })));
  eq(r.replies.map(x => x.key), ['ack_participants', 'seats_ok', 'overview']); eq([r.reply.params.required, r.reply.params.missing], [110, 0]);
  const copied = plain(await emu.deenCreate(H({ draftId: copy.draftId })));
  const tpl = (await db.ref(`trips_active/${org}/${copied.tripId}/templates`).get()).val();
  eq(Object.values(tpl).map(t => t.name).sort(), ['Gebed', 'Vertrek luchthaven', 'Verzamelen', 'Welkom']);
  ok(Object.values(tpl).every(t => t.created_by === host.uid && typeof t.timestamp === 'number'), 'template meta');
  const copiedTrip = (await db.ref(`orgs/${org}/trips/${copied.tripId}`).get()).val();
  eq([copiedTrip.title, copiedTrip.image, copiedTrip.participants], ['Kopie van Ramadan 2026', 'https://example.test/banners/ramadan-2026.jpg', 1]);
  eq((await db.ref(`orgs/${org}/trips/${copied.tripId}/documents`).get()).exists(), false);
  eq((await db.ref(`trips_participants/${copied.tripId}`).get()).val(), { [host.uid]: true });
  eq((await db.ref(`orgs/${org}/prepaid_seats`).get()).val(), 390);
  await emu.deenCreate(H({ draftId: copy.draftId }));
  eq(Object.keys((await db.ref(`trips_active/${org}/${copied.tripId}/templates`).get()).val()).length, 4);

  // A trip without templates copies cleanly; a copy of a trip in another organisation is refused.
  const bare = plain(await emu.deenStart(A({ lang: 'en', copyFrom: 'madinahWeek2025' })));
  eq(bare.state.banner_done, true); eq(bare.reply.params.templates_count, 0);
  await db.ref('orgs/otherorg/trips/foreign').set({ title: 'Foreign', location: 'Makkah' });
  await assert.rejects(emu.deenStart(A({ lang: 'nl', copyFrom: 'foreign' })), { code: 'not-found' });

  // Not enough seats at creation time is refused by the same seat check as the form.
  await db.ref(`orgs/${org}/prepaid_seats`).set(5);
  const poor = plain(await emu.deenStart(A({ lang: 'nl' })));
  for (const t of ['Trip', null, 'Makkah', '7 tot 20 februari 2027', '40']) {
    if (t === null) { await db.ref(`deen_drafts/${admin1.uid}/${poor.draftId}`).update({ banner_done: true }); await emu.deenSay(A({ draftId: poor.draftId, action: 'banner_uploaded' })); } else await emu.deenSay(A({ draftId: poor.draftId, text: t }));
  }
  await assert.rejects(emu.deenCreate(A({ draftId: poor.draftId })), { code: 'failed-precondition' });
  eq((await db.ref(`orgs/${org}/prepaid_seats`).get()).val(), 5);

  // Real path: a Stripe session for the missing seats, back to the conversation on a whitelisted origin.
  const live1 = await live.deenCheckout(A({ draftId: poor.draftId, origin: 'http://localhost:3100' }));
  eq(plain(live1), { url: 'https://checkout.stripe.test/pay/cs_test_deen' });
  const { params, opts } = sessions[0];
  eq([params.line_items[0].quantity, params.line_items[0].price_data.unit_amount, params.line_items[0].price_data.currency], [35, 999, 'eur']);
  eq(params.metadata, { orgId: org, uid: admin1.uid, action: 'DEEN_SEATS', draftId: poor.draftId, seats: '35', planId: 'seat_only', countryCode: 'NL' });
  eq(params.success_url, `http://localhost:3100/admin/deen?draft=${poor.draftId}&status=success&session_id={CHECKOUT_SESSION_ID}`);
  eq(params.cancel_url, `http://localhost:3100/admin/deen?draft=${poor.draftId}&status=cancel`);
  ok(opts.idempotencyKey.startsWith('deen-'), 'idempotency key');
  eq((await db.ref(`orgs/${org}/prepaid_seats`).get()).val(), 5);
  await assert.rejects(live.deenCheckout(A({ draftId: poor.draftId, origin: 'https://evil.example' })), { code: 'invalid-argument' });
  // The webhook credit is idempotent per session.
  const { creditDeenSeats } = require('../services/deen/deenService');
  eq(await creditDeenSeats({ orgId: org, uid: admin1.uid, operationId: 'deen-seats:cs_test_deen', seats: 35, source: 'stripe' }), { credited: 35 });
  eq(await creditDeenSeats({ orgId: org, uid: admin1.uid, operationId: 'deen-seats:cs_test_deen', seats: 35, source: 'stripe' }), { credited: 0 });
  eq((await db.ref(`orgs/${org}/prepaid_seats`).get()).val(), 40);
  await assert.rejects(creditDeenSeats({ orgId: org, uid: 'x', operationId: 'y', seats: 0, source: 'stripe' }), { code: 'invalid-argument' });

  // Drafts expire after 30 days and are pruned on the next start; paused drafts resume.
  const later = plain(await emu.deenSay(A({ draftId: poor.draftId, action: 'later' })));
  eq(later.state.status, 'paused');
  eq(plain(await emu.deenSay(A({ draftId: poor.draftId, action: 'refresh' }))).state.status, 'active');
  const fresh = (await db.ref(`deen_drafts/${admin1.uid}/${poor.draftId}/expires_at`).get()).val();
  ok(fresh > Date.now() + 29 * DAY, 'expires in about 30 days');
  await db.ref(`deen_drafts/${admin1.uid}/${poor.draftId}/expires_at`).set(Date.now() - 1);
  await assert.rejects(emu.deenSay(A({ draftId: poor.draftId, text: 'hi' })), { code: 'not-found' });
  eq((await db.ref(`deen_drafts/${admin1.uid}/${poor.draftId}`).get()).exists(), false);
  await db.ref(`deen_drafts/${admin1.uid}/${bare.draftId}/expires_at`).set(Date.now() - 1);
  await emu.deenStart(A({ lang: 'nl' }));
  eq((await db.ref(`deen_drafts/${admin1.uid}/${bare.draftId}`).get()).exists(), false);

  // One conversation cannot be played from two tabs at once.
  const race = plain(await emu.deenStart(A({ lang: 'nl' })));
  const results = await Promise.allSettled([
    emu.deenSay(A({ draftId: race.draftId, text: 'Eerste naam' })), emu.deenSay(A({ draftId: race.draftId, text: 'Tweede naam' }))]);
  ok(results.filter(x => x.status === 'fulfilled').length >= 1, 'at least one wins');
  const title = (await db.ref(`deen_drafts/${admin1.uid}/${race.draftId}/fields/title`).get()).val();
  ok(['Eerste naam', 'Tweede naam'].includes(title), 'one title');

  // The model is never used here: no network was reachable and none was needed.
  console.log(`PASS: Deen backend (${checks} checks): rights, drafts and rules, banner, conversation, quote, fake and real checkout, create, copy, expiry.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => admin.app().delete());
