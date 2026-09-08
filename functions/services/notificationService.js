const { admin, db } = require("../admin");

/**
 * Sends a push notification to a specific user via FCM.
 * @param {string} uid - The target user's UID.
 * @param {string} title - The notification title (ignored if silent).
 * @param {string} body - The notification body (ignored if silent).
 * @param {object} data - Optional data payload (deep links: tripId, tab, role).
 * @param {object} options - Advanced delivery rules.
 */
async function sendPushNotification(uid, title, body, data = {}, options = {}) {
    try {
        const {
            androidChannelId = "default",
            interruptionLevel = "active", // 'active', 'time-sensitive', 'passive', 'critical'
            silent = false,
            tripId = null,
            eventId = null, // for deduplication (e.g. 'chat_trip123')
        } = options;

        // 1. Fetch User Preferences & Token
        const [tokenSnap, prefsSnap] = await Promise.all([
            db.ref(`users/${uid}/fcmToken`).get(),
            db.ref(`users/${uid}/preferences`).get()
        ]);

        if (!tokenSnap.exists()) return;
        const fcmToken = tokenSnap.val();
        if (!fcmToken || typeof fcmToken !== 'string') return;
        const prefs = prefsSnap.val() || {};

        // 2. Enforce User Preferences
        if (interruptionLevel !== 'critical') {
            if (prefs.dnd_enabled) return; // Do Not Disturb
            if (tripId && prefs.muted_trips && prefs.muted_trips[tripId]) return; // Per-trip mute
        }

        // 3. Deduplication (10s-30s window) - Only when an explicit eventId is supplied
        if (eventId) {
            const debounceRef = db.ref(`users/${uid}/notif_debounce/${eventId}`);
            const debounceSnap = await debounceRef.get();
            if (debounceSnap.exists()) {
                const lastSent = debounceSnap.val();
                if (Date.now() - lastSent < 30000) return; // 30 second debounce
            }
            // Fire and forget update with timed removal
            debounceRef.set(Date.now()).then(() => {
                setTimeout(() => debounceRef.remove().catch(() => {}), 35000);
            }).catch(() => {});
        }

        // 4. Construct Advanced Payload (All data values MUST be strings for FCM)
        const sanitizedData = {};
        if (data && typeof data === 'object') {
            for (const [k, v] of Object.entries(data)) {
                if (v !== undefined && v !== null) {
                    sanitizedData[k] = typeof v === 'string' ? v : String(v);
                }
            }
        }
        if (androidChannelId) {
            sanitizedData.androidChannelId = androidChannelId;
        }

        const message = {
            data: sanitizedData,
            token: fcmToken,
            android: {
                priority: (interruptionLevel === 'critical' || interruptionLevel === 'time-sensitive') ? "high" : "normal",
                notification: silent ? undefined : {
                    channelId: androidChannelId,
                    sound: "default",
                    notificationPriority: (interruptionLevel === 'critical' || interruptionLevel === 'time-sensitive') ? "PRIORITY_HIGH" : "PRIORITY_DEFAULT",
                },
            },
            apns: {
                payload: {
                    aps: {
                        contentAvailable: silent ? true : undefined,
                        mutableContent: true,
                        sound: silent ? undefined : "default",
                        "interruption-level": interruptionLevel === 'critical' ? 'time-sensitive' : interruptionLevel,
                    },
                },
                headers: {
                    "apns-priority": silent ? "5" : "10",
                }
            },
        };

        if (!silent) {
            message.notification = { title: String(title || "GoMusafir Update"), body: String(body || "") };

            // Save in-app notification record under users/${uid}/notifications only if not skipped
            if (!options.skipDbSave) {
                try {
                    await db.ref(`users/${uid}/notifications`).push().set({
                        title: title || "GoMusafir Update",
                        message: body || "",
                        type: data.type || options.type || "push",
                        tripId: data.tripId || options.tripId || null,
                        orgId: data.orgId || options.orgId || null,
                        name: data.name || null,
                        senderImage: data.senderImage || null,
                        latitude: data.latitude || data.lat || null,
                        longitude: data.longitude || data.lng || null,
                        lat: data.lat || data.latitude || null,
                        lng: data.lng || data.longitude || null,
                        timestamp: Date.now(),
                        read: false,
                        senderUid: data.senderUid || data.sender_id || null
                    });
                } catch (dbErr) {
                    console.error(`[NotificationService] DB save failed for ${uid}:`, dbErr.message);
                }
            }
        }

        // 5. Send message
        const response = await admin.messaging().send(message);
        return response;
    } catch (error) {
        if (error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-registration-token') {
            await db.ref(`users/${uid}/fcmToken`).remove();
        }
        console.error(`[NotificationService] Error for ${uid}:`, error.message);
    }
}

module.exports = {
    sendPushNotification,
};
