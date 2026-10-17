// ─── Notification Functions ──────────────────────────────────────────────────
// Handles Realtime Database triggers for push notifications.

const { onValueCreated, onValueWritten } = require("firebase-functions/v2/database");
const { sendPushNotification } = require("../services/notificationService");
const { admin, db } = require("../admin");
const { decrypt } = require("../services/kmsService");
const { isInVoice } = require("../services/voicePresenceService");

/**
 * Triggered when a new chat message is created.
 * Distributes push notifications directly to all participants and staff members.
 */
exports.onChatCreated = onValueCreated({
    ref: "trips_active/{orgId}/{tripId}/chat/{messageId}",
    region: "europe-west1"
}, async (event) => {
    const data = event.data.val();
    const { orgId, tripId } = event.params;
    if (!data || !data.sender_id) return;
    // System lines (voice started/ended) are shown in the chat but never pushed.
    if (data.type === 'system') return;

    try {
        // Fetch both participants and organization staff to notify everyone in the trip
        const [participantsSnap, staffSnap] = await Promise.all([
            db.ref(`trips_participants/${tripId}`).once("value"),
            db.ref(`orgs/${orgId}/staff`).once("value")
        ]);

        const pVal = participantsSnap.val() || {};
        const participantUids = Array.isArray(pVal) ? pVal.filter(Boolean) : Object.keys(pVal);
        const sVal = staffSnap.val() || {};
        const staffUids = Array.isArray(sVal) ? sVal.filter(Boolean) : Object.keys(sVal);

        const allRecipientUids = Array.from(new Set([...participantUids, ...staffUids]))
            .filter(uid => typeof uid === 'string' && uid.length > 0 && uid !== data.sender_id);

        if (allRecipientUids.length === 0) return;

        const senderName = data.sender_name || "Someone";
        let messageText = data.text;
        
        if (!messageText) {
            if (data.type === 'image') messageText = "📷 Sent a photo";
            else if (data.type === 'voice') messageText = "🎤 Sent a voice message";
            else if (data.type === 'video') messageText = "🎬 Sent a video";
            else if (data.type === 'location') messageText = "📍 Shared a location";
            else if (data.type === 'file' || data.type === 'document') messageText = "📎 Sent an attachment";
            else messageText = "Sent a message";
        }

        const timestamp = Date.now();
        const title = senderName;
        const body = messageText;

        const payload = {
            type: "chat_message",
            tripId: tripId || "",
            orgId: orgId || "",
            timestamp: String(timestamp),
            name: String(senderName),
            senderUid: String(data.sender_id || ""),
            senderImage: String(data.avatar || ""),
            message: String(messageText)
        };

        const options = {
            tripId,
            interruptionLevel: "active",
            androidChannelId: "Chat",
            eventId: null, // Chat notifications must not be debounced or silenced
            skipDbSave: true
        };

        // 1. Dispatch push notification to all recipients directly
        const pushPromises = allRecipientUids.map(async recipientUid => {
            // Quiet (no sound) while the recipient is in the voice channel.
            const quiet = await isInVoice(orgId, tripId, recipientUid);
            return sendPushNotification(recipientUid, title, body, payload, quiet ? { ...options, quiet: true } : options);
        });

        // 2. Also log in trip-level notifications for in-trip history
        const tripNotifPromises = allRecipientUids.map(pUid =>
            db.ref(`trips_active/${orgId}/${tripId}/notifications/${pUid}`).push().set({
                type: "chat_message",
                title: title,
                message: messageText,
                name: senderName,
                senderUid: data.sender_id,
                tripId,
                orgId,
                timestamp: timestamp,
                read: false,
                seen: false
            })
        );

        await Promise.all([...pushPromises, ...tripNotifPromises]);
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

    // Only proceed if there's real notification data to notify
    if (!data) return;

    // CRITICAL FIX: Ignore updates/nodes that only mark read/seen or have no valid payload
    if (data.read === true && !data.message && !data.title) return;
    if (!data.type && !data.message && !data.title) return;

    // Never notify the sender about their own action
    if (data.senderUid && data.senderUid === uid) return;

    // Chat messages are dispatched directly by onChatCreated for real-time delivery
    if (data.type === 'chat_message') return;

    // Messaging types are pushed directly by the messaging functions; these items only feed the in-app list
    if (['dm_request', 'dm_message', 'team_message', 'staff_chat', 'message_report'].includes(data.type)) return;

    // S22: Logic to determine push notification content
    let title = data.title || (data.name ? `${data.name} (GoMusafir)` : "GoMusafir Update");
    let body = data.message || "You have a new update.";
    
    if (data.type === 'emergency') {
        const senderName = data.name || "A Participant";
        title = "EMERGENCY ALERT";
        body = data.message ? `${senderName} ${data.message}` : `${senderName} needs immediate assistance!`;
    } else if (data.type === 'location_request') {
        const senderName = data.name || "A Participant";
        title = "Location Request";
        body = data.message || `${senderName} is asking for your live location.`;
    }

    // Comprehensive data payload for deep-linking and state sync across iOS and Android
    const payload = {
        type: data.type || "alert",
        tripId: tripId || "",
        orgId: orgId || "",
        timestamp: String(data.timestamp || Date.now()),
        name: String(data.name || ""),
        senderUid: String(data.senderUid || ""),
        senderImage: String(data.senderImage || ""),
        latitude: String(data.latitude || data.lat || ""),
        longitude: String(data.longitude || data.lng || ""),
        lat: String(data.lat || data.latitude || ""),
        lng: String(data.lng || data.longitude || "")
    };

    try {
        let interruptionLevel = "active";
        let androidChannelId = "default";
        let eventId = null;

        if (data.type === 'emergency') {
            // Use time-sensitive for iOS APNs delivery so alerts are received immediately without requiring restricted Apple critical-alert entitlements
            interruptionLevel = "time-sensitive";
            androidChannelId = "Safety";
            eventId = null; // Never debounce emergency/SOS triggers
        } else if (data.type === 'location_request') {
            androidChannelId = "Admin";
            eventId = `loc_req_${tripId}_${data.senderUid || ''}`;
        } else if (data.type === 'alert' || data.type === 'seat_update') {
            androidChannelId = "Admin";
            eventId = `admin_${tripId}_${Math.floor((data.timestamp || Date.now()) / 15000)}`;
        } else if (
            data.type === 'voice_started' || 
            data.type === 'voice_ended' || 
            data.type === 'voice_mute_all' || 
            data.type === 'voice_unmute_all' || 
            data.type === 'voice_muted' || 
            data.type === 'voice_unmuted' || 
            data.type === 'voice_recording_started' || 
            data.type === 'voice_recording_stopped' || 
            data.type === 'voice_channel_update'
        ) {
            interruptionLevel = "time-sensitive";
            androidChannelId = "Trip Audio";
            eventId = `${data.type}_${tripId}_${Math.floor((data.timestamp || Date.now()) / 20000)}`;
        }

        const options = {
            tripId,
            interruptionLevel,
            androidChannelId,
            eventId,
            skipDbSave: true
        };

        await sendPushNotification(uid, title, body, payload, options);
    } catch (error) {
        // Silently fail if notification service logs it
    }
});

// First name of whoever started voice, same field fallbacks as the messaging functions.
async function voiceStarterName(uid) {
    if (!uid || uid === 'system') return '';
    const user = (await db.ref(`users/${uid}`).once("value")).val() || {};
    let encrypted = {};
    if (user.p_profile) {
        try { encrypted = JSON.parse(decrypt(user.p_profile)) || {}; } catch (_) { /* fall back to plain fields */ }
    }
    const profile = user.profile || {};
    const pick = (...values) => values.find(v => typeof v === 'string' && v.trim() && v.trim() !== '***') || '';
    const first = pick(encrypted.firstName, profile.firstName, profile.first_name, user.first_name);
    const last = pick(encrypted.lastName, profile.lastName, profile.last_name, user.last_name);
    return `${first} ${last}`.trim();
}

// Writes the group chat line for a real voice start/end. The key is deterministic per
// session, so a repeated delivery finds the line and writes nothing.
async function writeVoiceChatLine({ orgId, tripId, eventId, started, before, after }) {
    const source = started ? after : before;
    const sessionKey = String(source.sessionRequestedAt || source.sessionId || eventId).replace(/[.$#\[\]\/]/g, '_');
    const line = db.ref(`trips_active/${orgId}/${tripId}/chat/voice_${started ? 'start' : 'end'}_${sessionKey}`);
    if ((await line.once("value")).exists()) return;
    let text;
    if (started) {
        const name = await voiceStarterName(after.lastUpdatedBy || after.updatedBy);
        text = name ? `Voice chat started by ${name}` : 'Voice chat started';
    } else {
        const startedAt = Number(before.sessionRequestedAt);
        const minutes = startedAt > 0 ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : 0;
        text = minutes ? `Voice chat ended \u00b7 ${minutes} min` : 'Voice chat ended';
    }
    await line.set({ type: 'system', sender_id: 'system', sender_name: 'GoMusafir', text,
        timestamp: admin.database.ServerValue.TIMESTAMP });
}

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

    // Group chat system line on a real start/end, independent of who gets notified below.
    const wasStarted = before.isChannelStarted === true || before.isChannelActive === true;
    const isStarted = after.isChannelStarted === true || after.isChannelActive === true;
    if (wasStarted !== isStarted) {
        try { await writeVoiceChatLine({ orgId, tripId, eventId: event.id, started: isStarted, before, after }); }
        catch (e) { console.error("Voice chat line failed:", e); }
    }
    const beforeStarted = before.isChannelStarted === true || before.isChannelActive === true;
    const afterStarted = after.isChannelStarted === true || after.isChannelActive === true;
    const startChanged = beforeStarted !== afterStarted;
    const muteChanged = before.isAllMuted !== after.isAllMuted && after.isAllMuted !== undefined;
    const recordingChanged = before.isRecording !== after.isRecording && after.isRecording !== undefined;

    // Other voice_channel writes (participant state, heartbeats) notify nobody, so skip the reads below.
    if (!startChanged && !muteChanged && !recordingChanged) return;

    // Fetch both participants and staff members to ensure all relevant users are notified
    const [participantsSnap, staffSnap] = await Promise.all([
        db.ref(`trips_participants/${tripId}`).once("value"),
        db.ref(`orgs/${orgId}/staff`).once("value")
    ]);

    const participantUids = Object.keys(participantsSnap.val() || {});
    const staffUids = Object.keys(staffSnap.val() || {});
    const allRecipientUids = Array.from(new Set([...participantUids, ...staffUids]));

    if (allRecipientUids.length === 0) return;

    let tripTitle = "Your Trip";
    try {
        const tripSnap = await db.ref(`orgs/${orgId}/trips/${tripId}/title`).once("value");
        if (tripSnap.exists() && tripSnap.val()) {
            tripTitle = tripSnap.val();
        }
    } catch (e) {}

    const initiatorUid = after.lastUpdatedBy || after.updatedBy || null;
    const recipients = (initiatorUid && initiatorUid !== 'system')
        ? allRecipientUids.filter(pUid => pUid !== initiatorUid)
        : allRecipientUids;

    if (recipients.length === 0) return;

    // Helper to distribute in-app notifications to all recipients.
    // Writing to trips_active/.../notifications triggers onNotificationCreated to dispatch push notifications.
    const distributeNotification = async (notifType, title, message) => {
        const timestamp = Date.now();
        const promises = recipients.map(pUid =>
            db.ref(`trips_active/${orgId}/${tripId}/notifications/${pUid}`).push().set({
                type: notifType,
                title: title,
                message: message,
                name: "Voice Chat",
                senderUid: initiatorUid,
                tripId,
                orgId,
                timestamp: timestamp,
                read: false,
                seen: false
            })
        );
        await Promise.all(promises);
    };

    // 1. Channel Start / End State
    if (startChanged) {
        const isStarted = afterStarted === true;
        const title = isStarted ? "Voice Chat Started" : "Voice Chat Ended";
        const body = isStarted
            ? `Live voice channel started for ${tripTitle}. Tap to join!`
            : `Live voice channel for ${tripTitle} has ended.`;
        const notifType = isStarted ? "voice_started" : "voice_ended";
        await distributeNotification(notifType, title, body);
    }

    // 2. Mute All State (Time Sensitive)
    if (muteChanged) {
        const isMutedAll = after.isAllMuted === true;
        const title = isMutedAll ? "Organizer Muted Everyone" : "Mute All Disabled";
        const body = isMutedAll ? "You have been muted by the organizer." : "You can now unmute your microphone.";
        const notifType = isMutedAll ? "voice_mute_all" : "voice_unmute_all";
        await distributeNotification(notifType, title, body);
    }

    // 3. Recording State (Time Sensitive)
    if (recordingChanged) {
        const isRecording = after.isRecording === true;
        const title = isRecording ? "Recording Started" : "Recording Stopped";
        const body = isRecording ? "This audio channel is now being recorded." : "The recording has ended.";
        const notifType = isRecording ? "voice_recording_started" : "voice_recording_stopped";
        await distributeNotification(notifType, title, body);
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

/**
 * Triggered when a trip's seat capacity is updated or initialized.
 * Sends notifications to all relevant Admin, Co-host, and Manager staff.
 */
exports.onTripSeatsUpdated = onValueWritten({
    ref: "orgs/{orgId}/trips/{tripId}/total_seats",
    region: "europe-west1"
}, async (event) => {
    const beforeVal = event.data.before.val();
    const afterVal = event.data.after.val();
    const { orgId, tripId } = event.params;

    // Skip if deleted or value didn't actually change
    if (afterVal === null || afterVal === undefined || beforeVal === afterVal) return;

    try {
        // Fetch trip title and staff members
        const [tripSnap, staffSnap] = await Promise.all([
            db.ref(`orgs/${orgId}/trips/${tripId}/title`).once("value"),
            db.ref(`orgs/${orgId}/staff`).once("value")
        ]);

        const tripTitle = tripSnap.val() || "Your Trip";
        const staffObj = staffSnap.val() || {};

        // Filter relevant staff roles: Admin, Co-host, and Manager
        const relevantStaffUids = Object.keys(staffObj).filter(sUid => {
            const role = typeof staffObj[sUid] === "string" ? staffObj[sUid] : staffObj[sUid]?.role;
            if (!role) return true;
            const normalized = role.toLowerCase().trim();
            return ["admin", "co-host", "cohost", "manager"].includes(normalized);
        });

        if (relevantStaffUids.length === 0) return;

        const timestamp = Date.now();
        const beforeNum = Number(beforeVal) || 0;
        const afterNum = Number(afterVal) || 0;
        const diff = afterNum - beforeNum;

        let messageText = "";
        if (beforeVal === null) {
            messageText = `Seat capacity for "${tripTitle}" is set to ${afterNum} seats.`;
        } else if (diff > 0) {
            messageText = `Seat capacity for "${tripTitle}" increased by ${diff} seats (Total: ${afterNum} seats).`;
        } else if (diff < 0) {
            messageText = `Seat capacity for "${tripTitle}" updated to ${afterNum} seats.`;
        } else {
            messageText = `Seat capacity for "${tripTitle}" updated to ${afterNum} seats.`;
        }

        const title = "Seat Update";

        // Distribute in-app notifications under trips_active and users/{staffUid}/notifications
        const notificationPromises = relevantStaffUids.map(staffUid =>
            Promise.all([
                db.ref(`trips_active/${orgId}/${tripId}/notifications/${staffUid}`).push().set({
                    type: "seat_update",
                    title: title,
                    message: messageText,
                    name: "Seat Update",
                    tripId,
                    orgId,
                    timestamp: timestamp,
                    read: false,
                    seen: false,
                    totalSeats: afterNum,
                    previousSeats: beforeNum,
                    diff: diff
                }),
                db.ref(`users/${staffUid}/notifications`).push().set({
                    type: "seat_update",
                    title: title,
                    message: messageText,
                    tripId,
                    orgId,
                    timestamp: timestamp,
                    read: false,
                    seen: false,
                    totalSeats: afterNum,
                    previousSeats: beforeNum,
                    diff: diff
                })
            ])
        );

        await Promise.all(notificationPromises);
    } catch (error) {
        console.error("Error in onTripSeatsUpdated:", error);
    }
});

/**
 * Triggered when an organization's prepaid seats balance is updated.
 * Sends notifications to all relevant Admin, Co-host, and Manager staff.
 */
exports.onPrepaidSeatsUpdated = onValueWritten({
    ref: "orgs/{orgId}/prepaid_seats",
    region: "europe-west1"
}, async (event) => {
    const beforeVal = event.data.before.val();
    const afterVal = event.data.after.val();
    const { orgId } = event.params;

    // Skip if deleted or value didn't change
    if (afterVal === null || afterVal === undefined || beforeVal === afterVal) return;

    try {
        const staffSnap = await db.ref(`orgs/${orgId}/staff`).once("value");
        const staffObj = staffSnap.val() || {};

        // Filter relevant staff roles: Admin, Co-host, and Manager
        const relevantStaffUids = Object.keys(staffObj).filter(sUid => {
            const role = typeof staffObj[sUid] === "string" ? staffObj[sUid] : staffObj[sUid]?.role;
            if (!role) return true;
            const normalized = role.toLowerCase().trim();
            return ["admin", "co-host", "cohost", "manager"].includes(normalized);
        });

        if (relevantStaffUids.length === 0) return;

        const beforeNum = Number(beforeVal) || 0;
        const afterNum = Number(afterVal) || 0;
        const diff = afterNum - beforeNum;

        let messageText = "";
        let title = "Prepaid Seats Update";

        if (diff > 0) {
            messageText = `${diff} seat${diff > 1 ? "s" : ""} added to your organisation prepaid balance. (Total available: ${afterNum} seats).`;
        } else {
            const used = Math.abs(diff);
            title = "Prepaid Seats Allocated";
            messageText = `${used} prepaid seat${used > 1 ? "s" : ""} allocated to a journey. (Remaining balance: ${afterNum} seats).`;
        }

        const payload = {
            type: "seat_update",
            orgId,
            prepaidSeats: String(afterNum),
            diff: String(diff),
            timestamp: String(Date.now())
        };

        const options = {
            interruptionLevel: "active",
            androidChannelId: "Admin",
            eventId: `prepaid_seats_${orgId}_${Math.floor(Date.now() / 15000)}`
        };

        // Notify all relevant staff via sendPushNotification (which also writes to users/{uid}/notifications)
        await Promise.all(
            relevantStaffUids.map(staffUid =>
                sendPushNotification(staffUid, title, messageText, payload, options)
            )
        );
    } catch (error) {
        console.error("Error in onPrepaidSeatsUpdated:", error);
    }
});

