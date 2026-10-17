const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeletionService, GRACE_MS } = require('../services/deletionService');
const { createAccountCleanup } = require('../services/accountCleanupService');
const { findActiveJourneys } = require('../services/activeJourneys');
const { createFakeDb, createFakeBucket, createFakeAuth } = require('./support/fakeDb');

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const TOKEN = 'a'.repeat(64);
const seed = () => ({
  orgs: {
    org: {
      metadata: { name: 'Al Noor Travel', admin_uid: 'owner', stripe_customer_id: 'cus_1' },
      staff: { owner: 'admin', c1: 'co-host' },
      payments: { p: { amount: 5 } },
      logs: {},
      trips: { ended: { title: 'Old', status: 'active', start_date: NOW - 9 * DAY, end_date: NOW - DAY } },
    },
  },
  trips_orgs: { ended: 'org' },
  trips_participants: { ended: { pil: true } },
  users: { owner: { staff_org_id: 'org' }, c1: { staff_org_id: 'org' }, pil: { full_name: 'Pil', joined_trips: { ended: { org_id: 'org' } } } },
  trips_active: { org: { ended: { chat: { m1: { sender_id: 'pil', sender_name: 'Pil', text: 'hi' } } } } },
});
function fixture({ mailFails = false, clock = { t: NOW } } = {}) {
  const db = createFakeDb(seed());
  const authFake = createFakeAuth({
    owner: { email: 'owner@example.test' }, c1: { email: 'c1@example.test' }, pil: { email: 'pil@example.test' }, nomail: {},
  });
  const bucket = createFakeBucket();
  const revoked = []; const mails = []; const orgLogs = [];
  const revokeSessions = async uid => revoked.push(uid);
  const cleanup = createAccountCleanup({ db, bucket, auth: authFake, now: () => clock.t, revokeSessions });
  const svc = createDeletionService({
    db, auth: authFake, cleanup, findActiveJourneys, revokeSessions, linkBase: 'https://links.test', now: () => clock.t,
    newToken: () => TOKEN,
    sendEmail: async m => { if (mailFails) throw new Error('SendGrid down'); mails.push(m); },
    writeAuditLog: async (orgId, entry) => orgLogs.push({ orgId, ...entry }),
  });
  const events = () => Object.values(db.dump().deletion_audit || {}).map(e => e.event);
  return { db, auth: authFake, svc, revoked, mails, orgLogs, events, clock, bucket };
}
const fresh = NOW / 1000 - 60;
const stale = NOW / 1000 - 3600;

