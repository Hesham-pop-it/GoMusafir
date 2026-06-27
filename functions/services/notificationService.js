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
        const prefs = prefsSnap.val() || {};

        // 2. Enforce User Preferences
        if (interruptionLevel !== 'critical') {
            if (prefs.dnd_enabled) return; // Do Not Disturb
            if (tripId && prefs.muted_trips && prefs.muted_trips[tripId]) return; // Per-trip mute
        }

        // 3. Deduplication (10s-30s window)
        if (eventId) {
            const debounceRef = db.ref(`users/${uid}/notif_debounce/${eventId}`);
            const debounceSnap = await debounceRef.get();
            if (debounceSnap.exists()) {
                const lastSent = debounceSnap.val();
                if (Date.now() - lastSent < 30000) return; // 30 second debounce
            }
            // Fire and forget update
            debounceRef.set(Date.now()).then(() => debounceRef.remove({ timeout: 35000 })).catch(() => {});
        }

        // 4. Construct Advanced Payload
        const message = {
            data: { ...data },
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
                        sound: interruptionLevel === 'critical' ? { critical: 1, name: "default", volume: 1.0 } : (silent ? undefined : "default"),
                        "interruption-level": interruptionLevel,
                    },
                },
                headers: {
                    "apns-priority": silent ? "5" : "10",
                }
            },
        };

        if (!silent) {
            message.notification = { title, body };
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
