const { admin, db } = require("../admin");

/**
 * Sends a push notification to a specific user via FCM.
 * @param {string} uid - The target user's UID.
 * @param {string} title - The notification title.
 * @param {string} body - The notification body.
 * @param {object} data - Optional data payload for the notification.
 */
async function sendPushNotification(uid, title, body, data = {}) {
    try {
        // 1. Fetch user's FCM token from the database
        const tokenSnap = await db.ref(`users/${uid}/fcmToken`).get();
        if (!tokenSnap.exists()) {
            // console.log(`[NotificationService] No FCM token found for user ${uid}. Skipping.`);
            return;
        }

        const fcmToken = tokenSnap.val();

        // 2. Construct the message
        const message = {
            notification: {
                title: title,
                body: body,
            },
            data: {
                ...data,
            },
            token: fcmToken,
            android: {
                priority: "high",
                notification: {
                    channelId: "default",
                    sound: "default",
                    priority: "high",
                },
            },
            apns: {
                payload: {
                    aps: {
                        badge: 1,
                        sound: "default",
                        contentAvailable: true,
                        mutableContent: true,
                    },
                },
                headers: {
                    "apns-priority": "10",
                }
            },
        };

        // 3. Send the message
        const response = await admin.messaging().send(message);
        // console.log(`[NotificationService] Successfully sent message to user ${uid}:`, response);
        return response;
    } catch (error) {
        // Handle stale/invalid tokens
        if (error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-registration-token') {
            // console.log(`[NotificationService] Stale token for user ${uid}. Removing from DB.`);
            await db.ref(`users/${uid}/fcmToken`).remove();
        } else {
            // console.error(`[NotificationService] Error sending push notification to user ${uid}:`, error);
        }
        throw error;
    }
}

module.exports = {
    sendPushNotification,
};
