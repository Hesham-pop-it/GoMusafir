const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onValueWritten } = require("firebase-functions/v2/database");
const { AccessToken } = require("livekit-server-sdk");
const { db } = require("../admin");

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

    const userSnap = await db.ref(`users/${uid}/staff_org_id`).once("value");
    if (userSnap.val() !== orgId) throw new HttpsError("permission-denied", "Admin only.");

    await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).set(active);

    if (active) {
      try {
        const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}/title`).once("value");
        const tripTitle = tripSnap.val() || "Your Trip";
        const participantsSnap = await db.ref(`trips_participants/${tripId}`).once("value");
        const participants = participantsSnap.val() || {};
        const timestamp = Date.now();
        const notificationPromises = Object.keys(participants).filter(pUid => pUid !== uid).map(pUid => {
          return db.ref(`trips_active/${orgId}/${tripId}/notifications/${pUid}`).push().set({
            type: "voice_started",
            message: `Live voice channel started for ${tripTitle}. Tap to join!`,
            name: "Voice Chat",
            timestamp: timestamp,
          });
        });
        await Promise.all(notificationPromises);
      } catch (e) { console.log("Notification error:", e); }
    }
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

  // Filter to find all active hosts
  const activeHostUids = Object.keys(activeHosts).filter(uid => activeHosts[uid] === true);

  if (activeHostUids.length === 0) {
    try {
      const voiceChannelSnap = await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).once("value");
      const voiceChannel = voiceChannelSnap.val() || {};
      if (voiceChannel.isChannelStarted === true) {
        console.log(`No active hosts left in trip ${tripId}. Stopping the channel.`);
        await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).set(false);
        await db.ref(`trips_active/${orgId}/${tripId}/voice_channel`).update({
          isChannelStarted: false
        });
      }
    } catch (error) {
      console.error("Error in onActiveHostsUpdated trigger:", error);
    }
  }
});

