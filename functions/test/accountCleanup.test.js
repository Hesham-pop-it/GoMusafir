const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAccountCleanup, runOrganizationPurge, DELETED_USER_NAME, DELETED_USER_ID, ORG_PURGE_GRACE_MS } = require('../services/accountCleanupService');
const { createFakeDb, createFakeBucket, createFakeAuth } = require('./support/fakeDb');

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const seed = () => ({
  orgs: {
    org1: {
      metadata: { stripe_customer_id: 'cus_1' },
      payments: { pay1: { amount: 100 } },
      prepaid_seats: { total: 5 },
      logs: { l1: { action: 'X', by: 'owner', timestamp: 1 } },
      staff: { owner: 'admin', c1: 'co-host' },
      trips: {
        t1: { invitation_code: 'CODE1', image: 'https://firebasestorage.googleapis.com/v0/b/b/o/trips%2Fcover1.jpg?alt=media' },
        t3: { image: 'https://firebasestorage.googleapis.com/v0/b/b/o/trips%2Fcover1.jpg?alt=media' },
      },
    },
    org2: { staff: { owner2: 'admin' }, trips: { t2: { title: 'Other' } } },
  },
  trips_orgs: { t1: 'org1', t2: 'org2', t3: 'org1' },
  trips_participants: { t1: { p1: true, shared: true }, t2: { shared: true }, t3: { p1: true } },
  invites: { CODE1: { trip: 't1' } },
  app_access: { p1: { expires_at: 5 }, shared: {}, c1: {} },
  otp_codes: { p1: { code: 1 } },
  users: {
    p1: { full_name: 'Pil Grim', fcmToken: 'tok', stripe_customer_id: 'cus_p1', notifications: { n1: {} },
      joined_trips: { t1: { org_id: 'org1' }, t3: { org_id: 'org1' } } },
    shared: { full_name: 'Sha Red', joined_trips: { t1: { org_id: 'org1' }, t2: { org_id: 'org2' } } },
    c1: { staff_org_id: 'org1', full_name: 'Co Host' },
  },
  trips_active: {
    org1: {
      t1: {
        chat: {
          m1: { sender_id: 'p1', sender_name: 'Pil Grim', avatar: 'http://a', text: 'hello', timestamp: 1 },
          m2: { sender_id: 'p1', sender_name: 'Pil Grim', avatar: 'http://a', type: 'image', image_url: 'u', media_url: 'u', timestamp: 2 },
          m3: { sender_id: 'shared', sender_name: 'Sha Red', text: 'yo', timestamp: 3 },
          m4: { sender_id: 'c1', sender_name: 'Co Host', text: 'staff', timestamp: 4 },
        },
        locations: { p1: { lat: 1 }, shared: { lat: 2 } },
        read_pointers: { p1: 5, shared: 6 },
        notifications: { p1: { a: 1 }, shared: { a: 1 } },
        location_permissions: { shared: { p1: true }, p1: { shared: true } },
        voice_channel: { presence: { p1: true, shared: true }, app_presence: { p1: true }, active_hosts: { c1: true } },
        voice_presence: { p1: true },
      },
      t3: { chat: { m9: { sender_id: 'p1', sender_name: 'Pil Grim', text: 'z', timestamp: 1 } } },
    },
    org2: { t2: { chat: { x1: { sender_id: 'shared', sender_name: 'Sha Red', text: 'other org', timestamp: 1 } },
      locations: { shared: { lat: 3 } } } },
  },
});
const setup = (users = { p1: {}, shared: {}, c1: { claims: { role: 'co-host', orgId: 'org1' } }, owner: { claims: { role: 'admin', orgId: 'org1' } } }) => {
  const db = createFakeDb(seed()); const bucket = createFakeBucket(); const auth = createFakeAuth(users);
  return { db, bucket, auth, svc: createAccountCleanup({ db, bucket, auth, now: () => NOW }) };
};

