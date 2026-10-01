// Rollout: deploy this module, updated Voice endpoints and RTDB rules together.
// Cloud Tasks must be enabled and the runtime must be allowed to enqueue/invoke
// checkTripVoiceAccess. LiveKit must deliver signed room/participant webhooks
// to livekitWebhook. Tasks enforce deadlines; the minute job repairs missed events.
const { onCall } = require('../middleware/participantAccessMiddleware');
const { onValueWritten } = require('firebase-functions/v2/database');
const { onTaskDispatched } = require('firebase-functions/v2/tasks');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getFunctions } = require('firebase-admin/functions');
const { requireTripAccess } = require('../services/participantAccessService');
const { db } = require('../admin');
const { refreshFeatures, accessRef, reconcileSession } = require('../services/tripVoiceService');
const region = 'europe-west1';

exports.getTripFeatureAccess = onCall({ region }, async request => {
  const { tripId } = request.data || {};
  if (typeof tripId !== 'string' || !/^[\w-]+$/.test(tripId)) {
    const { HttpsError } = require('firebase-functions/v2/https');
    throw new HttpsError('invalid-argument', 'Invalid tripId.');
  }
  const { orgId } = await requireTripAccess(request, tripId);
  await reconcileSession(orgId, tripId);
  return (await accessRef(orgId, tripId).get()).val();
});

exports.onTripFeatureDatesChanged = onValueWritten({ region, ref: 'orgs/{orgId}/trips/{tripId}', retry: true }, async event => {
  const before = event.data.before.val(), after = event.data.after.val();
  if (before?.start_date === after?.start_date && before?.end_date === after?.end_date && before?.status === after?.status) return;
  await refreshFeatures(event.params.orgId, event.params.tripId);
});

exports.onTripFeatureAccessChanged = onValueWritten({ region, ref: 'trip_feature_access/{orgId}/{tripId}', retry: true }, async event => {
  const state = event.data.after.val(), before = event.data.before.val();
  if (!state?.nextCheckAt || (state.nextCheckAt === before?.nextCheckAt && state.session?.id === before?.session?.id)) return;
  // Cap scheduling at 28 days; the next task advances toward distant trips.
  await getFunctions().taskQueue(`locations/${region}/functions/checkTripVoiceAccess`).enqueue(
    { ...event.params, dueAt: state.nextCheckAt, sessionId: state.session?.id || null },
    { scheduleDelaySeconds: Math.max(0, Math.min(28 * 86400, Math.ceil((state.nextCheckAt - Date.now()) / 1000))) });
});

exports.checkTripVoiceAccess = onTaskDispatched({ region,
  retryConfig: { maxAttempts: 20, minBackoffSeconds: 1, maxBackoffSeconds: 30 },
}, async request => {
  const { orgId, tripId, dueAt, sessionId } = request.data;
  const state = (await accessRef(orgId, tripId).get()).val();
  if (!state || state.nextCheckAt !== dueAt || (state.session?.id || null) !== sessionId) return;
  if (Date.now() < dueAt) throw new Error('Voice boundary task arrived early');
  await reconcileSession(orgId, tripId);
});

// Recovery for lost/delayed webhooks/tasks, including crashed host devices.
// Also initializes existing trips without resetting historical usage.
exports.reconcileTripVoiceAccess = onSchedule({ region, schedule: 'every 1 minutes', retryCount: 3 }, async () => {
  const mapping = (await db.ref('trips_orgs').get()).val() || {};
  for (const [tripId, orgId] of Object.entries(mapping)) {
    const state = (await accessRef(orgId, tripId).get()).val();
    if (!state || state.nextCheckAt && state.nextCheckAt <= Date.now() || state.session) {
      await reconcileSession(orgId, tripId);
    }
  }
});