// ── Account ──────────────────────────────────────────────────────────────────
test('an account request without a recent sign-in or code changes nothing', async () => {
  const f = fixture();
  await assert.rejects(f.svc.requestAccountDeletion({ uid: 'pil', authTime: stale }),
    e => e.code === 'failed-precondition' && e.details.reason === 'reauth-required');
  assert.equal(f.db.dump().account_deletions, undefined);
  assert.deepEqual(f.auth.calls, []);
  assert.deepEqual(f.mails, []);
});
test('an account request deactivates at once: queue with token hash, disabled, sessions revoked, mail and audit', async () => {
  const f = fixture();
  const out = await f.svc.requestAccountDeletion({ uid: 'pil', authTime: fresh, ip: '1.2.3.4' });
  assert.deepEqual(out, { success: true, purge_after: NOW + 30 * DAY });
  assert.equal(GRACE_MS, 30 * DAY);
  const entry = f.db.dump().account_deletions.pil;
  assert.equal(entry.purge_after, NOW + 30 * DAY);
  assert.match(entry.token_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(f.db.dump()).includes(TOKEN), 'the raw token is never stored');
  assert.deepEqual(f.auth.calls.find(c => c[0] === 'update'), ['update', 'pil', { disabled: true }]);
  assert.deepEqual(f.revoked, ['pil']);
  assert.equal(f.mails.length, 1);
  assert.equal(f.mails[0].to, 'pil@example.test');
  assert.ok(f.mails[0].html.includes(`https://links.test/cancelAccountDeletion?uid=pil&amp;token=${TOKEN}`));
  assert.deepEqual(f.events().sort(), ['ACCOUNT_DELETE_MAILED', 'ACCOUNT_DELETE_REQUESTED', 'ACCOUNT_DELETE_REQUESTED']);
  assert.deepEqual(f.orgLogs.map(l => [l.orgId, l.action]), [['org', 'ACCOUNT_DELETE_REQUESTED']]);
  const audit = JSON.stringify(f.db.dump().deletion_audit);
  assert.ok(!audit.includes('1.2.3.4') && !audit.includes('pil@example.test'), 'no address or ip in the audit');
});
test('a verified email code is accepted once as the re-confirmation of a participant', async () => {
  const f = fixture();
  await f.svc.stampEmailCodeVerified('pil');
  await f.svc.requestAccountDeletion({ uid: 'pil', authTime: stale });
  assert.equal(f.db.dump().deletion_reauth, undefined);
  assert.ok(f.db.dump().account_deletions.pil);
  const g = fixture();
  await g.svc.stampEmailCodeVerified('pil');
  g.clock.t += 6 * 60 * 1000;
  await assert.rejects(g.svc.requestAccountDeletion({ uid: 'pil', authTime: stale }), { code: 'failed-precondition' });
});
test('an organisation owner cannot delete their own account and the block is audited', async () => {
  const f = fixture();
  await assert.rejects(f.svc.requestAccountDeletion({ uid: 'owner', claimOrgId: 'org', authTime: fresh }),
    e => e.code === 'failed-precondition' && e.details.reason === 'owns-organization' && e.details.orgId === 'org');
  assert.equal(f.db.dump().orgs.org.metadata.deleted_at, undefined, 'the organisation is not touched');
  assert.deepEqual(f.auth.calls, []);
  assert.deepEqual(f.events(), ['ACCOUNT_DELETE_BLOCKED']);
  assert.equal(f.orgLogs[0].action, 'ACCOUNT_DELETE_BLOCKED');
});
test('the owner check reads the staff record, not only the token claim', async () => {
  const f = fixture();
  await assert.rejects(f.svc.requestAccountDeletion({ uid: 'owner', claimOrgId: null, authTime: fresh }), { code: 'failed-precondition' });
  await f.svc.requestAccountDeletion({ uid: 'c1', claimOrgId: 'org', authTime: fresh });
  assert.ok(f.db.dump().account_deletions.c1);
});
test('if the confirmation mail fails nothing is deactivated', async () => {
  const f = fixture({ mailFails: true });
  await assert.rejects(f.svc.requestAccountDeletion({ uid: 'pil', authTime: fresh }), { code: 'internal' });
  assert.equal(f.db.dump().account_deletions, undefined);
  assert.deepEqual(f.auth.calls, []);
  assert.deepEqual(f.revoked, []);
});
test('a repeated request is a no-op and sends no second mail', async () => {
  const f = fixture();
  await f.svc.requestAccountDeletion({ uid: 'pil', authTime: fresh });
  const again = await f.svc.requestAccountDeletion({ uid: 'pil', authTime: stale });
  assert.equal(again.already_requested, true);
  assert.equal(f.mails.length, 1);
});
test('an account without an email address is still deactivated and the skipped mail is audited', async () => {
  const f = fixture();
  await f.svc.requestAccountDeletion({ uid: 'nomail', authTime: fresh });
  assert.equal(f.mails.length, 0);
  assert.ok(f.events().includes('ACCOUNT_DELETE_MAIL_SKIPPED'));
});
test('cancelling with the mailed token re-enables the account, mails and audits', async () => {
  const f = fixture();
  await f.svc.requestAccountDeletion({ uid: 'pil', authTime: fresh });
  await assert.rejects(f.svc.cancelAccountDeletion({ uid: 'pil', token: 'b'.repeat(64) }), { code: 'not-found' });
  await assert.rejects(f.svc.cancelAccountDeletion({ uid: 'pil', token: 'short' }), { code: 'not-found' });
  assert.equal(await f.svc.isAccountLinkValid('pil', TOKEN), true);
  await f.svc.cancelAccountDeletion({ uid: 'pil', token: TOKEN });
  assert.equal(f.db.dump().account_deletions, undefined);
  assert.deepEqual(f.auth.calls.filter(c => c[0] === 'update').pop(), ['update', 'pil', { disabled: false }]);
  assert.equal(f.mails.length, 2);
  assert.ok(f.events().includes('ACCOUNT_DELETE_CANCELLED'));
  await assert.rejects(f.svc.cancelAccountDeletion({ uid: 'pil', token: TOKEN }), { code: 'not-found' });
});
test('a cancel link no longer works after the 30 days', async () => {
  const f = fixture();
  await f.svc.requestAccountDeletion({ uid: 'pil', authTime: fresh });
  f.clock.t += 31 * DAY;
  assert.equal(await f.svc.isAccountLinkValid('pil', TOKEN), false);
  await assert.rejects(f.svc.cancelAccountDeletion({ uid: 'pil', token: TOKEN }), { code: 'not-found' });
});
test('the purge waits for 30 days, then wipes the account and keeps the legal data', async () => {
  const f = fixture();
  await f.svc.requestAccountDeletion({ uid: 'pil', authTime: fresh });
  f.clock.t += 29 * DAY;
  assert.deepEqual((await f.svc.purgeDueAccounts()).purged, []);
  assert.ok(f.db.dump().users.pil);
  f.clock.t += 2 * DAY;
  const out = await f.svc.purgeDueAccounts();
  assert.deepEqual(out.purged, ['pil']);
  const d = f.db.dump();
  assert.equal(d.users.pil, undefined);
  assert.equal(d.account_deletions, undefined);
  assert.equal(d.trips_active.org.ended.chat.m1.sender_name, 'Deleted user');
  assert.equal(d.orgs.org.payments.p.amount, 5);
  assert.equal(d.orgs.org.metadata.stripe_customer_id, 'cus_1');
  assert.ok(f.auth.calls.some(c => c[0] === 'delete' && c[1] === 'pil'));
  assert.ok(f.events().includes('ACCOUNT_PURGED'));
});
test('the purge job reads at most the batch limit and a failure stays queued', async () => {
  const f = fixture();
  for (const uid of ['pil', 'c1']) {
    await f.db.ref(`account_deletions/${uid}`).set({ purge_after: NOW - DAY, org_id: uid === 'c1' ? 'org' : null });
  }
  const one = await f.svc.purgeDueAccounts({ limit: 1 });
  assert.equal(one.due.length, 1);
  f.auth.deleteUser = async () => { throw new Error('auth down'); };
  const failing = await f.svc.purgeDueAccounts();
  assert.equal(failing.failed.length, 1);
  assert.equal(Object.keys(f.db.dump().account_deletions).length, 1);
});
test('the purge never wipes someone who still owns an organisation', async () => {
  const f = fixture();
  await f.db.ref('account_deletions/owner').set({ purge_after: NOW - DAY, org_id: 'org' });
  const out = await f.svc.purgeDueAccounts();
  assert.deepEqual(out.blocked, ['owner']);
  assert.ok(f.db.dump().users.owner);
  assert.ok(f.events().includes('ACCOUNT_PURGE_BLOCKED'));
});
test('an early purge (GDPR script) skips the waiting period and is audited as such', async () => {
  const f = fixture();
  await f.svc.requestAccountDeletion({ uid: 'pil', authTime: fresh });
  assert.equal((await f.svc.purgeAccount('pil')).status, 'not-due');
  assert.equal((await f.svc.purgeAccount('pil', { force: true, actor: 'dev:abdullah' })).status, 'purged');
  assert.ok(f.events().includes('ACCOUNT_PURGED_EARLY'));
  assert.equal(Object.values(f.db.dump().deletion_audit).find(e => e.event === 'ACCOUNT_PURGED_EARLY').by, 'dev:abdullah');
});

