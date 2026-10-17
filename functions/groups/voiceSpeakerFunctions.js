const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onValueWritten } = require('firebase-functions/v2/database');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { requireTripAccess } = require('../services/participantAccessService');
const { updateSpeakers } = require('../services/voiceSpeakerService');
const { db } = require('../admin');
const region = 'europe-west1';
const validKey = value => typeof value === 'string' && /^[\w-]{1,256}$/.test(value);

exports.updateVoiceSpeaker = onCall({ region, timeoutSeconds: 60 }, async request => {
  const { tripId, action, roomName, participantSid, requestId, targetUid } = request.data || {};
  if (!validKey(tripId) || !validKey(roomName) ||
      !['request', 'release', 'grant', 'revoke'].includes(action) ||
      (['request', 'release'].includes(action) && !validKey(requestId)) ||
      (action === 'request' && !validKey(participantSid)) ||
      (['grant', 'revoke'].includes(action) && !validKey(targetUid))) {
    throw new HttpsError('invalid-argument', 'Invalid speaker request.');
  }
  const { orgId, staff } = await requireTripAccess(request, tripId);
  if (['grant', 'revoke'].includes(action) && !staff) throw new HttpsError('permission-denied', 'Organizer access required.');
  await updateSpeakers(orgId, tripId, { action, roomName, participantSid, requestId, targetUid, uid: request.auth.uid });
  return { success: true };
});

exports.onVoiceGlobalMuteChanged = onValueWritten({ region, timeoutSeconds: 60, retry: true,
  ref: 'trips_active/{orgId}/{tripId}/voice_channel/isAllMuted',
}, async event => {
  if (event.data.after.val() === event.data.before.val()) return;
  await updateSpeakers(event.params.orgId, event.params.tripId);
});

// Repair interrupted grants and missed disconnect/mute webhooks.
exports.reconcileVoiceSpeakers = onSchedule({ region, schedule: 'every 1 minutes', retryCount: 3 }, async () => {
  const rooms = (await db.ref('voice_speakers').get()).val() || {};
  for (const [orgId, trips] of Object.entries(rooms)) {
    for (const tripId of Object.keys(trips)) {
      try { await updateSpeakers(orgId, tripId); }
      catch (error) { console.warn('Speaker reconciliation deferred', { orgId, tripId, code: error.code }); }
    }
  }
});
