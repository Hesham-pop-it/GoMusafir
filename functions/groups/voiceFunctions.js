const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onValueWritten } = require("firebase-functions/v2/database");
const { AccessToken, RoomServiceClient, WebhookReceiver } = require("livekit-server-sdk");
const { db } = require("../admin");

const { sendPushNotification } = require("../services/notificationService");

exports.generateLiveKitToken = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const { tripId } = request.data;
  if (!tripId) throw new HttpsError("invalid-argument", "Missing tripId.");
  const uid = request.auth.uid;
  const username = request.auth.token.name || request.auth.token.email || uid;

  try {
    const orgSnap = await db.ref(`trips_orgs/${tripId}`).once("value");
    const orgId = orgSnap.val();
    if (!orgId) throw new HttpsError("not-found", "Org not found.");

    const isStaffSnap = await db.ref(`orgs/${orgId}/staff/${uid}`).once("value");
    const isStaff = isStaffSnap.exists() && isStaffSnap.val() !== 'none';

    if (!isStaff) {
      const pSnap = await db.ref(`trips_participants/${tripId}/${uid}`).once("value");
      if (!pSnap.exists()) throw new HttpsError("permission-denied", "Not a participant.");
    }

    if (!isStaff) {
      const stateSnap = await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).once("value");
      if (!stateSnap.val()) throw new HttpsError("failed-precondition", "Channel not started.");
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) throw new HttpsError("internal", "Config error.");

    const at = new AccessToken(apiKey, apiSecret, { identity: uid, name: username });
    at.addGrant({ roomJoin: true, room: tripId, canPublish: true, canSubscribe: true });

    if (isStaff) await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).set(true);

    return { token: await at.toJwt(), url: process.env.LIVEKIT_URL };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Token generation failed.");
  }
});

exports.toggleChannelStatus = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  const { tripId, active } = request.data;
  if (!tripId || active === undefined) throw new HttpsError("invalid-argument", "Missing params.");
  const uid = request.auth.uid;

  try {
    const orgSnap = await db.ref(`trips_orgs/${tripId}`).once("value");
    const orgId = orgSnap.val();
    if (!orgId) throw new HttpsError("not-found", "Org not found.");

    // Validate staff permissions securely across staff map, profile, and auth claims
    let isStaff = false;
    const staffSnap = await db.ref(`orgs/${orgId}/staff/${uid}`).once("value");
    if (staffSnap.exists() && staffSnap.val() !== 'none') {
      isStaff = true;
    } else {
      const userSnap = await db.ref(`users/${uid}/staff_org_id`).once("value");
      if (userSnap.val() === orgId) {
        isStaff = true;
      } else {
        const role = request.auth.token?.role;
        if (role === 'admin' || role === 'co-host' || role === 'manager') {
          isStaff = true;
        }
      }
    }

    if (!isStaff) throw new HttpsError("permission-denied", "Admin only.");

    await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).set(active);
    await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).update({
      isChannelStarted: active,
      lastUpdatedBy: uid,
      ...(active ? {} : { activeSpeaker: null })
    });

    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Toggle failed.");
  }
});

exports.onActiveHostsUpdated = onValueWritten({
  ref: "trips_active/{orgId}/{tripId}/voice_channel/active_hosts",
  region: "europe-west1"
}, async (event) => {
  const activeHosts = event.data.after.val() || {};
  const { orgId, tripId } = event.params;

  // Filter to find all active hosts in RTDB
  const activeHostUids = Object.keys(activeHosts).filter(uid => activeHosts[uid] === true);

  if (activeHostUids.length === 0) {
    try {
      const voiceChannelSnap = await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).once("value");
      const voiceChannel = voiceChannelSnap.val() || {};
      if (voiceChannel.isChannelStarted === true) {
        // Wait 4-second grace period for potential background transition or network handover
        await new Promise(resolve => setTimeout(resolve, 4000));

        // Re-read active_hosts in case client re-asserted in RTDB
        const freshHostsSnap = await db.ref(`trips_active/${orgId}/${tripId}/voice_channel/active_hosts`).once("value");
        const freshHosts = freshHostsSnap.val() || {};
        const freshHostUids = Object.keys(freshHosts).filter(uid => freshHosts[uid] === true);
        if (freshHostUids.length > 0) {
          console.log(`Active hosts recovered in RTDB for trip ${tripId}. Preserving channel.`);
          return;
        }

        // Check if any host/staff member is still connected in LiveKit room (e.g. app in background)
        let hostInLiveKit = false;
        try {
          const httpUrl = (process.env.LIVEKIT_URL || '').replace('wss://', 'https://').replace('ws://', 'http://');
          if (httpUrl && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
            const roomService = new RoomServiceClient(httpUrl, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
            const participants = await roomService.listParticipants(tripId).catch(() => []);

            // Check staff members for this org
            const staffSnap = await db.ref(`orgs/${orgId}/staff`).once("value");
            const staffData = staffSnap.val() || {};

            for (const p of participants) {
              if (staffData[p.identity] && staffData[p.identity] !== 'none') {
                hostInLiveKit = true;
                // Re-populate active_hosts in RTDB so RTDB reflects the live background connection
                await db.ref(`trips_active/${orgId}/${tripId}/voice_channel/active_hosts/${p.identity}`).set(true);
                break;
              }
            }
          }
        } catch (lkErr) {
          console.warn(`Error verifying LiveKit participants for trip ${tripId}:`, lkErr.message);
        }

        if (hostInLiveKit) {
          console.log(`Host is still active in LiveKit room for trip ${tripId} (app in background). Preserving channel.`);
          return;
        }

        console.log(`No active hosts left in RTDB or LiveKit for trip ${tripId}. Stopping the channel.`);
        await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).set(false);
        await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).update({
          isChannelStarted: false,
          activeSpeaker: null,
          lastUpdatedBy: "system"
        });
      }
    } catch (error) {
      console.error("Error in onActiveHostsUpdated trigger:", error);
    }
  }
});

exports.livekitWebhook = onRequest({ region: "europe-west1" }, async (req, res) => {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
      return res.status(500).send("LiveKit credentials not configured.");
    }

    const receiver = new WebhookReceiver(apiKey, apiSecret);
    const authHeader = req.get("Authorization");
    const event = await receiver.receive(req.rawBody, authHeader);

    if (event.event === "participant_left" || event.event === "room_finished") {
      const tripId = event.room?.name;
      if (!tripId) return res.status(200).send("No room name.");

      const orgSnap = await db.ref(`trips_orgs/${tripId}`).once("value");
      const orgId = orgSnap.val();
      if (!orgId) return res.status(200).send("Org not found.");

      const httpUrl = (process.env.LIVEKIT_URL || '').replace('wss://', 'https://').replace('ws://', 'http://');
      const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
      const participants = await roomService.listParticipants(tripId).catch(() => []);

      const staffSnap = await db.ref(`orgs/${orgId}/staff`).once("value");
      const staffData = staffSnap.val() || {};

      const hasHostRemaining = participants.some(p => staffData[p.identity] && staffData[p.identity] !== 'none');

      if (!hasHostRemaining) {
        console.log(`LiveKit webhook: No staff left in room ${tripId}. Stopping channel.`);
        await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).set(false);
        await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).update({
          isChannelStarted: false,
          activeSpeaker: null,
          lastUpdatedBy: "system"
        });
        await db.ref(`trips_active/${orgId}/${tripId}/voice_channel/active_hosts`).set(null);
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("LiveKit webhook error:", err);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
});

