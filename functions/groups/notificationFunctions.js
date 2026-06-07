// ─── Notification Functions ──────────────────────────────────────────────────
// Handles Realtime Database triggers for push notifications.

const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");
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
        let interruptionLevel = "active";
        let androidChannelId = "default";
        let eventId = null;

        if (data.type === 'emergency') {
            interruptionLevel = "critical";
            androidChannelId = "Safety";
        } else if (data.type === 'chat_message') {
            androidChannelId = "Chat";
            eventId = `chat_${tripId}`; // Deduplicate chat messages per trip
        } else if (data.type === 'alert' || data.type === 'location_request') {
            androidChannelId = "Admin";
            eventId = `alert_${tripId}`;
        }

        const options = {
            tripId,
            interruptionLevel,
            androidChannelId,
            eventId
        };

        await sendPushNotification(uid, title, body, payload, options);
    } catch (error) {
        // Silently fail if notification service logs it
    }
});

/**
 * Triggered when voice channel state changes.
 */
exports.onVoiceChannelUpdated = onValueWritten({
    ref: "trips_active/{orgId}/{tripId}/voice_channel",
    region: "europe-west1"
}, async (event) => {
    const before = event.data.before.val() || {};
    const after = event.data.after.val() || {};
    const { orgId, tripId } = event.params;

    // We need to notify all participants
    const participantsSnap = await db.ref(`trips_participants/${tripId}`).once("value");
    const participants = Object.keys(participantsSnap.val() || {});
    if (participants.length === 0) return;

    const payload = { type: 'voice_channel_update', tripId, orgId };

    // 1. Channel Active State (Silent Push for Live Activities)
    if (before.isChannelActive !== after.isChannelActive) {
        const title = after.isChannelActive ? "Audio Channel Started" : "Audio Channel Ended";
        const options = {
            tripId,
            interruptionLevel: "passive", // Silent push to update Live Activities
            silent: true,
            androidChannelId: "Trip Audio",
            eventId: `voice_state_${tripId}`
        };

        await Promise.all(participants.map(pUid => 
            sendPushNotification(pUid, title, "", payload, options)
        ));
    }

    // 2. Mute All State (Time Sensitive)
    if (before.isAllMuted !== after.isAllMuted) {
        const title = after.isAllMuted ? "Organizer Muted Everyone" : "Mute All Disabled";
        const body = after.isAllMuted ? "You have been muted by the organizer." : "You can now unmute your microphone.";
        const options = {
            tripId,
            interruptionLevel: "time-sensitive",
            androidChannelId: "Trip Audio",
            eventId: `mute_all_${tripId}`
        };

        await Promise.all(participants.map(pUid => 
            sendPushNotification(pUid, title, body, payload, options)
        ));
    }

    // 3. Recording State (Time Sensitive)
    if (before.isRecording !== after.isRecording) {
        const title = after.isRecording ? "Recording Started" : "Recording Stopped";
        const body = after.isRecording ? "This audio channel is now being recorded." : "The recording has ended.";
        const options = {
            tripId,
            interruptionLevel: "time-sensitive",
            androidChannelId: "Trip Audio",
            eventId: `recording_${tripId}`
        };

        await Promise.all(participants.map(pUid => 
            sendPushNotification(pUid, title, body, payload, options)
        ));
    }
});

/**
 * Triggered when a new participant joins a trip.
 */
exports.onParticipantJoined = onValueCreated({
    ref: "trips_participants/{tripId}/{uid}",
    region: "europe-west1"
}, async (event) => {
    const { tripId, uid } = event.params;
    
    try {
        // 1. Fetch user info
        const userSnap = await db.ref(`users/${uid}/full_name`).get();
        const userName = userSnap.val() || "A new participant";

        // 2. We need orgId to find staff. Find orgId from trips_orgs.
        const orgSnap = await db.ref(`trips_orgs/${tripId}`).get();
        if (!orgSnap.exists()) return;
        const orgId = orgSnap.val();

        // 3. Find trip title
        const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}/title`).get();
        const tripTitle = tripSnap.val() || "your trip";

        // 4. Find staff members
        const staffSnap = await db.ref(`orgs/${orgId}/staff`).get();
        const staffList = Object.keys(staffSnap.val() || {});

        const payload = { type: 'participant_joined', tripId, orgId };
        const options = {
            tripId,
            interruptionLevel: 'active',
            androidChannelId: 'Admin',
            eventId: `join_${tripId}` // Deduplicate rapid joins
        };

        // Notify all staff
        await Promise.all(staffList.map(staffUid => 
            sendPushNotification(
                staffUid, 
                "New Participant", 
                `${userName} joined ${tripTitle}.`, 
                payload, 
                options
            )
        ));
    } catch (e) {
        console.error("Error in onParticipantJoined", e);
    }
});
