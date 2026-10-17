const { admin, db } = require("../admin");
const { notificationSound } = require("./notificationSoundConfig");
const { loadTerms, visibleUntil, expiryEntry } = require("./notificationTerms");

const FCM_MAX_TTL_MS = 28 * 24 * 60 * 60 * 1000;
const MULTICAST_LIMIT = 500;

// How long FCM and APNs may hold an undelivered push: until the notification
// would have left the list anyway. An open SOS has no end, so it keeps the default.
async function pushTtlMs(data, options) {
    const type = data.type || options.type;
    if (!type) return null;
    const until = visibleUntil({ type, timestamp: Date.now() }, await loadTerms(db));
    return until === null ? null : Math.min(Math.max(until - Date.now(), 1000), FCM_MAX_TTL_MS);
}

// The message every recipient of one push gets, without the token.
function buildMessage({ title, body, data, options, soundProfile, ttlMs = null }) {
    const {
        interruptionLevel = "active",
        silent = false,
        quiet = false,
        collapseKey = null,
    } = options;
    const sanitizedData = {};
    if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
            if (v !== undefined && v !== null) {
                sanitizedData[k] = typeof v === 'string' ? v : String(v);
            }
        }
    }
    const androidChannelId = soundProfile.channelId;
    if (androidChannelId) {
        sanitizedData.androidChannelId = androidChannelId;
    }
    const message = {
        data: sanitizedData,
        android: {
            ...(collapseKey ? { collapseKey: String(collapseKey) } : {}),
            ...(ttlMs ? { ttl: ttlMs } : {}),
            priority: (interruptionLevel === 'critical' || interruptionLevel === 'time-sensitive') ? "high" : "normal",
            notification: silent ? undefined : {
                channelId: androidChannelId,
                ...(quiet ? { defaultSound: false } : { sound: soundProfile.sound }),
                ...(collapseKey ? { tag: String(collapseKey) } : {}),
                notificationPriority: (interruptionLevel === 'critical' || interruptionLevel === 'time-sensitive') ? "PRIORITY_HIGH" : "PRIORITY_DEFAULT",
            },
        },
        apns: {
            payload: {
                aps: {
                    contentAvailable: silent ? true : undefined,
                    mutableContent: true,
                    sound: (silent || quiet) ? undefined : soundProfile.file,
                    "interruption-level": interruptionLevel === 'critical' ? 'time-sensitive' : interruptionLevel,
                },
            },
            headers: {
                "apns-priority": silent ? "5" : "10",
                ...(ttlMs ? { "apns-expiration": String(Math.floor((Date.now() + ttlMs) / 1000)) } : {}),
                ...(collapseKey ? { "apns-collapse-id": String(collapseKey).slice(0, 64) } : {}),
            }
        },
    };
    if (!silent) message.notification = { title: String(title || "GoMusafir Update"), body: String(body || "") };
    return message;
}

// The recipient's token, or null when this push must not reach them (no token,
// Do Not Disturb, trip muted, or a duplicate inside the debounce window).
async function recipientToken(uid, options) {
    const {
        interruptionLevel = "active", // 'active', 'time-sensitive', 'passive', 'critical'
        tripId = null,
        eventId = null, // for deduplication (e.g. 'chat_trip123')
    } = options;
    // 1. Fetch User Preferences & Token
    const [tokenSnap, prefsSnap] = await Promise.all([
        db.ref(`users/${uid}/fcmToken`).get(),
        db.ref(`users/${uid}/preferences`).get()
    ]);

    if (!tokenSnap.exists()) return null;
    const fcmToken = tokenSnap.val();
    if (!fcmToken || typeof fcmToken !== 'string') return null;
    const prefs = prefsSnap.val() || {};

    // 2. Enforce User Preferences
    if (interruptionLevel !== 'critical') {
        if (prefs.dnd_enabled) return null; // Do Not Disturb
        if (tripId && prefs.muted_trips && prefs.muted_trips[tripId]) return null; // Per-trip mute
    }

    // 3. Deduplication (10s-30s window) - Only when an explicit eventId is supplied
    if (eventId) {
        const debounceRef = db.ref(`users/${uid}/notif_debounce/${eventId}`);
        const debounceSnap = await debounceRef.get();
        if (debounceSnap.exists()) {
            const lastSent = debounceSnap.val();
            if (Date.now() - lastSent < 30000) return null; // 30 second debounce
        }
        // Fire and forget update with timed removal
        debounceRef.set(Date.now()).then(() => {
            setTimeout(() => debounceRef.remove().catch(() => {}), 35000);
        }).catch(() => {});
    }
    return fcmToken;
}

