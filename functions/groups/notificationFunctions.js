// ─── Notification Functions ──────────────────────────────────────────────────
// Handles Realtime Database triggers for push notifications.

const { onValueCreated } = require("firebase-functions/v2/database");
const { sendPushNotification } = require("../services/notificationService");
const { db } = require("../admin");

/**
 * Triggered when a new chat message is created.
 * Distributes notifications to all participants.
 */
exports.onChatCreated = onValueCreated({
    ref: "trips_active/{orgId}/{tripId}/chat/{messageId}",
    region: "europe-west1"
}, async (event) => {
    const data = event.data.val();
    const { orgId, tripId } = event.params;
    if (!data || !data.sender_id) return;

    try {
        const participantsSnap = await db.ref(`trips_participants/${tripId}`).once("value");
        const participants = participantsSnap.val() || {};

        const senderName = data.sender_name || "Someone";
        let messageText = data.text;
        
        if (data.type === 'image') messageText = "Sent a photo";
        else if (data.type === 'voice') messageText = "Sent a voice message";
        else if (data.type === 'location') messageText = "Shared a location";
        
        if (!messageText) return;

        const timestamp = Date.now();
        const notificationPromises = Object.keys(participants)
            .filter(pUid => pUid !== data.sender_id)
            .map(pUid => {
                return db.ref(`trips_active/${orgId}/${tripId}/notifications/${pUid}`).push().set({
                    type: "chat_message",
                    message: messageText,
                    name: senderName,
                    timestamp: timestamp,
                });
            });

        await Promise.all(notificationPromises);
    } catch (error) {
        console.log("Error in onChatCreated:", error);
    }
});

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
