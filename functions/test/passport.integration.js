// Only demo emulators: real RTDB rules, Auth and Storage emulators, the real passport callables with the middleware stubbed.
// No network: SendGrid is replaced by a recorder that must stay untouched; mail lands in dev_outbox.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const project = process.env.GCLOUD_PROJECT;
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!project?.startsWith('demo-') || !databaseHost || !authHost || !storageHost) throw new Error('Demo emulators required (database, auth, storage)');
process.env.FUNCTIONS_EMULATOR = 'true';
delete process.env.SENDGRID_API_KEY;
const sendgridCalls = [];
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === '@sendgrid/mail') return { setApiKey: () => sendgridCalls.push('key'), send: async () => { sendgridCalls.push('send'); } };
  return originalLoad.call(this, request, ...rest);
};
const admin = require('firebase-admin');
const bucketName = `${project}.appspot.com`;
admin.initializeApp({ projectId: project, databaseURL: `http://${databaseHost}?ns=${project}-default-rtdb`, storageBucket: bucketName });
const db = admin.database();
const bucket = admin.storage().bucket();
const { passportSeed, sampleSteps, devToken } = require('./fixtures/passportSeed');
const tokens = require('../services/passport/passportTokens');
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
const jpegUrl = (size = 64, fill = 7) => `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(size).fill(fill)]).toString('base64')}`;
const pngUrl = () => `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(64).fill(3)]).toString('base64')}`;
const pdfUrl = () => `data:application/pdf;base64,${Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 65)]).toString('base64')}`;

