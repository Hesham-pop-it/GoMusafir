// ─── Notification Functions ──────────────────────────────────────────────────
// Handles Realtime Database triggers for push notifications.

const { onValueCreated } = require("firebase-functions/v2/database");
const { sendPushNotification } = require("../services/notificationService");

/**
 * Triggered when a new notification entry is created for a user in a trip.
 * Path: trips_active/{orgId}/{tripId}/notifications/{uid}/{notifId}
 */
exports.onNotificationCreated = onValueCreated({
    ref: "trips_active/{orgId}/{tripId}/notifications/{uid}/{notifId}",
    region: "europe-west1"
}, async (event) => {
    const data = event.data.val();
    const { uid, tripId, orgId } = event.params;

    // Only proceed if there's a message to send
    if (!data || !data.message) return;

    // S22: Logic to determine push notification content
    const title = data.name ? `${data.name} (GoMusafir)` : "GoMusafir Update";
    const body = data.message;
    
    // Optional data payload for deep-linking in the app
    const payload = {
        type: data.type || "alert",
        tripId: tripId,
        orgId: orgId,
        timestamp: String(data.timestamp || Date.now())
    };

    try {
        await sendPushNotification(uid, title, body, payload);
    } catch (error) {
        // Silently fail if notification service logs it
    }
});