// ── Organisation ─────────────────────────────────────────────────────────────
const org = (f, extra = {}) => f.svc.requestOrganizationDeletion({ uid: 'owner', orgId: 'org', confirmName: 'Al Noor Travel', authTime: fresh, ...extra });
test('only the owner in the staff record may delete the organisation', async () => {
  const f = fixture();
  await assert.rejects(org(f, { uid: 'c1' }), { code: 'permission-denied' });
  await assert.rejects(org(f, { uid: 'pil' }), { code: 'permission-denied' });
  assert.equal(f.db.dump().orgs.org.metadata.deleted_at, undefined);
});
test('the organisation name must be typed in full', async () => {
  const f = fixture();
  await assert.rejects(org(f, { confirmName: undefined }), e => e.details.reason === 'confirm-name-required');
  await assert.rejects(org(f, { confirmName: '  ' }), e => e.details.reason === 'confirm-name-required');
  await assert.rejects(org(f, { confirmName: 'Al Noor' }), e => e.details.reason === 'name-mismatch');
  await assert.rejects(org(f, { confirmName: 'al noor travel' }), e => e.details.reason === 'name-mismatch');
  assert.equal((await org(f, { confirmName: ' Al Noor Travel ' })).success, true);
});
test('organisation deletion needs a recent sign-in', async () => {
  const f = fixture();
  await assert.rejects(org(f, { authTime: stale }), e => e.details.reason === 'reauth-required');
  assert.equal(f.db.dump().org_deletions, undefined);
});
test('active and upcoming journeys block organisation deletion and come back as a list', async () => {
  const f = fixture();
  await f.db.ref('orgs/org/trips/live').set({ title: 'Umrah', status: 'active', start_date: NOW + DAY, end_date: NOW + 9 * DAY });
  await assert.rejects(org(f), e => e.code === 'failed-precondition' && e.details.reason === 'active-journeys' &&
    e.details.journeys.length === 1 && e.details.journeys[0].tripId === 'live' && e.details.journeys[0].title === 'Umrah');
  assert.equal(f.db.dump().org_deletions, undefined);
  assert.deepEqual(f.mails, []);
  assert.deepEqual(f.events(), ['ORG_DELETE_BLOCKED']);
});
test('organisation deletion deactivates at once, queues the purge, revokes members, mails and audits', async () => {
  const f = fixture();
  const out = await org(f, { ip: '9.9.9.9' });
  assert.deepEqual(out, { success: true, purge_after: NOW + 30 * DAY });
  const d = f.db.dump();
  assert.equal(d.orgs.org.metadata.deleted_at, NOW);
  assert.equal(d.orgs.org.metadata.purge_after, NOW + 30 * DAY);
  assert.equal(d.orgs.org.metadata.deleted_by, 'owner');
  assert.equal(d.org_deletions.org.purge_after, NOW + 30 * DAY);
  assert.equal(d.orgs.org.payments.p.amount, 5);
  assert.deepEqual(f.revoked.sort(), ['c1', 'owner', 'pil']);
  assert.equal(f.mails.length, 1);
  assert.equal(f.mails[0].to, 'owner@example.test');
  assert.ok(f.mails[0].html.includes(`restoreOrganizationByLink?org=org&amp;token=${TOKEN}`));
  assert.deepEqual(f.events(), ['ORG_DELETE_REQUESTED', 'ORG_DELETE_MAILED']);
  assert.deepEqual(f.orgLogs.map(l => l.action), ['ORG_DELETE_REQUESTED', 'ORG_DELETE_MAILED']);
  assert.equal((await org(f)).already_requested, true);
  assert.equal(f.mails.length, 1);
});
test('a failing mail leaves the organisation untouched', async () => {
  const f = fixture({ mailFails: true });
  await assert.rejects(org(f), { code: 'internal' });
  assert.equal(f.db.dump().orgs.org.metadata.deleted_at, undefined);
  assert.deepEqual(f.revoked, []);
});
test('the owner restores the organisation in the app and gets a mail', async () => {
  const f = fixture();
  await org(f);
  await assert.rejects(f.svc.restoreOrganization({ orgId: 'org', uid: 'c1' }), { code: 'permission-denied' });
  await f.svc.restoreOrganization({ orgId: 'org', uid: 'owner' });
  const d = f.db.dump();
  assert.equal(d.orgs.org.metadata.deleted_at, undefined);
  assert.equal(d.org_deletions, undefined);
  assert.equal(f.mails.length, 2);
  assert.ok(f.events().includes('ORG_RESTORED'));
  await assert.rejects(f.svc.restoreOrganization({ orgId: 'org', uid: 'owner' }), { code: 'failed-precondition' });
});
test('the mailed link restores only with the right token and only within the 30 days', async () => {
  const f = fixture();
  await org(f);
  assert.equal(await f.svc.isOrganizationLinkValid('org', TOKEN), true);
  assert.equal(await f.svc.isOrganizationLinkValid('org', 'c'.repeat(64)), false);
  await assert.rejects(f.svc.restoreOrganization({ orgId: 'org', token: 'c'.repeat(64) }), { code: 'not-found' });
  await assert.rejects(f.svc.restoreOrganization({ orgId: 'org' }), { code: 'not-found' });
  await f.svc.restoreOrganization({ orgId: 'org', token: TOKEN });
  assert.equal(f.db.dump().orgs.org.metadata.deleted_at, undefined);
  const late = fixture();
  await org(late);
  late.clock.t += 31 * DAY;
  await assert.rejects(late.svc.restoreOrganization({ orgId: 'org', token: TOKEN }), { code: 'failed-precondition' });
});
test('the status tells the app whether the signed-in person owns a deleted organisation', async () => {
  const f = fixture();
  assert.deepEqual(await f.svc.organizationDeletionStatus({ uid: 'owner', orgId: 'org' }), { organization: null });
  await org(f);
  const own = await f.svc.organizationDeletionStatus({ uid: 'owner', orgId: 'org' });
  assert.equal(own.organization.is_owner, true);
  assert.equal(own.organization.name, 'Al Noor Travel');
  assert.equal((await f.svc.organizationDeletionStatus({ uid: 'c1', orgId: 'org' })).organization.is_owner, false);
});
