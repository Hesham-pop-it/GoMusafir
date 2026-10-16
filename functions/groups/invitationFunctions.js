// Phase 4: invite participants by e-mail. Admin and co-host send; managers only read the records (database rules).
// Records: trip_invitations/{tripId}/{id}. Index: orgs/{org}/participants/{uid}. Bounces arrive through the SendGrid webhook.
const { HttpsError, onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { z } = require('zod');
const { onCall } = require('../middleware/participantAccessMiddleware');
const { db } = require('../admin');
const { verifyAppCheck, requireAuth, requireRole } = require('../middleware/appCheckMiddleware');
const { requireOrgStaff } = require('../services/tripSeatService');
const { writeAuditLog } = require('../services/auditService');
const { LANGS } = require('../services/deen/deenParser');

const SENDGRID_WEBHOOK_PUBLIC_KEY = defineSecret('SENDGRID_WEBHOOK_PUBLIC_KEY');
const STAFF = ['admin', 'co-host'];
const ID = z.string().regex(/^[-\w]{1,64}$/);
const previewSchema = z.object({ orgId: ID, tripId: ID, emails: z.array(z.string().max(320)).max(2000).default([]), fromTripId: ID.optional() });
const sendSchema = z.object({ orgId: ID, tripId: ID, emails: z.array(z.string().max(320)).min(1).max(500), lang: z.enum(LANGS) });
const resendSchema = z.object({ orgId: ID, tripId: ID, id: ID });
const backfillSchema = z.object({ orgId: ID });

function parse(schema, data) {
  const result = schema.safeParse(data || {});
  if (!result.success) throw new HttpsError('invalid-argument', result.error.issues[0]?.message || 'Invalid request.');
  return result.data;
}
// The caller must be admin or co-host of the organisation named in the request, by token and by the staff map.
async function staffContext(request, orgId, roles = STAFF) {
  verifyAppCheck(request);
  requireAuth(request);
  requireRole(request, roles);
  if (request.auth.token.orgId !== orgId) throw new HttpsError('permission-denied', 'Organization staff access is required.');
  await requireOrgStaff(orgId, request.auth.uid, roles);
  return request.auth.uid;
}
const svc = () => require('../services/invitations/invitationService');
const mail = () => require('../services/invitations/invitationMail');

function requireOpenTrip(trip) {
  const { tripExpiry } = require('../services/participantAccessService');
  if (!tripExpiry(trip)) throw new HttpsError('failed-precondition', 'This trip has ended or is invalid.');
}
async function inviteCode(trip) {
  const code = trip.invitation_code;
  if (!code || !(await db.ref(`invites/${code}`).get()).exists()) throw new HttpsError('failed-precondition', 'This trip has no active invitation link.');
  return code;
}
async function orgName(orgId) {
  return (await db.ref(`orgs/${orgId}/metadata/name`).get()).val() || '';
}
async function deliver({ orgId, tripId, id, email, lang, trip, code, org }) {
  const { sendEmail } = require('../services/emailService');
  const built = mail().buildInvitationMail({ lang, org, trip, code });
  await sendEmail({ to: email, subject: built.subject, html: built.html, customArgs: { org_id: orgId, trip_id: tripId, invitation_id: id } });
  return built;
}

// -> { ready[], already[], invalid[], members[], seats_after, emails[] }; emails is every address checked (also those of fromTripId)
exports.previewInvitations = onCall({ region: 'europe-west1' }, async request => {
  const input = parse(previewSchema, request.data);
  await staffContext(request, input.orgId);
  const { classify, loadTrip, participantEmails } = svc();
  const trip = await loadTrip(input.orgId, input.tripId);
  let emails = input.emails;
  if (input.fromTripId) {
    await loadTrip(input.orgId, input.fromTripId); // another organisation's trip is never readable
    emails = [...emails, ...await participantEmails(input.fromTripId)];
  }
  if (emails.length > 2000) throw new HttpsError('invalid-argument', 'Too many addresses.');
  return classify({ tripId: input.tripId, trip, emails });
});

// -> { sent, skipped, failed, lang_fallback }
exports.sendInvitations = onCall({ region: 'europe-west1', secrets: ['SENDGRID_API_KEY'], timeoutSeconds: 300 }, async request => {
  const input = parse(sendSchema, request.data);
  const uid = await staffContext(request, input.orgId);
  const { classify, loadTrip, takeMailBudget, createRecord, invitationRef, mapLimit } = svc();
  const trip = await loadTrip(input.orgId, input.tripId);
  requireOpenTrip(trip);
  const code = await inviteCode(trip);
  const check = await classify({ tripId: input.tripId, trip, emails: input.emails });
  if (check.ready.length) await takeMailBudget(input.orgId, check.ready.length);
  const org = await orgName(input.orgId);
  const fallback = mail().buildInvitationMail({ lang: input.lang, org, trip, code }).fallback;
  let sent = 0, failed = 0, raced = 0;
  await mapLimit(check.ready, 10, async email => {
    const now = Date.now();
    const id = await createRecord(input.tripId, email, { lang: input.lang, by: uid }, now);
    if (!id) { raced++; return; }
    try {
      await deliver({ orgId: input.orgId, tripId: input.tripId, id, email, lang: input.lang, trip, code, org });
      sent++;
    } catch (error) {
      failed++;
      console.warn('Invitation mail failed', { tripId: input.tripId, id, message: error.message });
      await invitationRef(input.tripId, id).update({ status: 'bounced', bounced_at: Date.now(), bounce_reason: 'send_failed' });
    }
  });
  await writeAuditLog(input.orgId, { action: 'INVITATIONS_SENT', byUid: uid, targetId: input.tripId, ipAddress: request.rawRequest?.ip,
    extra: { sent, failed, skipped: check.already.length + check.members.length + check.invalid.length + raced, lang: input.lang } });
  return { sent, skipped: check.already.length + check.members.length + check.invalid.length + raced, failed, lang_fallback: fallback };
});

exports.resendInvitation = onCall({ region: 'europe-west1', secrets: ['SENDGRID_API_KEY'] }, async request => {
  const input = parse(resendSchema, request.data);
  const uid = await staffContext(request, input.orgId);
  const { loadTrip, takeMailBudget, invitationRef, RESEND_GAP_MS } = svc();
  const trip = await loadTrip(input.orgId, input.tripId);
  requireOpenTrip(trip);
  const code = await inviteCode(trip);
  const ref = invitationRef(input.tripId, input.id);
  const existing = (await ref.get()).val();
  if (!existing) throw new HttpsError('not-found', 'Invitation not found.');
  if (existing.status === 'joined') throw new HttpsError('failed-precondition', 'This person already joined.');
  await takeMailBudget(input.orgId, 1);
  const now = Date.now();
  // Claim the resend first: two quick clicks send one mail.
  const claim = await ref.transaction(record => {
    if (!record) return record;
    if (record.status === 'joined') return undefined;
    if (now - Math.max(Number(record.resent_at) || 0, Number(record.sent_at) || 0) < RESEND_GAP_MS) return undefined;
    const { bounced_at, bounce_reason, ...rest } = record;
    return { ...rest, status: 'sent', resent_at: now };
  });
  if (!claim.committed || claim.snapshot.val()?.resent_at !== now) {
    throw new HttpsError('resource-exhausted', 'This invitation was sent a moment ago. Try again in a few minutes.');
  }
  try {
    await deliver({ orgId: input.orgId, tripId: input.tripId, id: input.id, email: existing.email, lang: existing.lang || 'en', trip, code, org: await orgName(input.orgId) });
  } catch (error) {
    console.warn('Invitation resend failed', { tripId: input.tripId, id: input.id, message: error.message });
    await ref.update({ status: 'bounced', bounced_at: Date.now(), bounce_reason: 'send_failed' });
    throw new HttpsError('internal', 'The invitation could not be sent.');
  }
  await writeAuditLog(input.orgId, { action: 'INVITATION_RESENT', byUid: uid, targetId: input.tripId, ipAddress: request.rawRequest?.ip, extra: { invitation: input.id } });
  return { resent: true };
});

// Admin only. Builds orgs/{org}/participants from trips_participants for joins that happened before the index existed.
exports.backfillOrgParticipants = onCall({ region: 'europe-west1', timeoutSeconds: 300 }, async request => {
  const input = parse(backfillSchema, request.data);
  const uid = await staffContext(request, input.orgId, ['admin']);
  const result = await svc().backfillParticipants(input.orgId);
  await writeAuditLog(input.orgId, { action: 'ORG_PARTICIPANTS_BACKFILLED', byUid: uid, ipAddress: request.rawRequest?.ip, extra: result });
  return result;
});

const publicKey = () => { try { return SENDGRID_WEBHOOK_PUBLIC_KEY.value(); } catch (_) { return ''; } };
exports.sendgridEventWebhook = onRequest({ region: 'europe-west1', secrets: [SENDGRID_WEBHOOK_PUBLIC_KEY] }, (req, res) =>
  require('../services/invitations/sendgridWebhook').createWebhookHandler({ getPublicKey: publicKey })(req, res));
