const { requireTripAccess } = require('../services/participantAccessService');
const { onCall: firebaseOnCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onCall } = require("../middleware/participantAccessMiddleware");
const { onValueWritten } = require("firebase-functions/v2/database");
const { AccessToken, WebhookReceiver } = require("livekit-server-sdk");
const { db } = require("../admin");


const { reserveSession, stopSession, stopIfNoHosts, handleRoomEvent } = require('../services/tripVoiceService');

// requireTripAccess below includes the full identity/app-access checks. Using
// Firebase's callable directly avoids running those checks twice for this call.
exports.generateLiveKitToken = firebaseOnCall({ region: "europe-west1", timeoutSeconds: 45 }, async request => {
  const { tripId } = request.data || {};
  if (typeof tripId !== 'string' || !/^[\w-]+$/.test(tripId)) throw new HttpsError('invalid-argument', 'Invalid tripId.');
  const { orgId, staff } = await requireTripAccess(request, tripId);
  const apiKey = process.env.LIVEKIT_API_KEY, apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret || !process.env.LIVEKIT_URL) throw new HttpsError('internal', 'Voice configuration unavailable.');
  let state;
  try {
    state = await reserveSession(orgId, tripId, staff, request.auth.uid);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Voice session preparation failed', { tripId, code: error.code, name: error.name, message: error.message });
    throw new HttpsError('unavailable', 'The Voice service could not prepare this session. Please try again shortly.');
  }
  const ttl = Math.max(1, Math.min(60, Math.floor((state.tripEndsAt - Date.now()) / 1000),
    state.voiceAccess === 'PRE_TRIP_LIMITED' ? Math.ceil(state.preTripVoiceRemainingSeconds) : 60));
  const token = new AccessToken(apiKey, apiSecret, { identity: request.auth.uid,
    name: "Participant", ttl });
  token.addGrant({ roomJoin: true, room: state.session.roomName, canPublish: false, canSubscribe: true,
    canPublishData: true, canUpdateOwnMetadata: false });
  return { token: await token.toJwt(), url: process.env.LIVEKIT_URL, featureAccess: state };
});

exports.toggleChannelStatus = onCall({ region: "europe-west1" }, async request => {
  const { tripId, active } = request.data || {};
  if (typeof tripId !== 'string' || !/^[\w-]+$/.test(tripId) || typeof active !== 'boolean') throw new HttpsError('invalid-argument', 'Invalid parameters.');
  const { orgId, staff } = await requireTripAccess(request, tripId);
  if (!staff) throw new HttpsError('permission-denied', 'Host access required.');
  // Starting reserves a session only. LiveKit media connection starts the clock.
  if (active) await reserveSession(orgId, tripId, true, request.auth.uid);
  else await stopSession(orgId, tripId);
  return { success: true };
});

exports.onActiveHostsUpdated = onValueWritten({
  ref: 'trips_active/{orgId}/{tripId}/voice_channel/active_hosts', region: 'europe-west1', retry: true,
}, async event => {
  if (Object.values(event.data.after.val() || {}).some(value => value === true)) return;
  await new Promise(resolve => setTimeout(resolve, 4000));
  // Only LiveKit can confirm a host has left; a phone network error cannot.
  await stopIfNoHosts(event.params.orgId, event.params.tripId);
});

exports.livekitWebhook = onRequest({ region: 'europe-west1' }, async (req, res) => {
  let event;
  try {
    const receiver = new WebhookReceiver(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
    event = await receiver.receive(req.rawBody.toString('utf8'), req.get('Authorization'));
  } catch (error) {
    return res.status(401).send('Invalid webhook signature.');
  }
  try {
    await handleRoomEvent(event);
    if (['participant_joined', 'participant_left', 'track_published'].includes(event.event)) {
      const mapping = (await db.ref(`voice_rooms/${event.room?.name}`).get()).val();
      if (mapping) {
        const { updateSpeakers } = require('../services/voiceSpeakerService');
        await updateSpeakers(mapping.orgId, mapping.tripId, { roomName: event.room.name });
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Voice webhook processing failed:', error);
    return res.status(500).send('Retry webhook.');
  }
});
