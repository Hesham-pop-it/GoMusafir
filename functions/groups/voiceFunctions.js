const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { AccessToken } = require("livekit-server-sdk");
const { db } = require("../admin");

/**
 * Generates a LiveKit Access Token for a specific user and trip (room).
 * Requires the user to be authenticated and part of the trip.
 * Only allows participants to join if the admin has started the channel.
 */
exports.generateLiveKitToken = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const { tripId } = request.data;
  if (!tripId) {
    throw new HttpsError("invalid-argument", "Missing tripId parameter.");
  }

  const uid = request.auth.uid;
  const username = request.auth.token.name || request.auth.token.email || uid;

  try {
    // 1. Get Org ID for this trip
    const orgSnap = await db.ref(`trips_orgs/${tripId}`).once("value");
    const orgId = orgSnap.val();
    if (!orgId) throw new HttpsError("not-found", "Trip organization not found.");

    // 2. Authorization Check (Verify user is in the trip_participants)
    const participantSnapshot = await db.ref(`trips_participants/${tripId}/${uid}`).once("value");
    if (!participantSnapshot.exists()) {
      throw new HttpsError("permission-denied", "You are not a participant of this trip.");
    }

    // 3. Admin Check
    const userSnap = await db.ref(`users/${uid}`).once("value");
    const userData = userSnap.val() || {};
    const isAdmin = userData.staff_org_id === orgId; // Business/Admin verification

    // 4. Channel Activity Check (Internal Restriction)
    if (!isAdmin) {
      const stateSnap = await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).once("value");
      if (!stateSnap.val()) {
        throw new HttpsError("failed-precondition", "The channel has not been started by the organizer yet.");
      }
    }

    // 5. Generate Token
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new HttpsError("internal", "LiveKit server is not properly configured.");
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: uid,
      name: username,
    });

    at.addGrant({
      roomJoin: true,
      room: tripId,
      canPublish: true,
      canSubscribe: true,
    });

    // If admin is joining, we ensure is_active is true just in case
    if (isAdmin) {
      await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).set(true);
    }

    return {
      token: await at.toJwt(),
      url: process.env.LIVEKIT_URL,
    };
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to generate voice chat token.");
  }
});

/**
 * Toggles the channel active status. Admin only.
 */
exports.toggleChannelStatus = onCall({ region: "europe-west1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
  
  const { tripId, active } = request.data;
  if (!tripId || active === undefined) throw new HttpsError("invalid-argument", "Missing parameters.");

  const uid = request.auth.uid;

  try {
    const orgSnap = await db.ref(`trips_orgs/${tripId}`).once("value");
    const orgId = orgSnap.val();
    if (!orgId) throw new HttpsError("not-found", "Trip organization not found.");

    const userSnap = await db.ref(`users/${uid}/staff_org_id`).once("value");
    if (userSnap.val() !== orgId) {
      throw new HttpsError("permission-denied", "Only organizational admins can toggle channel status.");
    }

    await db.ref(`orgs/${orgId}/trips/${tripId}/voice_state/is_active`).set(active);
    return { success: true };
  } catch (error) {
    console.error("Toggle Status Error:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to update channel status.");
  }
});