async function main() {
  const stamp = Date.now(), org = `pporg${stamp}`, other = `ppother${stamp}`;
  const trip = `pptrip${stamp}`, oldTrip = `ppold${stamp}`, otherTrip = `ppotrip${stamp}`;
  const now = Date.now();
  const mk = async (name, claims, withEmail = true) => {
    const email = `${name}-${stamp}@example.test`;
    const user = await admin.auth().createUser({ ...(withEmail ? { email } : {}), password: 'test-password', emailVerified: true });
    if (claims) await admin.auth().setCustomUserClaims(user.uid, claims);
    let token = null;
    if (withEmail) {
      const r = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-password', returnSecureToken: true }) });
      token = (await r.json()).idToken;
    }
    return { uid: user.uid, email, token };
  };
  const admin1 = await mk('admin', { role: 'admin', orgId: org });
  const host = await mk('host', { role: 'co-host', orgId: org });
  const manager = await mk('mgr', { role: 'manager', orgId: org });
  const outsider = await mk('out', { role: 'admin', orgId: other });
  const p1 = await mk('fatima'), p2 = await mk('yusuf'), p3 = await mk('maryam'), noMail = await mk('nomail', null, false);
  const stranger = await mk('stranger'), p6 = await mk('late'), p7 = await mk('later'), oldTimer = await mk('oldtimer');
  const trips = (id, status, extra = {}) => ({ title: `Umrah ${id}`, destination: 'Makkah', status, total_seats: 20, participants: 6,
    start_date: now + 20 * DAY, end_date: now + 30 * DAY, created_at: now - DAY, ...extra });
  await db.ref().update({
    [`orgs/${org}/metadata/name`]: 'Noor Travel',
    [`orgs/${org}/staff/${admin1.uid}`]: 'admin', [`orgs/${org}/staff/${host.uid}`]: 'co-host', [`orgs/${org}/staff/${manager.uid}`]: 'manager',
    [`orgs/${other}/staff/${outsider.uid}`]: 'admin',
    [`orgs/${org}/trips/${trip}`]: trips(trip, 'active'),
    [`orgs/${org}/trips/${oldTrip}`]: trips(oldTrip, 'closed', { start_date: now - 60 * DAY, end_date: now - 50 * DAY }),
    [`orgs/${other}/trips/${otherTrip}`]: trips(otherTrip, 'active'),
    [`trips_orgs/${trip}`]: org, [`trips_orgs/${oldTrip}`]: org, [`trips_orgs/${otherTrip}`]: other,
    [`trips_participants/${trip}/${p1.uid}`]: true, [`trips_participants/${trip}/${p2.uid}`]: true, [`trips_participants/${trip}/${p3.uid}`]: true,
    [`trips_participants/${trip}/${noMail.uid}`]: true, [`trips_participants/${trip}/${admin1.uid}`]: true,
    [`trips_participants/${oldTrip}/${oldTimer.uid}`]: true,
    [`users/${p1.uid}/profile`]: { firstName: 'Fatima', lastName: 'Zahra', phone: '+31612345678' },
    [`users/${p2.uid}/profile`]: { firstName: 'Yusuf', lastName: 'Zahra' },
    [`users/${p3.uid}/profile`]: { firstName: 'Maryam', lastName: 'Zahra' },
  });
  const fns = load('groups/passportFunctions.js');
  const send = require('../services/passport/passportSend');
  const links = require('../services/passport/passportLinks');
  const retention = require('../services/passport/passportRetention');
  const as = (person, role, data, orgId = org) => ({ app: {}, auth: { uid: person.uid, token: { role, orgId, auth_time: 1 } }, data, rawRequest: { ip: '203.0.113.5' } });
  const A = data => as(admin1, 'admin', data), H = data => as(host, 'co-host', data), M = data => as(manager, 'manager', data);
  const P = data => ({ data, rawRequest: { ip: '198.51.100.7' } }); // pilgrims have no Firebase login
  const base1 = { orgId: org, tripId: trip };
  let checks = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
  const eq = (a, b, msg) => { assert.deepEqual(plain(a), plain(b), msg || `check ${checks + 1}`); checks++; };
  const refuses = async (promise, code, reason, msg) => {
    await assert.rejects(promise, e => e.code === code && (reason === undefined || e.details?.reason === reason), msg); checks++;
  };
  const outbox = async () => Object.values((await db.ref('dev_outbox').get()).val() || {});
  const mailsTo = async email => (await outbox()).filter(m => m.to === email);
  const tokenFrom = mail => /[?&]t=([A-Za-z0-9_-]{43})/.exec(mail.html)[1];
  const codeFrom = mail => /(\d{6})/.exec(mail.subject)[1];
  const val = async path => (await db.ref(path).get()).val();
  const rewind = async (path, ms) => db.ref(path).transaction(v => v - ms);
  const lastLink = async person => tokenFrom((await mailsTo(person.email).then(m => m.filter(x => x.custom_args?.kind === 'passport_link'))).at(-1));
  const lastCode = async person => codeFrom((await mailsTo(person.email).then(m => m.filter(x => x.custom_args?.kind === 'passport_code'))).at(-1));
  const hashOf = token => tokens.hashToken(token);

  // ── Rights: staff callables ────────────────────────────────────────────────────
  for (const name of ['sendPassportLinks', 'revokePassportLink', 'setPassportSettings', 'getPassportSettings']) {
    const data = { ...base1, uids: 'all', uid: p1.uid, mode: 'direct' };
    await refuses(fns[name](as(outsider, 'admin', data, other)), 'permission-denied', undefined, name + ' foreign org');
    await refuses(fns[name](as(outsider, 'admin', data, org)), 'permission-denied', undefined, name + ' forged claim');
    await refuses(fns[name]({ app: {}, data }), 'unauthenticated', undefined, name + ' anonymous');
  }
  for (const name of ['sendPassportLinks', 'revokePassportLink', 'setPassportSettings']) {
    await refuses(fns[name](M({ ...base1, uids: 'all', uid: p1.uid, mode: 'direct' })), 'permission-denied', undefined, name + ' manager');
  }
  eq(await fns.getPassportSettings(M(base1)), { mode: 'manual', amount: 0, lang: 'en', trip: { needs_copy: false } });
  await refuses(fns.getPassportSettings(A({ orgId: org, tripId: otherTrip })), 'not-found');

  // ── Settings: timing is admin only, the copy switch is admin or co-host ───────────
  await refuses(fns.setPassportSettings(H({ orgId: org, mode: 'direct' })), 'permission-denied');
  await refuses(fns.setPassportSettings(A({ orgId: org, mode: 'weekly' })), 'invalid-argument');
  await refuses(fns.setPassportSettings(A({ orgId: org, mode: 'hours' })), 'invalid-argument');
  await refuses(fns.setPassportSettings(A({ orgId: org })), 'invalid-argument');
  await refuses(fns.setPassportSettings(H({ orgId: org, needs_copy: true })), 'invalid-argument');
  await refuses(fns.setPassportSettings(H({ orgId: org, tripId: otherTrip, needs_copy: true })), 'not-found');
  eq(await fns.setPassportSettings(A({ orgId: org, mode: 'days', amount: 2, lang: 'nl' })), { mode: 'days', amount: 2, lang: 'nl' });
  eq(await fns.setPassportSettings(A({ orgId: org, mode: 'manual' })), { mode: 'manual', amount: 0, lang: 'nl' });

  // ── Sending links ──────────────────────────────────────────────────────────────
  const sent = plain(await fns.sendPassportLinks(A({ ...base1, uids: 'all' })));
  eq([sent.sent, sent.skipped, sent.failed], [3, 1, 0]);
  eq(sent.reasons[noMail.uid], 'no_email');
  eq(plain(await fns.sendPassportLinks(A({ ...base1, uids: [admin1.uid] }))).reasons[admin1.uid], 'not_participant'); // staff are never sent a link
  for (const person of [p1, p2, p3]) {
    const m = (await mailsTo(person.email)).filter(x => x.custom_args?.kind === 'passport_link');
    eq(m.length, 1);
    ok(m[0].subject.includes('paspoortgegevens') && m[0].subject.includes('Noor Travel'), 'dutch subject from the organisation language');
    ok(/https:\/\/join\.gomusafir\.app\/paspoort\?t=[A-Za-z0-9_-]{43}/.test(m[0].html), 'personal link');
  }
  eq(sendgridCalls, []);
  const token1 = await lastLink(p1);
  const dumpAll = async () => { const all = (await db.ref().get()).val(); delete all.dev_outbox; return JSON.stringify(all); }; // the emulator outbox is the mail itself
  const dump = await dumpAll();
  ok(!dump.includes(token1) && dump.includes(hashOf(token1)), 'only the hash of a link is stored');
  const rec = await val(`passport_links/${hashOf(token1)}`);
  eq([rec.org_id, rec.trip_id, rec.uid], [org, trip, p1.uid]);
  ok(rec.expires_at - rec.created_at === 14 * DAY, 'valid for 14 days');
  ok(tokens.isTokenShape(token1) && new Set([token1, await lastLink(p2), await lastLink(p3)]).size === 3, 'distinct random links');
  eq(plain(await fns.sendPassportLinks(A({ ...base1, uids: 'all' }))).sent, 0);
  eq(plain(await fns.sendPassportLinks(H({ ...base1, uids: [p1.uid] }))).reasons[p1.uid], 'recent');
  await refuses(fns.sendPassportLinks(A({ ...base1, uids: [] })), 'invalid-argument');
  await refuses(fns.sendPassportLinks(A({ ...base1 })), 'invalid-argument');
  await refuses(fns.sendPassportLinks(A({ orgId: org, tripId: otherTrip, uids: 'all' })), 'not-found');
  await refuses(fns.sendPassportLinks(A({ orgId: org, tripId: oldTrip, uids: 'all' })), 'failed-precondition');

  // ── Link states: invalid, expired, revoked, reissued ───────────────────────────────
  for (const bad of ['', 'short', 'x'.repeat(43), null]) await refuses(fns.passportOpen(P({ t: bad })), bad === null ? 'invalid-argument' : 'not-found', bad === null ? undefined : 'invalid');
  await refuses(fns.passportVerify(P({ t: 'x'.repeat(43), code: '123456' })), 'not-found', 'invalid');
  const opened = plain(await fns.passportOpen(P({ t: token1 })));
  eq(opened, { email_masked: tokens.maskEmail(p1.email), needs_code: true, org_name: 'Noor Travel', trip_title: `Umrah ${trip}`, lang: 'nl' });
  ok(!JSON.stringify(opened).includes(p1.email), 'the address is only given masked');
  let codes = (await mailsTo(p1.email)).filter(x => x.custom_args?.kind === 'passport_code');
  eq(codes.length, 1);
  ok(/^Je GoMusafir-code: \d{6}$/.test(codes[0].subject), 'code mail in the link language');
  await fns.passportOpen(P({ t: token1 })); // opening again does not send another code
  eq((await mailsTo(p1.email)).filter(x => x.custom_args?.kind === 'passport_code').length, 1);
  await db.ref(`passport_links/${hashOf(token1)}/expires_at`).set(now - 1);
  await refuses(fns.passportOpen(P({ t: token1 })), 'failed-precondition', 'expired');
  await refuses(fns.passportVerify(P({ t: token1, code: await lastCode(p1) })), 'failed-precondition', 'expired');
  await db.ref(`passport_links/${hashOf(token1)}/expires_at`).set(now + 13 * DAY);
  eq((await fns.revokePassportLink(A({ ...base1, uid: p1.uid }))), { revoked: true });
  await refuses(fns.passportOpen(P({ t: token1 })), 'permission-denied', 'revoked');
  eq(await fns.revokePassportLink(H({ ...base1, uid: p1.uid })), { revoked: false });
  await refuses(fns.revokePassportLink(A({ ...base1, uid: p1.uid, tripId: otherTrip })), 'not-found');
  ok(!(await val(`passport_codes/${hashOf(token1)}`)), 'a revoked link loses its code');
  await db.ref(`passport_link_index/${trip}/${p1.uid}/sent_at`).set(now - 20 * MIN);
  eq(plain(await fns.sendPassportLinks(A({ ...base1, uids: [p1.uid] }))).sent, 1); // reissue
  const tokenA = await lastLink(p1);
  ok(tokenA !== token1, 'a new link');
  await refuses(fns.passportOpen(P({ t: token1 })), 'permission-denied', 'revoked');
  await db.ref(`passport_link_index/${trip}/${p2.uid}/sent_at`).set(now - 20 * MIN);
  const token2Old = await lastLink(p2);
  eq(plain(await fns.sendPassportLinks(A({ ...base1, uids: [p2.uid] }))).sent, 1);
  await refuses(fns.passportOpen(P({ t: token2Old })), 'permission-denied', 'revoked'); // sending again withdraws the earlier link

  // ── Code: tries, expiry, cooldown, hourly limit, single use ─────────────────────────
  const t1 = tokenA, h1 = hashOf(t1);
  await fns.passportOpen(P({ t: t1 }));
  let code = await lastCode(p1);
  const wrong = code === '000000' ? '000001' : '000000';
  for (let left = 4; left >= 1; left--) {
    await assert.rejects(fns.passportVerify(P({ t: t1, code: wrong })), e => e.code === 'permission-denied' && e.details.reason === 'wrong_code' && e.details.tries_left === left); checks++;
  }
  await refuses(fns.passportVerify(P({ t: t1, code: wrong })), 'resource-exhausted', 'too_many');
  await refuses(fns.passportVerify(P({ t: t1, code })), 'resource-exhausted', 'too_many', 'the right code no longer works after five tries');
  await refuses(fns.passportVerify(P({ t: t1, code: 'abc' })), 'resource-exhausted', 'too_many');
  await assert.rejects(fns.passportResend(P({ t: t1 })), e => e.code === 'resource-exhausted' && e.details.reason === 'cooldown' && e.details.retry_after_s > 0); checks++;
  await rewind(`passport_codes/${h1}/sent_at`, 2 * MIN);
  eq(await fns.passportResend(P({ t: t1 })), { ok: true, cooldown_s: 60 });
  eq((await mailsTo(p1.email)).filter(x => x.custom_args?.kind === 'passport_code').length, 3); // one for the withdrawn link, two for this one
  const code2 = await lastCode(p1);
  await refuses(fns.passportVerify(P({ t: t1, code: '12345' })), 'permission-denied', 'wrong_code');
  await db.ref(`passport_codes/${h1}/expires_at`).set(Date.now() - 1);
  await refuses(fns.passportVerify(P({ t: t1, code: code2 })), 'failed-precondition', 'code_expired');
  await rewind(`passport_codes/${h1}/sent_at`, 2 * MIN);
  await db.ref(`passport_codes/${h1}`).update({ issued: 5, window_start: Date.now() });
  await assert.rejects(fns.passportResend(P({ t: t1 })), e => e.code === 'resource-exhausted' && e.details.reason === 'hourly_limit'); checks++;
  await db.ref(`passport_codes/${h1}/window_start`).set(Date.now() - 61 * MIN);
  await fns.passportResend(P({ t: t1 }));
  code = await lastCode(p1);
  const session1 = plain(await fns.passportVerify(P({ t: t1, code })));
  ok(tokens.isTokenShape(session1.session) && session1.expires_at - Date.now() > 59 * MIN && session1.expires_at - Date.now() <= 60 * MIN, 'session of 60 minutes');
  ok(!(await val(`passport_codes/${h1}`)), 'a code is used up by the right answer');
  await refuses(fns.passportVerify(P({ t: t1, code })), 'failed-precondition', 'code_missing');
  ok(!(await dumpAll()).includes(session1.session), 'only the hash of a session is stored');

  // ── Sessions ───────────────────────────────────────────────────────────────────
  const S1 = data => P({ session: session1.session, ...data });
  for (const name of ['passportGet', 'passportSave', 'passportUpload', 'familyRequest', 'familyAnswer']) {
    await refuses(fns[name](P({ data: {}, step: 'visum' })), 'invalid-argument', undefined, name + ' without session');
    await refuses(fns[name](P({ session: 'nope', step: 'visum' })), 'unauthenticated', 'session', name + ' garbage');
    await refuses(fns[name](P({ session: tokens.newToken() })), 'unauthenticated', 'session', name + ' unknown');
    await refuses(fns[name](P({ session: t1 })), 'unauthenticated', 'session', name + ' a link is not a session');
  }
  // ── Reading and saving the steps ────────────────────────────────────────────────
  const got = plain(await fns.passportGet(S1()));
  eq(Object.keys(got.steps), ['gegevens', 'visum', 'paspoort', 'medisch', 'noodcontact', 'familie']);
  eq(got.steps.gegevens, { status: 'todo', data: { name: 'Fatima Zahra', phone: '+31612345678', email: p1.email } });
  // A bare confirmation of the prefilled details saves them; "none" medical needs no consent and records none.
  eq((await fns.passportSave(P({ session: session1.session, step: 'gegevens', data: { confirmed: true } }))).steps.gegevens, { status: 'done', data: { confirmed: true, name: 'Fatima Zahra', phone: '+31612345678', email: p1.email } });
  await fns.passportSave(P({ session: session1.session, step: 'medisch', data: { none: true, allergies: 'x', consent: false } }));
  eq((await val(`passport_status/${org}/${trip}/${p1.uid}`)).medical_consent_at, null);
  eq((await fns.passportGet(P({ session: session1.session }))).steps.medisch, { status: 'done', data: { none: true, allergies: '', notes: '', consent: false } });
  eq(Object.values(got.steps).slice(1).map(s => s.status), ['todo', 'todo', 'todo', 'todo', 'todo']);
  eq([got.trip, got.family], [{ needs_copy: false }, { incoming: [], outgoing: [] }]);
  await fns.passportGet(S1());
  const steps = sampleSteps(Date.now());
  const save = (step, data) => fns.passportSave(S1({ step, data }));
  const invalid = async (step, data, field) => {
    await assert.rejects(save(step, data), e => e.code === 'invalid-argument' && e.details.reason === 'invalid_field' && e.details.field === field, `${step} ${field}`); checks++;
  };
  await invalid('gegevens', { ...steps.gegevens, phone: 'abc' }, 'phone');
  await invalid('gegevens', { ...steps.gegevens, email: 'x' }, 'email');
  await invalid('paspoort', { ...steps.paspoort, expiry: new Date(Date.now() - DAY).toISOString().slice(0, 10) }, 'expiry');
  await invalid('paspoort', { ...steps.paspoort, expiry: new Date().toISOString().slice(0, 10) }, 'expiry');
  await invalid('medisch', { allergies: 'Pinda' }, 'consent');
  await invalid('medisch', { consent: false, none: false, allergies: 'Pinda' }, 'consent');
  await invalid('noodcontact', { contacts: [] }, 'contacts');
  await invalid('noodcontact', { contacts: [steps.noodcontact.contacts[0], steps.noodcontact.contacts[0], steps.noodcontact.contacts[0]] }, 'contacts');
  await invalid('visum', { has_visa: 'ja' }, 'has_visa');
  await refuses(save('bloed', {}), 'invalid-argument', 'invalid_step');
  ok(!(await val(`passport/${org}/${trip}/${p1.uid}/steps/paspoort`)) && !(await val(`passport/${org}/${trip}/${p1.uid}/steps/noodcontact`)), 'nothing was stored by the refused saves');
  let view = plain((await save('gegevens', { ...steps.gegevens, phone: '+31 6 1234 5678', extra: 'dropped' })).steps);
  eq(view.gegevens, { status: 'done', data: { ...steps.gegevens, confirmed: true } });
  await save('visum', steps.visum);
  await save('paspoort', steps.paspoort);
  await save('medisch', steps.medisch);
  view = plain((await save('noodcontact', steps.noodcontact)).steps);
  eq(view.paspoort.data.number, 'NX4•••••8');
  eq([view.paspoort.status, view.medisch.status, view.noodcontact.status, view.familie.status], ['done', 'done', 'done', 'todo']);
  ok(!JSON.stringify(view).includes('NX4123458'), 'the number is only returned masked');
  eq(view.medisch.data, { none: false, consent: true, consent_lang: '', allergies: 'Pinda', notes: '' });
  let status = await val(`passport_status/${org}/${trip}/${p1.uid}`);
  eq([status.complete, status.familie, status.medical_consent_version], [true, 'todo', 'v1']);
  ok(Number.isFinite(status.medical_consent_at), 'consent moment recorded');
  const rawTree = JSON.stringify(await val(`passport/${org}/${trip}/${p1.uid}`));
  for (const secret of ['NX4123458', '+31612345678', 'Pinda', 'Yusuf', 'Nederlandse', 'fatima@example.test']) ok(!rawTree.includes(secret), `${secret} is not stored in plain text`);
  ok(Object.values((await val(`passport/${org}/${trip}/${p1.uid}/steps`))).every(s => /^[0-9a-f]+\.[0-9a-f]+\.[0-9a-f]+$/.test(s.enc)), 'every step is encrypted');
  // The masked number sent back unchanged keeps the stored one; a changed number replaces it.
  await save('paspoort', { ...steps.paspoort, number: 'NX4•••••8', nationality: 'Marokkaanse' });
  const keep = require('../services/passport/passportStore');
  eq((await keep.loadRecord(org, trip, p1.uid)).stored.paspoort, { ...steps.paspoort, nationality: 'Marokkaanse' });
  await save('paspoort', { ...steps.paspoort, number: 'zz9999999' });
  eq((await keep.loadRecord(org, trip, p1.uid)).stored.paspoort.number, 'ZZ9999999');
  await save('familie', {});
  eq(plain((await fns.passportGet(S1())).steps.familie.status), 'done');
  eq((await fns.passportGet(S1())).trip.needs_copy, false);

  // ── Uploads ────────────────────────────────────────────────────────────────────
  await refuses(fns.passportUpload(S1({ kind: 'passport', dataUrl: jpegUrl() })), 'failed-precondition', 'copy_not_needed');
  eq(await fns.setPassportSettings(H({ ...base1, needs_copy: true })), { mode: 'manual', amount: 0, lang: 'nl', trip: { needs_copy: true } });
  eq(plain((await fns.passportGet(S1())).trip), { needs_copy: true });
  eq(plain((await fns.passportGet(S1())).steps.paspoort.status), 'todo'); // the photo is now required
  eq((await val(`passport_status/${org}/${trip}`) || {})[p1.uid] === undefined, false);
  const badUpload = async (kind, dataUrl, msg) => refuses(fns.passportUpload(S1({ kind, dataUrl })), 'invalid-argument', 'invalid_document', msg);
  await badUpload('passport', pdfUrl(), 'pdf is only for a visa');
  await badUpload('passport', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', 'gif');
  await badUpload('passport', `data:image/jpeg;base64,${Buffer.alloc(64).toString('base64')}`, 'wrong bytes');
  await badUpload('passport', pngUrl().replace('image/png', 'image/jpeg'), 'declared type differs from the bytes');
  await badUpload('selfie', jpegUrl(), 'unknown kind');
  await badUpload('passport', jpegUrl(5 * 1024 * 1024), 'five megabytes');
  await badUpload('passport', 'hello', 'not a data url');
  const up = plain(await fns.passportUpload(S1({ kind: 'passport', dataUrl: jpegUrl() })));
  ok(up.ok === true && Math.abs(up.uploaded_at - Date.now()) < 60000, 'upload answer');
  const docPath = `passport_docs/${org}/${trip}/${p1.uid}/passport.jpg`;
  ok((await bucket.file(docPath).exists())[0], 'stored in the private path');
  eq((await bucket.file(docPath).getMetadata())[0].contentType, 'image/jpeg');
  eq(plain((await fns.passportGet(S1())).steps.paspoort), { status: 'done', data: { ...(await keep.loadRecord(org, trip, p1.uid)).stored.paspoort, number: 'ZZ9•••••9', uploaded_at: up.uploaded_at } });
  await fns.passportSave(S1({ step: 'visum', data: { has_visa: true } }));
  eq(plain((await fns.passportGet(S1())).steps.visum.status), 'todo'); // yes, but the copy is missing
  await fns.passportUpload(S1({ kind: 'visa', dataUrl: pdfUrl() }));
  ok((await bucket.file(`passport_docs/${org}/${trip}/${p1.uid}/visa.pdf`).exists())[0], 'visa pdf stored');
  eq(plain((await fns.passportGet(S1())).steps.visum.status), 'done');
  await fns.passportUpload(S1({ kind: 'passport', dataUrl: pngUrl() }));
  ok((await bucket.file(`passport_docs/${org}/${trip}/${p1.uid}/passport.png`).exists())[0] && !(await bucket.file(docPath).exists())[0], 'a new copy replaces the old one');
  eq((await val(`passport_status/${org}/${trip}/${p1.uid}/complete`)), true);
  for (let i = 0; i < 7; i++) await fns.passportUpload(S1({ kind: 'visa', dataUrl: jpegUrl(64, i) }));
  await refuses(fns.passportUpload(S1({ kind: 'visa', dataUrl: jpegUrl() })), 'resource-exhausted', 'upload_limit');
  const files = (await bucket.getFiles({ prefix: `passport_docs/${org}/${trip}/${p1.uid}/` }))[0].map(f => f.name).sort();
  eq(files, [`passport_docs/${org}/${trip}/${p1.uid}/passport.png`, `passport_docs/${org}/${trip}/${p1.uid}/visa.jpg`]);

  // ── Family: the sender cannot tell whether the other person exists ────────────────
  const stranger2 = 'nobody-here@example.test';
  const r1 = plain(await fns.familyRequest(S1({ email: p2.email.toUpperCase(), relation: 'brother' })));
  const r2 = plain(await fns.familyRequest(S1({ email: stranger2, relation: 'brother' })));
  const r3 = plain(await fns.familyRequest(S1({ email: stranger.email, relation: 'brother' }))); // has an account, is not on this trip
  eq([r1, r2], [{ ok: true, status: 'sent' }, { ok: true, status: 'sent' }]);
  eq(r3, r1);
  eq(plain(await fns.familyRequest(S1({ email: p2.email, relation: 'brother' }))), r1); // duplicate answers the same
  eq(plain(await fns.familyRequest(S1({ email: p1.email, relation: 'brother' }))), r1); // own address too
  await refuses(fns.familyRequest(S1({ email: 'bad', relation: 'brother' })), 'invalid-argument', 'invalid_field');
  await refuses(fns.familyRequest(S1({ email: p2.email, relation: 'cousin' })), 'invalid-argument', 'invalid_field');
  let fam = plain((await fns.passportGet(S1())).family);
  eq(fam.incoming, []);
  eq(fam.outgoing.map(o => [o.email_masked, o.relation, o.status]).sort(), [[tokens.maskEmail(p2.email), 'brother', 'sent'], [tokens.maskEmail(stranger2), 'brother', 'sent'], [tokens.maskEmail(stranger.email), 'brother', 'sent']].sort());
  const session = async person => {
    await db.ref(`passport_link_index/${trip}/${person.uid}/sent_at`).set(Date.now() - 20 * MIN);
    await fns.sendPassportLinks(A({ ...base1, uids: [person.uid] }));
    const t = await lastLink(person);
    await fns.passportOpen(P({ t }));
    return (await fns.passportVerify(P({ t, code: await lastCode(person) }))).session;
  };
  const S2 = data => P({ session: sess2, ...data });
  const sess2 = await session(p2);
  const fam2 = plain((await fns.passportGet(S2())).family);
  eq(fam2.outgoing, []);
  eq(fam2.incoming.map(i => [i.name, i.relation, i.status]), [['Fatima Zahra', 'brother', 'pending']]);
  const requestId = fam2.incoming[0].id;
  await refuses(fns.familyAnswer(S2({ id: requestId })), 'invalid-argument');
  await refuses(fns.familyAnswer(S2({ id: requestId, relation: 'cousin' })), 'invalid-argument');
  await refuses(fns.familyAnswer(S2({ id: requestId, decline: true, relation: 'sister' })), 'invalid-argument');
  await refuses(fns.familyAnswer(S1({ id: requestId, relation: 'sister' })), 'not-found'); // not addressed to this person
  await refuses(fns.familyAnswer(S2({ id: 'nope', relation: 'sister' })), 'not-found');
  const declined = plain(await fns.familyAnswer(S2({ id: requestId, decline: true })));
  eq(declined, { ok: true, family: { incoming: [], outgoing: [] } });
  fam = plain((await fns.passportGet(S1())).family);
  eq(fam.outgoing.map(o => o.status), ['sent', 'sent', 'sent']); // a decline looks like nothing happened
  await refuses(fns.familyAnswer(S2({ id: requestId, relation: 'sister' })), 'not-found'); // already answered
  eq(plain(await fns.familyRequest(S1({ email: p2.email, relation: 'brother' }))), r1);
  eq(plain((await fns.passportGet(S2())).family.incoming), []); // no second chance after a decline
  // p3 asks p2, who accepts: both sides show one confirmed family link.
  const sess3 = await session(p3);
  const S3 = data => P({ session: sess3, ...data });
  await fns.familyRequest(S3({ email: p2.email, relation: 'mother' }));
  const pending = plain((await fns.passportGet(S2())).family.incoming);
  eq(pending.map(i => [i.name, i.relation]), [['Maryam Zahra', 'mother']]);
  const accepted = plain(await fns.familyAnswer(S2({ id: pending[0].id, relation: 'son' })));
  eq(accepted.family.incoming.map(i => [i.status, i.their_relation]), [['confirmed', 'son']]);
  const fam3 = plain((await fns.passportGet(S3())).family.outgoing);
  eq(fam3.map(o => [o.status, o.name, o.their_relation]), [['confirmed', 'Yusuf Zahra', 'son']]);
  eq(plain((await fns.passportGet(S1())).family.incoming), []); // p1 sees nothing of it
  ok((await val(`passport_family/${org}/${trip}`)) !== null, 'family records exist only server side');

  // ── A session ends with its time, its link or the trip membership ──────────────────
  await db.ref(`passport_sessions/${hashOf(session1.session)}/expires_at`).set(Date.now() - 1);
  await refuses(fns.passportGet(S1()), 'unauthenticated', 'session');
  await refuses(fns.passportSave(S1({ step: 'familie', data: {} })), 'unauthenticated', 'session');
  await db.ref(`passport_sessions/${hashOf(session1.session)}/expires_at`).set(Date.now() + 30 * MIN);
  eq(plain((await fns.passportGet(S1())).steps.gegevens.status), 'done');
  await fns.revokePassportLink(A({ ...base1, uid: p1.uid }));
  await refuses(fns.passportGet(S1()), 'unauthenticated', 'revoked');
  await refuses(fns.passportUpload(S1({ kind: 'visa', dataUrl: jpegUrl() })), 'unauthenticated', 'revoked');
  await db.ref(`trips_participants/${trip}/${p3.uid}`).remove();
  await refuses(fns.passportGet(S3()), 'unauthenticated', 'session');
  await db.ref(`trips_participants/${trip}/${p3.uid}`).set(true);
  eq(plain((await fns.passportGet(S3())).steps.gegevens.status), 'todo');

  // ── Audit ──────────────────────────────────────────────────────────────────────
  const logs = Object.values(await val(`orgs/${org}/logs`) || {});
  const count = action => logs.filter(l => l.action === action).length;
  ok(count('PASSPORT_SESSION_STARTED') >= 3 && count('PASSPORT_LINKS_SENT') >= 4 && count('PASSPORT_LINK_REVOKED') >= 3, 'sessions, sends and revocations are logged');
  ok(count('PASSPORT_SETTINGS_CHANGED') === 3 && count('PASSPORT_STEP_SAVED') >= 10 && count('PASSPORT_DOCUMENT_UPLOADED') === 10, 'settings, saves and uploads are logged');
  eq(logs.filter(l => l.action === 'PASSPORT_DATA_READ' && l.by === p1.uid).length, 1); // many reads in one session, one entry
  ok(count('PASSPORT_FAMILY_REQUESTED') >= 7 && count('PASSPORT_FAMILY_DECLINED') === 1 && count('PASSPORT_FAMILY_CONFIRMED') === 1, 'family actions are logged');
  ok(logs.every(l => !JSON.stringify(l).match(/NX4|Pinda|\+316/)), 'the log never holds the data itself');
  ok(logs.filter(l => l.action === 'PASSPORT_DATA_READ').every(l => l.via === 'passport_link' && l.target === trip && l.ip_hash), 'reads name the trip and a hashed address');

  // ── Rules: no client reads or writes any passport path ───────────────────────────
  const raw = async (token, path, method, value) => (await fetch(`${base}/${path}.json?ns=${ns}${token ? `&auth=${encodeURIComponent(token)}` : ''}`, {
    method, headers: { 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })).status;
  const nodes = ['passport', `passport/${org}/${trip}/${p1.uid}`, 'passport_status', `passport_status/${org}/${trip}`, 'passport_links', `passport_links/${h1}`, 'passport_link_index',
    `passport_codes/${h1}`, 'passport_codes', 'passport_sessions', 'passport_family', `passport_family/${org}/${trip}`, 'passport_settings', `passport_settings/${org}`,
    'passport_trip_settings', 'passport_queue', 'passport_retention'];
  for (const [who, token] of [['admin', admin1.token], ['co-host', host.token], ['manager', manager.token], ['pilgrim', p1.token], ['anonymous', null]]) {
    for (const node of nodes) {
      eq([who, node, await raw(token, node, 'GET')], [who, node, 401]);
      eq([who, node, await raw(token, node, 'PUT', { hacked: true })], [who, node, 401]);
    }
  }
  const objectUrl = path => `http://${storageHost}/v0/b/${bucketName}/o/${encodeURIComponent(path)}`;
  for (const authorization of [`Firebase ${admin1.token}`, `Firebase ${p1.token}`, null]) {
    const headers = authorization ? { Authorization: authorization } : {};
    eq((await fetch(`${objectUrl(`passport_docs/${org}/${trip}/${p1.uid}/passport.png`)}?alt=media`, { headers })).status, 403);
    eq((await fetch(objectUrl(`passport_docs/${org}/${trip}/${p1.uid}/passport.png`), { headers })).status, 403);
    const write = await fetch(`http://${storageHost}/v0/b/${bucketName}/o?uploadType=media&name=${encodeURIComponent(`passport_docs/${org}/${trip}/${p1.uid}/x.jpg`)}`,
      { method: 'POST', headers: { ...headers, 'Content-Type': 'image/jpeg' }, body: 'x' });
    eq(write.status, 403);
  }

  // ── Send queue: timing counts from joining; running trips are not swept up ──────────
  const mailCount = async () => (await outbox()).length;
  eq(await send.enqueueJoin({ orgId: org, tripId: trip, uid: p6.uid }), null); // manual: nothing queued
  eq(await val('passport_queue'), null);
  await fns.setPassportSettings(A({ orgId: org, mode: 'direct' }));
  await db.ref(`trips_participants/${trip}/${p6.uid}`).set(true);
  const joinedAt = Date.now();
  ok(await send.enqueueJoin({ orgId: org, tripId: trip, uid: p6.uid, now: joinedAt }) === joinedAt, 'direct is due at once');
  eq(await send.enqueueJoin({ orgId: org, tripId: trip, uid: admin1.uid }), null); // staff are not pilgrims
  const before = await mailCount();
  const run1 = await send.processDue({ now: joinedAt + 1000 });
  eq([run1.sent, await mailCount() - before, (await mailsTo(p6.email)).length], [1, 1, 1]);
  eq(await val('passport_queue'), null);
  ok((await val(`passport_link_index/${trip}/${p6.uid}`)).sent_at > 0, 'sent is recorded');
  eq(await send.enqueueJoin({ orgId: org, tripId: trip, uid: p6.uid, now: joinedAt }), null); // already has a link
  await fns.setPassportSettings(A({ orgId: org, mode: 'hours', amount: 6 }));
  await db.ref(`trips_participants/${trip}/${p7.uid}`).set(true);
  eq(await send.enqueueJoin({ orgId: org, tripId: trip, uid: p7.uid, now: joinedAt }), joinedAt + 6 * 3600000);
  eq(plain(await send.processDue({ now: joinedAt + 5 * 3600000 })), { sent: 0, dropped: 0, held: 0 });
  eq((await mailsTo(p7.email)).length, 0);
  eq(plain(await send.processDue({ now: joinedAt + 6 * 3600000 + 1 })).sent, 1);
  eq((await mailsTo(p7.email)).length, 1);
  eq(plain(await send.processDue({ now: joinedAt + 7 * 3600000 })), { sent: 0, dropped: 0, held: 0 });
  // A finished person, and a trip that ended, drop out of the queue without mail.
  await db.ref(`passport_queue/${trip}_${p3.uid}`).set({ org_id: org, trip_id: trip, uid: p3.uid, send_at: joinedAt });
  await db.ref(`passport_status/${org}/${trip}/${p3.uid}/complete`).set(true);
  await db.ref(`passport_queue/${oldTrip}_${oldTimer.uid}`).set({ org_id: org, trip_id: oldTrip, uid: oldTimer.uid, send_at: joinedAt });
  const mails = await mailCount();
  eq(plain(await send.processDue({ now: joinedAt + DAY })), { sent: 0, dropped: 2, held: 0 });
  eq([await mailCount(), await val('passport_queue')], [mails, null]);
  eq(sendgridCalls, []);

  // ── Retention: 30 days after the trip's end, statuses stay ─────────────────────────
  const seeded = passportSeed({ org, tripId: oldTrip, needsCopy: true, tripEnd: now - 50 * DAY, now,
    people: [{ uid: oldTimer.uid, label: 'old-timer', state: 'verified', steps: sampleSteps(now) }] });
  await db.ref().update(seeded.updates);
  eq(seeded.links[oldTimer.uid].token, devToken('old-timer'));
  await bucket.file(`passport_docs/${org}/${oldTrip}/${oldTimer.uid}/passport.jpg`).save(Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]), { contentType: 'image/jpeg' });
  await db.ref(`passport_family/${org}/${oldTrip}/f1`).set({ from_uid: oldTimer.uid, to_uid: null, status: 'pending' });
  const oldDue = (await val(`passport_retention/${oldTrip}`)).delete_after;
  eq(oldDue, now - 20 * DAY);
  ok(!!(await val(`passport/${org}/${oldTrip}/${oldTimer.uid}/steps/paspoort`)), 'seeded data is there');
  const liveDue = (await val(`passport_retention/${trip}`)).delete_after;
  ok(Math.abs(liveDue - (now + 60 * DAY)) < DAY, 'live trip is due 30 days after its end');
  // The seeded person works through the real callables with the seeded session.
  eq(plain((await fns.passportGet(P({ session: seeded.links[oldTimer.uid].session }))).steps.paspoort.data.number), 'NX4•••••8');
  // Two weeks short of the deadline nothing goes; past it everything sensitive does.
  eq(plain(await retention.runRetention({ now: oldDue - 1 })), { trips: 0, people: 0, postponed: 0 });
  ok(!!(await val(`passport/${org}/${oldTrip}`)), 'not yet due');
  await db.ref(`orgs/${org}/trips/${oldTrip}/end_date`).set(now - 10 * DAY); // extended trip: postponed, not deleted
  eq(plain(await retention.runRetention({ now: oldDue + 1 })), { trips: 0, people: 0, postponed: 1 });
  ok(!!(await val(`passport/${org}/${oldTrip}`)), 'an extended trip keeps its data');
  eq((await val(`passport_retention/${oldTrip}/delete_after`)), now - 10 * DAY + 30 * DAY);
  await db.ref(`orgs/${org}/trips/${oldTrip}/end_date`).set(now - 50 * DAY);
  await db.ref(`passport_retention/${oldTrip}/delete_after`).set(now - 20 * DAY);
  const doneRun = plain(await retention.runRetention({ now: now + 1 }));
  eq([doneRun.trips, doneRun.people], [1, 1]);
  for (const path of [`passport/${org}/${oldTrip}`, `passport_family/${org}/${oldTrip}`, `passport_link_index/${oldTrip}`, `passport_retention/${oldTrip}`,
    `passport_links/${hashOf(seeded.links[oldTimer.uid].token)}`]) eq([path, await val(path)], [path, null]);
  eq((await bucket.getFiles({ prefix: `passport_docs/${org}/${oldTrip}/` }))[0].length, 0);
  const kept = await val(`passport_status/${org}/${oldTrip}/${oldTimer.uid}`);
  ok(kept.gegevens === 'done' && kept.noodcontact === 'done' && kept.medical_consent_at > 0 && kept.purged_at > 0, 'the statuses and the consent record remain');
  await refuses(fns.passportOpen(P({ t: seeded.links[oldTimer.uid].token })), 'not-found', 'invalid');
  await refuses(fns.passportGet(P({ session: seeded.links[oldTimer.uid].session })), 'unauthenticated');
  ok((await bucket.file(`passport_docs/${org}/${trip}/${p1.uid}/passport.png`).exists())[0] && !!(await val(`passport/${org}/${trip}/${p1.uid}`)), 'a running trip is untouched');
  // Old sessions are swept away.
  await db.ref(`passport_sessions/${hashOf(session1.session)}/expires_at`).set(Date.now() - 1);
  ok((await retention.dropExpiredSessions()) >= 1 && !(await val(`passport_sessions/${hashOf(session1.session)}`)), 'expired sessions are removed');

  // ── Seed builder states ─────────────────────────────────────────────────────────
  const demo = passportSeed({ org, tripId: trip, now, people: [
    { uid: p6.uid, label: 'seed-sent', state: 'sent' }, { uid: p7.uid, label: 'seed-code', state: 'code' },
    { uid: stranger.uid, label: 'seed-old', state: 'expired' }, { uid: oldTimer.uid, label: 'seed-revoked', state: 'revoked' }] });
  await db.ref().update(demo.updates);
  await refuses(fns.passportOpen(P({ t: demo.links[stranger.uid].token })), 'failed-precondition', 'expired');
  await refuses(fns.passportOpen(P({ t: demo.links[oldTimer.uid].token })), 'permission-denied', 'revoked');
  eq(demo.links[p7.uid].code, '123456');
  ok(tokens.isTokenShape((await fns.passportVerify(P({ t: demo.links[p7.uid].token, code: '123456' }))).session), 'the seeded code opens a session');
  console.log(`PASS: ${checks} passport checks: rights, link expiry and revocation, code tries, sessions, validation, uploads, family privacy, rules and retention.`);
}
main().then(() => process.exit(process.exitCode || 0), error => { console.error(error); process.exit(1); });
