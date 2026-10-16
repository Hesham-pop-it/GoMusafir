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
const DAY = 86400000, MIN = 60000, HOURMS = 3600000;
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
  const stamp = Date.now(), org = `psorg${stamp}`, other = `psother${stamp}`;
  const trip = `pstrip${stamp}`, oldTrip = `psold${stamp}`, otherTrip = `psotrip${stamp}`;
  const now = Date.now();
  const mk = async (name, claims, withEmail = true) => {
    const email = `${name}-${stamp}@example.test`;
    const user = await admin.auth().createUser({ ...(withEmail ? { email } : {}), password: 'test-password', emailVerified: true });
    if (claims) await admin.auth().setCustomUserClaims(user.uid, claims);
    return { uid: user.uid, email };
  };
  const admin1 = await mk('admin', { role: 'admin', orgId: org });
  const host = await mk('host', { role: 'co-host', orgId: org });
  const manager = await mk('mgr', { role: 'manager', orgId: org });
  const forged = await mk('forged', { role: 'admin', orgId: org }); // claim says admin of the org, the staff map does not
  const outsider = await mk('out', { role: 'admin', orgId: other });
  const p1 = await mk('fatima'), p2 = await mk('yusuf'), p3 = await mk('maryam'), p4 = await mk('queued'), noMail = await mk('nomail', null, false);
  const stranger = await mk('stranger'), oldTimer = await mk('oldtimer'), foreign = await mk('foreign');
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
    [`trips_participants/${trip}/${p4.uid}`]: true, [`trips_participants/${trip}/${noMail.uid}`]: true, [`trips_participants/${trip}/${admin1.uid}`]: true,
    [`trips_participants/${oldTrip}/${oldTimer.uid}`]: true, [`trips_participants/${oldTrip}/${p1.uid}`]: true,
    [`trips_participants/${otherTrip}/${foreign.uid}`]: true,
    [`users/${p1.uid}/profile`]: { firstName: 'Fatima', lastName: 'Zahra', phone: '+31612345678' },
  });
  const steps = sampleSteps(now);
  steps.medisch = { consent: true, allergies: 'Pinda', notes: 'Diabetes type 2' };
  const seed = passportSeed({ org, tripId: trip, needsCopy: true, now, tripEnd: now + 30 * DAY, people: [
    { uid: p1.uid, label: 'p1', state: 'sent', steps },
    { uid: p2.uid, label: 'p2', state: 'expired', steps: { gegevens: steps.gegevens } },
    { uid: p3.uid, label: 'p3', state: 'revoked' },
  ] });
  await db.ref().update({
    ...seed.updates,
    [`passport_queue/${trip}_${p4.uid}`]: { org_id: org, trip_id: trip, uid: p4.uid, send_at: now + 3 * DAY },
    [`passport_family/${org}/${trip}/fam1`]: { from_uid: p1.uid, to_uid: p2.uid, relation: 'husband', answer_relation: 'wife', status: 'confirmed', created_at: now },
    [`passport_family/${org}/${trip}/fam2`]: { from_uid: p1.uid, to_uid: p3.uid, relation: 'mother', status: 'pending', created_at: now },
  });
  const store = require('../services/passport/passportStore');
  const staff = require('../services/passport/passportStaff');
  const links = require('../services/passport/passportLinks');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(64).fill(9)]);
  await store.storeDocument(org, trip, p1.uid, 'passport', { bytes: jpeg, contentType: 'image/jpeg', ext: 'jpg' });
  await store.storeDocument(org, trip, p1.uid, 'visa', { bytes: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(40, 66)]), contentType: 'application/pdf', ext: 'pdf' });
  
  const fns = load('groups/passportFunctions.js');
  const as = (person, role, data, orgId = org) => ({ app: {}, auth: { uid: person.uid, token: { role, orgId, auth_time: 1 } }, data, rawRequest: { ip: '203.0.113.5' } });
  const A = data => as(admin1, 'admin', data), H = data => as(host, 'co-host', data), M = data => as(manager, 'manager', data);
  let checks = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
  const eq = (a, b, msg) => { assert.deepEqual(plain(a), plain(b), msg || `check ${checks + 1}`); checks++; };
  const refuses = async (promise, code, reason, msg) => {
    await assert.rejects(promise, e => e.code === code && (reason === undefined || e.details?.reason === reason), msg); checks++;
  };
  const val = async path => (await db.ref(path).get()).val();
  const logs = async () => Object.values((await val(`orgs/${org}/logs`)) || {});
  const logsOf = async action => (await logs()).filter(l => l.action === action);
  const rewind = (path, ms) => db.ref(path).transaction(v => v - ms);
  const approve = at => db.ref(`sensitive_approval_state/${admin1.uid}`).set({ last_approved_at: at, purpose: 'passport_document', method: 'phone' });
  const approveHost = at => db.ref(`sensitive_approval_state/${host.uid}`).set({ last_approved_at: at, purpose: 'medical', method: 'phone' });
  const base1 = { orgId: org, tripId: trip };

  // ── Overview ──
  for (const call of [A, H, M]) eq(Object.keys(await fns.tripPassportOverview(call(base1))).sort(), ['families', 'meter', 'needs_copy', 'rows']);
  await refuses(fns.tripPassportOverview(as(outsider, 'admin', base1, other)), 'permission-denied');
  await refuses(fns.tripPassportOverview(as(forged, 'admin', base1)), 'permission-denied');
  await refuses(fns.tripPassportOverview(as(p1, 'participant', base1)), 'permission-denied');
  await refuses(fns.tripPassportOverview({ app: {}, data: base1, rawRequest: {} }), 'unauthenticated');
  await refuses(fns.tripPassportOverview(A({ orgId: org, tripId: otherTrip })), 'not-found');
  await refuses(fns.tripPassportOverview(A({ orgId: org })), 'invalid-argument');
  const ov = plain(await fns.tripPassportOverview(M(base1)));
  eq(ov.needs_copy, true);
  eq(ov.meter, { total: 5, ready: 1, passport: 1, visa: 1, emergency: 1 });
  eq(ov.rows.map(r => r.uid).sort(), [p1.uid, p2.uid, p3.uid, p4.uid, noMail.uid].sort(), 'staff are not rows');
  const row = uid => ov.rows.find(r => r.uid === uid);
  eq(Object.keys(row(p1.uid)).sort(), ['last_reminded_at', 'send', 'send_at', 'sent_at', 'status', 'uid']);
  eq([row(p1.uid).send, typeof row(p1.uid).sent_at, row(p1.uid).send_at], ['sent', 'number', null]);
  eq([row(p2.uid).send, row(p2.uid).sent_at], ['not_sent', null], 'an expired link is not sent');
  eq([row(p3.uid).send, row(p3.uid).sent_at], ['not_sent', null], 'a revoked link is not sent');
  eq([row(p4.uid).send, row(p4.uid).send_at], ['scheduled', now + 3 * DAY]);
  eq(row(noMail.uid).send, 'not_sent');
  eq(row(p1.uid).status, { gegevens: 'done', visum: 'done', paspoort: 'done', medisch: 'done', noodcontact: 'done', familie: 'todo', complete: true });
  eq(row(p2.uid).status, { gegevens: 'done', visum: 'todo', paspoort: 'todo', medisch: 'todo', noodcontact: 'todo', familie: 'todo', complete: false });
  eq(row(p3.uid).status.complete, false);
  eq(row(p1.uid).last_reminded_at, null);
  eq(ov.families.length, 1);
  eq(ov.families[0].members, [p1.uid, p2.uid].sort());
  eq(ov.families[0].links, [{ from: p1.uid, to: p2.uid, relation: 'husband' }, { from: p2.uid, to: p1.uid, relation: 'wife' }]);
  ok(typeof ov.families[0].id === 'string', 'family id');
  ok(!JSON.stringify(ov).includes('NX4123458'), 'no passport number in the overview');
  // the visa rule: yes needs a copy only when the trip asks for one
  await db.ref(`passport_status/${org}/${trip}/${p2.uid}`).update({ visum: 'done' });
  eq(row(p1.uid).status.visum, 'done');
  await db.ref(`passport_status/${org}/${trip}/${p2.uid}`).update({ visum: 'todo' });

  // ── Dossier ──
  for (const call of [A, H, M]) {
    const d = plain(await fns.participantDossier(call({ orgId: org, uid: p1.uid })));
    eq(Object.keys(d).sort(), ['allergies', 'contact', 'documents', 'emergency_contacts', 'family', 'has_medical_notes', 'has_visa', 'needs_copy', 'passport', 'status', 'trip_id', 'trip_title']);
    eq([d.trip_id, d.trip_title, d.needs_copy], [trip, `Umrah ${trip}`, true], 'next trip wins over the earlier one');
  }
  const before = (await logsOf('PASSPORT_DOSSIER_READ')).length;
  const d1 = plain(await fns.participantDossier(A({ orgId: org, uid: p1.uid, tripId: trip })));
  eq((await logsOf('PASSPORT_DOSSIER_READ')).length, before + 1, 'one audit entry per read');
  eq(d1.passport, { number_masked: 'NX4•••••8', nationality: 'Nederlandse', expiry: steps.paspoort.expiry });
  eq(d1.has_visa, false);
  eq([d1.allergies, d1.has_medical_notes], ['Pinda', true]);
  eq(Object.keys(d1.documents.passport), ['uploaded_at']);
  eq(Object.keys(d1.documents.visa), ['uploaded_at']);
  eq(d1.emergency_contacts, [{ name: 'Yusuf Zahra', relation: 'husband', phone_masked: '+31•••••••32' }]);
  eq(d1.family, [{ uid: p2.uid, relation: 'husband' }]);
  eq(plain((await fns.participantDossier(A({ orgId: org, uid: p2.uid }))).family), [{ uid: p1.uid, relation: 'wife' }]);
  eq(d1.status.complete, true);
  ok(d1.contact.email_masked.includes('•') && !JSON.stringify(d1.contact).includes(p1.email) && d1.contact.phone_masked.includes('•'), 'contact masked');
  const text = JSON.stringify(d1) + JSON.stringify(await logs());
  ok(!text.includes('NX4123458') && !text.includes('Diabetes') && !text.includes('+31698765432'), 'no sensitive value in the dossier or the log');
  const dNone = plain(await fns.participantDossier(A({ orgId: org, uid: p3.uid })));
  eq([dNone.passport, dNone.has_visa, dNone.documents, dNone.allergies, dNone.has_medical_notes, dNone.emergency_contacts, dNone.family],
    [null, null, { passport: null, visa: null }, '', false, [], []]);
  eq((await fns.participantDossier(A({ orgId: org, uid: oldTimer.uid }))).trip_id, oldTrip, 'latest trip when none is coming');
  eq((await fns.participantDossier(A({ orgId: org, uid: p1.uid, tripId: oldTrip }))).trip_id, oldTrip);
  await refuses(fns.participantDossier(A({ orgId: org, uid: stranger.uid })), 'not-found');
  await refuses(fns.participantDossier(A({ orgId: org, uid: foreign.uid })), 'not-found');
  await refuses(fns.participantDossier(A({ orgId: org, uid: admin1.uid })), 'not-found', 'not_participant');
  await refuses(fns.participantDossier(A({ orgId: org, uid: p1.uid, tripId: otherTrip })), 'not-found');
  await refuses(fns.participantDossier(as(outsider, 'admin', { orgId: org, uid: p1.uid }, other)), 'permission-denied');
  await refuses(fns.participantDossier(as(forged, 'admin', { orgId: org, uid: p1.uid })), 'permission-denied');

  // ── Opening documents and hidden values ──
  const open = (call, kind, uid = p1.uid) => fns.openPassportDocument(call({ ...base1, uid, kind }));
  await approve(now); // fresh, so only the role stops the manager
  for (const kind of ['passport', 'visa', 'passport_number', 'medical']) await refuses(open(M, kind), 'permission-denied', undefined, `manager denied ${kind}`);
  await refuses(fns.openPassportDocument(as(outsider, 'admin', { ...base1, uid: p1.uid, kind: 'passport' }, other)), 'permission-denied');
  await refuses(fns.openPassportDocument(as(forged, 'admin', { ...base1, uid: p1.uid, kind: 'passport' })), 'permission-denied');
  eq((await logsOf('SENSITIVE_DOCUMENT_OPENED')).length, 0, 'refusals leave no open entry');
  // stale approval
  await approve(now - 16 * MIN);
  for (const kind of ['passport', 'visa', 'passport_number', 'medical']) await refuses(open(A, kind), 'failed-precondition', 'approval_required', `stale ${kind}`);
  await refuses(open(H, 'passport_number'), 'failed-precondition', 'approval_required', 'co-host without any approval');
  await db.ref(`sensitive_approval_state/${admin1.uid}`).remove();
  await refuses(open(A, 'medical'), 'failed-precondition', 'approval_required', 'no approval at all');
  eq((await logsOf('SENSITIVE_DOCUMENT_OPENED')).length, 0, 'a refused open is not logged as an open');
  // fresh approval
  await approve(Date.now() - 14 * MIN);
  const pass = plain(await open(A, 'passport'));
  eq(Object.keys(pass), ['url']);
  const response = await fetch(pass.url);
  eq(response.status, 200);
  ok(/^attachment/i.test(response.headers.get('content-disposition') || ''), `attachment header, got ${response.headers.get('content-disposition')}`);
  ok(Buffer.from(await response.arrayBuffer()).equals(jpeg), 'the file itself');
  const visa = plain(await open(A, 'visa'));
  const visaResponse = await fetch(visa.url);
  eq(visaResponse.status, 200);
  ok(/^attachment/i.test(visaResponse.headers.get('content-disposition') || ''), 'visa attachment header');
  eq(plain(await open(A, 'passport_number')), { value: 'NX4123458' });
  eq(plain(await open(A, 'medical')), { value: 'Diabetes type 2' });
  await approveHost(Date.now());
  eq(plain(await open(H, 'passport_number')), { value: 'NX4123458' }, 'co-host with its own fresh approval');
  eq((await logsOf('SENSITIVE_DOCUMENT_OPENED')).length, 5, 'every open is logged');
  const opened = await logsOf('SENSITIVE_DOCUMENT_OPENED');
  eq(opened.map(l => l.kind).sort(), ['medical', 'passport', 'passport_number', 'passport_number', 'visa']);
  ok(opened.every(l => l.by && l.target === p1.uid && l.trip === trip && l.timestamp && !('value' in l) && !('url' in l)), 'who, whom, what, when');
  ok(!JSON.stringify(await logs()).includes('NX4123458') && !JSON.stringify(await logs()).includes('Diabetes') && !JSON.stringify(await logs()).includes('token='), 'no value or url in the log');
  await refuses(open(A, 'passport', p3.uid), 'not-found', 'no_document');
  await refuses(open(A, 'passport_number', p3.uid), 'not-found', 'no_value');
  await refuses(open(A, 'passport', stranger.uid), 'not-found', 'not_participant');
  await refuses(open(A, 'passport', admin1.uid), 'not-found', 'not_participant');
  await refuses(open(A, 'selfie'), 'invalid-argument', 'invalid_kind');
  await refuses(fns.openPassportDocument(A({ ...base1, uid: p1.uid })), 'invalid-argument');
  await refuses(fns.openPassportDocument(A({ orgId: org, tripId: otherTrip, uid: foreign.uid, kind: 'passport' })), 'not-found');
  eq((await logsOf('SENSITIVE_DOCUMENT_OPENED')).length, 5, 'failed opens are not logged as opens');
  await refuses(staff.openDocument({ ...base1, uid: p1.uid, kind: 'passport', by: admin1.uid, now: Date.now() + 20 * MIN }), 'failed-precondition', 'approval_required', 'the window is 15 minutes');

  // ── Reminders ──
  await refuses(fns.remindMissing(M(base1)), 'permission-denied');
  await refuses(fns.remindMissing(as(outsider, 'admin', base1, other)), 'permission-denied');
  await refuses(fns.remindMissing(as(forged, 'admin', base1)), 'permission-denied');
  await refuses(fns.remindMissing(A({ orgId: org, tripId: otherTrip })), 'not-found');
  await refuses(fns.remindMissing(A({ ...base1, uids: [] })), 'invalid-argument');
  const outbox = async () => Object.values((await val('dev_outbox')) || {});
  const reminders = async () => (await outbox()).filter(m => m.custom_args?.kind === 'passport_reminder');
  const first = plain(await fns.remindMissing(A(base1)));
  eq(Object.keys(first).sort(), ['reasons', 'reminded', 'skipped']);
  eq([first.reminded, first.skipped], [3, 2]);
  eq(first.reasons, { [p1.uid]: 'ready', [noMail.uid]: 'no_email' });
  const sentTo = (await reminders()).map(m => m.to).sort();
  eq(sentTo, [p2.email, p3.email, p4.email].sort());
  const mail2 = (await reminders()).find(m => m.to === p2.email);
  ok(mail2.subject.includes('Noor Travel'), 'organisation in the subject');
  const token2 = /[?&]t=([A-Za-z0-9_-]{43})/.exec(mail2.html)[1];
  ok(mail2.html.includes('/paspoort'), 'link to the passport page');
  const resolved = await links.resolveLink(token2);
  eq([resolved.link.uid, resolved.link.trip_id], [p2.uid, trip], 'the mailed link is usable');
  for (const person of [p2, p3, p4]) ok(Number.isFinite(await val(`passport_status/${org}/${trip}/${person.uid}/last_reminded_at`)), 'last_reminded_at stored');
  eq(await val(`passport_status/${org}/${trip}/${p1.uid}/last_reminded_at`), null);
  const ov2 = plain(await fns.tripPassportOverview(A(base1)));
  const row2 = uid => ov2.rows.find(r => r.uid === uid);
  eq([row2(p2.uid).send, row2(p3.uid).send, row2(p4.uid).send], ['sent', 'sent', 'sent'], 'a fresh link is usable');
  ok(Number.isFinite(row2(p2.uid).last_reminded_at), 'overview shows last_reminded_at');
  // 24 hour limit
  const again = plain(await fns.remindMissing(H(base1)));
  eq([again.reminded, again.skipped], [0, 5]);
  eq([again.reasons[p2.uid], again.reasons[p3.uid], again.reasons[p4.uid]], ['recent', 'recent', 'recent']);
  eq((await reminders()).length, 3, 'no second mail inside 24 hours');
  await rewind(`passport_status/${org}/${trip}/${p2.uid}/last_reminded_at`, 23 * HOURMS);
  eq(plain((await fns.remindMissing(A({ ...base1, uids: [p2.uid] })))).reasons, { [p2.uid]: 'recent' }, '23 hours is still too soon');
  await rewind(`passport_status/${org}/${trip}/${p2.uid}/last_reminded_at`, 2 * HOURMS);
  const pushes = [];
  const third = await staff.remind({ ...base1, uids: [p2.uid, stranger.uid, p1.uid], by: admin1.uid, push: async (uid, title, body, data) => { pushes.push([uid, title, data.type]); } });
  eq([third.reminded, third.skipped, third.reasons], [1, 2, { [stranger.uid]: 'not_participant', [p1.uid]: 'ready' }]);
  eq(pushes.length, 1);
  eq([pushes[0][0], pushes[0][2]], [p2.uid, 'passport_reminder']);
  ok(pushes[0][1].length > 0, 'push title');
  eq((await reminders()).length, 4);
  const audit = await logsOf('PASSPORT_REMINDERS_SENT');
  eq(audit.length, 4, 'one audit entry per reminder call');
  ok(JSON.stringify(audit).indexOf('@') === -1, 'no addresses in the audit');
  eq(await val(`passport_status/${org}/${trip}/${p1.uid}/complete`), true);
  eq(sendgridCalls.length, 0, 'SendGrid was never reached');
  console.log(`PASS: ${checks} passport staff checks: roles, forged claims, overview, dossier, approval gate, signed downloads, audit, reminders.`);
}
main().then(() => process.exit(process.exitCode || 0), error => { console.error(error); process.exit(1); });