test('removeUserCompletely anonymises chat, wipes presence and media, keeps payments and Stripe ids', async () => {
  const { db, bucket, svc } = setup();
  await svc.removeUserCompletely('p1');
  const d = db.dump();
  assert.equal(d.users.p1, undefined);
  assert.equal(d.otp_codes, undefined);
  assert.equal(d.app_access?.p1, undefined);
  const chat = d.trips_active.org1.t1.chat;
  assert.equal(chat.m1.sender_name, DELETED_USER_NAME);
  assert.equal(chat.m1.sender_id, DELETED_USER_ID);
  assert.equal(chat.m1.avatar, undefined);
  assert.equal(chat.m1.text, 'hello');
  assert.equal(chat.m2.image_url, undefined);
  assert.equal(chat.m2.media_url, undefined);
  assert.equal(chat.m3.sender_name, 'Sha Red');
  assert.equal(d.trips_active.org1.t3.chat.m9.sender_name, DELETED_USER_NAME);
  const t1 = d.trips_active.org1.t1;
  assert.equal(t1.locations.p1, undefined);
  assert.equal(t1.read_pointers.p1, undefined);
  assert.equal(t1.notifications.p1, undefined);
  assert.equal(t1.location_permissions, undefined);
  assert.equal(t1.voice_channel.presence.p1, undefined);
  assert.equal(t1.voice_channel.app_presence, undefined);
  assert.equal(t1.voice_presence, undefined);
  assert.equal(d.trips_participants.t1.p1, undefined);
  assert.equal(d.trips_participants.t1.shared, true);
  assert.ok(bucket.deletedPrefixes.includes('chat_media/t1/p1/'));
  assert.ok(bucket.deletedPrefixes.includes('participant_avatars/t1/p1/'));
  assert.ok(bucket.deletedPrefixes.includes('users/p1/'));
  // Payment and Stripe records are untouched.
  assert.equal(d.orgs.org1.payments.pay1.amount, 100);
  assert.equal(d.orgs.org1.metadata.stripe_customer_id, 'cus_1');
  assert.equal(d.orgs.org1.prepaid_seats.total, 5);
  assert.equal(d.orgs.org1.logs.l1.action, 'X');
});
test('cleanup is idempotent', async () => {
  const { db, svc } = setup();
  await svc.removeUserCompletely('p1');
  const first = db.dump();
  await svc.removeUserCompletely('p1');
  assert.deepEqual(db.dump(), first);
});
test('a staff member loses the staff record and the staff_org_id; their chat is anonymised across org trips', async () => {
  const { db, svc } = setup();
  await svc.removeUserCompletely('c1', { staffOrgId: 'org1' });
  const d = db.dump();
  assert.equal(d.orgs.org1.staff.c1, undefined);
  assert.equal(d.orgs.org1.staff.owner, 'admin');
  assert.equal(d.users.c1, undefined);
  assert.equal(d.trips_active.org1.t1.chat.m4.sender_name, DELETED_USER_NAME);
  assert.equal(d.trips_active.org1.t1.voice_channel.active_hosts, undefined);
});
test('removeUserFromOrg only touches that org and keeps the account', async () => {
  const { db, svc } = setup();
  await svc.removeUserFromOrg('shared', 'org1');
  const d = db.dump();
  assert.ok(d.users.shared);
  assert.equal(d.users.shared.joined_trips.t1, undefined);
  assert.ok(d.users.shared.joined_trips.t2);
  assert.equal(d.trips_active.org1.t1.chat.m3.sender_name, DELETED_USER_NAME);
  assert.equal(d.trips_active.org2.t2.chat.x1.sender_name, 'Sha Red');
  assert.ok(d.trips_active.org2.t2.locations.shared);
  assert.ok(d.trips_participants.t2.shared);
});
test('membership checks distinguish single-org and multi-org users', async () => {
  const { svc } = setup();
  assert.equal(await svc.hasMembershipsOutsideOrg('p1', 'org1'), false);
  assert.equal(await svc.hasMembershipsOutsideOrg('shared', 'org1'), true);
  assert.equal(await svc.userBelongsToOrg('p1', 'org1'), true);
  assert.equal(await svc.userBelongsToOrg('p1', 'org2'), false);
  assert.equal(await svc.userBelongsToOrg('c1', 'org1'), true);
});
test('deleteTripData removes trip records and media, keeps a cover shared with another trip', async () => {
  const { db, bucket, svc } = setup();
  const out = await svc.deleteTripData('org1', 't1');
  const d = db.dump();
  assert.deepEqual(out.participantIds.sort(), ['p1', 'shared']);
  assert.equal(d.orgs.org1.trips.t1, undefined);
  assert.equal(d.trips_active.org1.t1, undefined);
  assert.equal(d.invites, undefined);
  assert.equal(d.users.p1.joined_trips.t1, undefined);
  assert.ok(bucket.deletedPrefixes.includes('chat_media/t1/'));
  assert.ok(bucket.deletedPrefixes.includes('participant_avatars/t1/'));
  assert.deepEqual(bucket.deletedFiles, [], 'cover is still used by t3');
  await svc.deleteTripData('org1', 't3');
  assert.deepEqual(bucket.deletedFiles, ['trips/cover1.jpg']);
});
test('purgeOrganization removes trips and staff but keeps payments, Stripe id and logs', async () => {
  const { db, auth, svc } = setup();
  await svc.purgeOrganization('org1');
  const d = db.dump();
  assert.equal(d.orgs.org1.trips, undefined);
  assert.equal(d.orgs.org1.staff, undefined);
  assert.equal(d.trips_active.org1, undefined);
  assert.equal(d.users.c1.staff_org_id, undefined);
  assert.equal(d.orgs.org1.payments.pay1.amount, 100);
  assert.equal(d.orgs.org1.metadata.stripe_customer_id, 'cus_1');
  assert.equal(d.orgs.org1.metadata.purged_at, NOW);
  assert.ok(d.orgs.org1.logs.l1);
  assert.ok(d.orgs.org2.trips.t2, 'other orgs are untouched');
  assert.ok(auth.calls.some(c => c[0] === 'revoke' && c[1] === 'c1'));
  assert.ok(!auth.calls.some(c => c[0] === 'delete'), 'accounts are kept');
});
test('findOrganizationsDueForPurge honours the 30 day grace period and skips purged orgs', async () => {
  const { db, svc } = setup();
  await db.ref('orgs/org1/metadata/deleted_at').set(NOW - 29 * DAY);
  await db.ref('orgs/org2/metadata/deleted_at').set(NOW - 31 * DAY);
  assert.deepEqual(await svc.findOrganizationsDueForPurge(), ['org2']);
  await db.ref('orgs/org1/metadata/deleted_at').set(NOW - 30 * DAY);
  assert.deepEqual((await svc.findOrganizationsDueForPurge()).sort(), ['org1', 'org2']);
  await db.ref('orgs/org2/metadata/purged_at').set(NOW);
  assert.deepEqual(await svc.findOrganizationsDueForPurge(), ['org1']);
  assert.equal(ORG_PURGE_GRACE_MS, 30 * DAY);
});
test('the purge job does nothing unless explicitly enabled', async () => {
    const { db, svc } = setup();
  await db.ref('orgs/org2/metadata/deleted_at').set(NOW - 40 * DAY);
  const dry = await runOrganizationPurge(svc, { enabled: false });
  assert.deepEqual(dry.due, ['org2']);
  assert.deepEqual(dry.purged, []);
  assert.ok(db.dump().orgs.org2.trips.t2);
  const live = await runOrganizationPurge(svc, { enabled: true });
  assert.deepEqual(live.purged, ['org2']);
  assert.equal(db.dump().orgs.org2.trips, undefined);
});
test('cleanup code never references Stripe deletion or payment nodes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/accountCleanupService.js'), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/deleteStripeCustomer|stripe_customer_id|payments|invoice|prepaid_seats/.test(source));
});
test('removeUserCompletely clears the direct message and staff chat branches and report access of the user', async () => {
  const { db, svc } = setup();
  const base = 'trips_active/org1/t1';
  await db.ref(`${base}/inbox/p1/thr1`).set({ last: 1 });
  await db.ref(`${base}/inbox/shared/thr1`).set({ last: 1 });
  await db.ref(`${base}/dm_private/p1/x`).set({ text: 'secret' });
  await db.ref(`${base}/blocks/p1/shared`).set(true);
  await db.ref(`${base}/message_settings/p1`).set({ muted: true });
  await db.ref(`${base}/team/p1/m`).set({ text: 'to staff' });
  await db.ref(`${base}/team_meta/p1`).set({ n: 1 });
  await db.ref(`${base}/team_read/c1/p1`).set(1);
  await db.ref(`${base}/team_read/p1/c1`).set(1);
  await db.ref(`${base}/report_access/thr1`).set({ admin: true });
  await svc.removeUserCompletely('p1');
  const t1 = db.dump().trips_active.org1.t1;
  for (const node of ['dm_private', 'blocks', 'message_settings', 'team', 'team_meta']) assert.equal(t1[node], undefined, node);
  assert.equal(t1.inbox.p1, undefined);
  assert.ok(t1.inbox.shared, 'the other person keeps their own branch');
  assert.equal(t1.report_access, undefined);
  assert.equal(t1.team_read.p1, undefined);
});