/**
 * Sends a push notification to a specific user via FCM.
 * @param {string} uid - The target user's UID.
 * @param {string} title - The notification title (ignored if silent).
 * @param {string} body - The notification body (ignored if silent).
 * @param {object} data - Optional data payload (deep links: tripId, tab, role).
 * @param {object} options - Advanced delivery rules. `quiet` keeps the visible notification but drops the sound;
 *   `collapseKey` replaces earlier undelivered or displayed notifications that share the key.
 */
async function sendPushNotification(uid, title, body, data = {}, options = {}) {
    try {
        const { redactNotification } = require('./notificationPrivacy');
        const safe = redactNotification({ ...data, title, message: body });
        title = safe.title || title;
        body = safe.message || body;
        data = safe;
        const { androidChannelId: requestedChannelId, silent = false } = options;

        const soundProfile = notificationSound(data, { ...options, androidChannelId: requestedChannelId });

        const fcmToken = await recipientToken(uid, options);
        if (!fcmToken) return;

        // 4. Construct Advanced Payload (All data values MUST be strings for FCM)
        const message = buildMessage({ title, body, data, options, soundProfile, ttlMs: await pushTtlMs(data, options) });
        message.token = fcmToken;
        const sanitizedData = message.data;

        if (!silent) {
            // Save in-app notification record under users/${uid}/notifications only if not skipped
            if (!options.skipDbSave) {
                try {
                    const notificationRef = db.ref(`users/${uid}/notifications`).push();
                    sanitizedData.notificationId = notificationRef.key;
                    sanitizedData.isUserGlobal = 'true';
                    const record = {
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
                    };
                    // The server sets how long the record stays visible and lists it for the daily prune.
                    const until = visibleUntil(record, await loadTerms(db));
                    const path = `users/${uid}/notifications/${notificationRef.key}`;
                    if (until) record.visible_until = until;
                    await db.ref().update({ [path]: record, ...(until ? expiryEntry(notificationRef.key, path, until) : {}) });
                } catch (dbErr) {
                    console.error(`[NotificationService] DB save failed for ${uid}:`, dbErr.message);
                }
            }
        }

        // 5. Send message
        const response = await admin.messaging().send(message);
        return response;
    } catch (error) {
        if (isDeadToken(error.code)) {
            await db.ref(`users/${uid}/fcmToken`).remove();
        }
        console.error(`[NotificationService] Error for ${uid}:`, error.message);
    }
}

const isDeadToken = code => code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';

/**
 * Sends one identical push to many people. Each person still goes through their own
 * checks (token, Do Not Disturb, trip mute) and gets no in-app record; the tokens
 * are sent in groups of at most 500 per FCM call. `quietFor(uid)` may return true
 * to drop the sound for that person.
 */
async function sendPushToMany(uids, title, body, data = {}, options = {}, quietFor = null) {
    try {
        const { redactNotification } = require('./notificationPrivacy');
        const safe = redactNotification({ ...data, title, message: body });
        title = safe.title || title;
        body = safe.message || body;
        data = safe;
        const soundProfile = notificationSound(data, { ...options, androidChannelId: options.androidChannelId });
        const ttlMs = await pushTtlMs(data, options);
        const targets = (await Promise.all(uids.map(async uid => {
            const token = await recipientToken(uid, options).catch(() => null);
            if (!token) return null;
            return { uid, token, quiet: Boolean(quietFor && await quietFor(uid)) };
        }))).filter(Boolean);
        for (const quiet of [false, true]) {
            const group = targets.filter(target => target.quiet === quiet);
            if (!group.length) continue;
            const message = buildMessage({ title, body, data, options: { ...options, quiet: quiet || options.quiet }, soundProfile, ttlMs });
            for (let i = 0; i < group.length; i += MULTICAST_LIMIT) {
                const batch = group.slice(i, i + MULTICAST_LIMIT);
                const response = await admin.messaging().sendEachForMulticast({ ...message, tokens: batch.map(target => target.token) });
                await Promise.all(response.responses.map((result, index) =>
                    !result.success && isDeadToken(result.error?.code)
                        ? db.ref(`users/${batch[index].uid}/fcmToken`).remove().catch(() => {}) : null));
            }
        }
    } catch (error) {
        console.error('[NotificationService] Multicast error:', error.message);
    }
}

module.exports = {
    sendPushNotification,
    sendPushToMany,
    buildMessage,
    MULTICAST_LIMIT,
};
