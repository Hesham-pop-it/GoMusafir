import { getVisibleSnapshot } from '../services/visibilityData';
import { ref, update, get, set } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { database, auth } from '../config/firebase';
import { navigationRef } from '../navigation/RootNavigator';

/**
 * Resolves the destination screen and parameters for any notification payload,
 * marks the notification as read in Firebase Realtime Database, and navigates.
 * 
 * @param {Object} item - Notification payload containing type, tripId, orgId, etc.
 * @param {Object} [navigation] - Optional React Navigation prop (falls back to navigationRef).
 */
export const navigateToNotificationTarget = async (item, navigation = null) => {
    if (!item) return;

    // 1. Mark as read in Realtime DB if applicable
    if (auth.currentUser && item.id && !item._pushOnly) {
        const uid = auth.currentUser.uid;
        const oId = item.orgId || item.data?.orgId || item.data?.org_id;
        const tId = item.tripId || item.data?.tripId || item.data?.trip_id;
        const isGlobal = item.isUserGlobal || item.data?.isUserGlobal;

        if (isGlobal) {
            try {
                const userNotifRef = ref(database, `users/${uid}/notifications/${item.id}`);
                update(userNotifRef, { read: true, seen: true }).catch(() => {});
            } catch (e) {}
        } else if (oId && tId && item.type !== 'chat_message') {
            try {
                const tripNotifRef = ref(database, `trips_active/${oId}/${tId}/notifications/${uid}/${item.id}`);
                update(tripNotifRef, { read: true, seen: true }).catch(() => {});
            } catch (e) {}
        }
    }

    // 2. Extract notification metadata
    const type = item.type || item.data?.type || 'notification';
    let tripId = item.tripId || item.data?.tripId || item.data?.trip_id;
    let orgId = item.orgId || item.data?.orgId || item.data?.org_id;
    const targetUid = item.senderUid || item.sender_id || item.senderId || item.fromUid || item.data?.senderUid || item.data?.fromUid;
    const isAdmin = item.isAdmin !== undefined ? item.isAdmin : item.data?.isAdmin;

    // 3. Security: If this is a New Sign-In notification, logging out from the app is required
    const isNewSignIn = 
        type === 'NEW_SIGN_IN' ||
        type === 'new_sign_in' ||
        type === 'sign_in' ||
        type === 'new_signin' ||
        type === 'security_alert' ||
        item.title === 'New Sign-In' ||
        item.title?.toLowerCase()?.includes('new sign-in') ||
        item.title?.toLowerCase()?.includes('new sign in') ||
        item.data?.type === 'NEW_SIGN_IN';

    if (isNewSignIn) {
        try {
            const user = auth.currentUser;
            if (user) {
                // 1. Clear active device ID in Realtime Database
                try {
                    const deviceRef = ref(database, `users/${user.uid}/active_device_id`);
                    await set(deviceRef, null);
                } catch (e) {}

                // 2. Safe sign out (clears RTDB presence, stops location/push, then signs out)
                const { safeSignOut } = require('./authUtils');
                await safeSignOut(auth);
            }
        } catch (err) {
            console.warn('[NotificationNavigation] Error signing out on new sign-in notification tap:', err);
        }
        return;
    }

    // If tripId is missing, attempt to look up user's active/current trip
    if (!tripId && auth.currentUser) {
        try {
            const userSnap = await getVisibleSnapshot(ref(database, `users/${auth.currentUser.uid}`), null);
            if (userSnap.exists()) {
                const userData = userSnap.val() || {};
                tripId = userData.current_trip || Object.keys(userData.joined_trips || {})[0];
                if (tripId && !orgId) {
                    orgId = userData.staff_org_id || userData.joined_trips?.[tripId]?.org_id || userData.joined_trips?.[tripId]?.orgId;
                    if (!orgId) {
                        const orgSnap = await get(ref(database, `trips_orgs/${tripId}`));
                        if (orgSnap.exists()) orgId = orgSnap.val();
                    }
                }
            }
        } catch (err) {
            console.log('[NotificationNavigation] Error resolving default trip:', err);
        }
    }

    const tripData = tripId ? {
        id: tripId,
        tripId: tripId,
        orgId: orgId,
        org_id: orgId,
        ...(isAdmin !== undefined ? { isAdmin } : {})
    } : null;

    const baseParams = {
        trip: tripData,
        tripId,
        orgId,
        ...(isAdmin !== undefined ? { isAdmin } : {})
    };

    // Helper to perform navigation safely
    const performNav = (targetScreen, params) => {
        if (navigation && typeof navigation.navigate === 'function') {
            navigation.navigate(targetScreen, params);
        } else if (navigationRef.isReady()) {
            navigationRef.navigate(targetScreen, params);
        } else {
            // Wait for navigation container to be ready
            const interval = setInterval(() => {
                if (navigationRef.isReady()) {
                    clearInterval(interval);
                    navigationRef.navigate(targetScreen, params);
                }
            }, 100);
            setTimeout(() => clearInterval(interval), 3000);
        }
    };

    try {
        switch (type) {
            case 'chat':
            case 'chat_message':
                if (tripId) {
                    performNav('TripChat', baseParams);
                } else {
                    performNav('Home');
                }
                break;

            case 'location_response':
            case 'location_request':
                if (tripId) {
                    performNav('LiveLocation', {
                        ...baseParams,
                        targetUid,
                    });
                } else {
                    performNav('Home');
                }
                break;

            case 'voice_inactivity':
            case 'voice_started':
            case 'voice_mute_all':
            case 'voice_unmute_all':
            case 'voice_muted':
            case 'voice_unmuted':
            case 'voice_recording_started':
            case 'voice_recording_stopped':
            case 'voice_channel_update':
            case 'voice':
            case 'audio':
                if (tripId) {
                    performNav('VoiceChat', baseParams);
                } else {
                    performNav('Home');
                }
                break;

            case 'voice_ended':
                if (tripId) {
                    performNav('TripOverview', baseParams);
                } else {
                    performNav('Home');
                }
                break;

            case 'emergency':
            case 'sos':
                if (tripId) {
                    performNav('AlertHistory', {
                        ...baseParams,
                        alerts: [item],
                    });
                } else {
                    performNav('AlertHistory', {
                        alerts: [item]
                    });
                }
                break;

            case 'alert':
            case 'broadcast':
            case 'announcement':
            case 'trip_started':
            case 'trip_ended':
                if (tripId) {
                    performNav('TripOverview', baseParams);
                } else {
                    performNav('Home');
                }
                break;

            case 'seat_update':
            case 'seat_topup':
                if (tripId) {
                    performNav('TripSettings', baseParams);
                } else {
                    performNav('Notifications', baseParams);
                }
                break;

            default:
                if (item.screen || item.data?.screen) {
                    performNav(item.screen || item.data?.screen, {
                        ...baseParams,
                        ...(item.params || item.data?.params || {})
                    });
                } else if (tripId) {
                    performNav('TripOverview', baseParams);
                } else {
                    performNav('Notifications', baseParams);
                }
                break;
        }
    } catch (err) {
        console.warn('[NotificationNavigation] Navigation error:', err);
    }
};

/**
 * Extracts a normalized numeric timestamp (milliseconds since epoch) from a notification item or key.
 * Handles numeric timestamps, string ISO dates, string numbers, alternative keys, and Firebase Push IDs.
 *
 * @param {Object} item 
 * @param {string|number} [id] 
 * @returns {number}
 */
export const extractNotificationTimestamp = (item, id = null) => {
    const rawId = id || item?.id || item?.uniqueKey || '';

    // 1. Check direct timestamp property
    if (item && item.timestamp !== undefined && item.timestamp !== null) {
        if (typeof item.timestamp === 'number' && !isNaN(item.timestamp) && item.timestamp > 0) {
            return item.timestamp;
        }
        if (typeof item.timestamp === 'string') {
            const num = Number(item.timestamp);
            if (!isNaN(num) && num > 0) return num;
            const parsed = Date.parse(item.timestamp);
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }

    // 2. Check alternative timestamp properties
    const altKeys = ['createdAt', 'created_at', 'sentAt', 'time', 'date', 'send_time', 'updated_at', 'updatedAt'];
    if (item && typeof item === 'object') {
        for (const key of altKeys) {
            const val = item[key];
            if (val !== undefined && val !== null) {
                if (typeof val === 'number' && !isNaN(val) && val > 0) return val;
                if (typeof val === 'string') {
                    const num = Number(val);
                    if (!isNaN(num) && num > 0) return num;
                    const parsed = Date.parse(val);
                    if (!isNaN(parsed) && parsed > 0) return parsed;
                }
            }
        }
    }

    // 3. Check if ID is a numeric timestamp (e.g. Date.now() string like '1725345678901')
    const idStr = String(rawId || '');
    if (/^\d{10,14}$/.test(idStr)) {
        const num = parseInt(idStr, 10);
        if (num > 1000000000000) return num;
        if (num > 1000000000) return num * 1000;
    }

    // 4. Check if ID is a standard Firebase Push ID (encoded timestamp in first 8 chars)
    const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    if (idStr.length >= 8) {
        let time = 0;
        let valid = true;
        for (let i = 0; i < 8; i++) {
            const c = idStr.charAt(i);
            const index = PUSH_CHARS.indexOf(c);
            if (index === -1) {
                valid = false;
                break;
            }
            time = time * 64 + index;
        }
        if (valid && time > 1000000000000 && time < 4000000000000) {
            return time;
        }
    }

    return 0;
};

/**
 * Formats a notification timestamp nicely for display.
 * Displays "12:10 PM", "Yesterday, 10:49 AM", or "Sep 2, 10:49 AM".
 *
 * @param {number|string} timestamp 
 * @returns {string}
 */
export const formatNotificationTime = (timestamp) => {
    if (!timestamp) return '';
    try {
        const date = new Date(Number(timestamp) || timestamp);
        if (isNaN(date.getTime()) || date.getTime() <= 0) return '';

        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();

        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isToday) {
            return timeStr;
        } else if (isYesterday) {
            return `Yesterday, ${timeStr}`;
        } else {
            const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            return `${dateStr}, ${timeStr}`;
        }
    } catch (e) {
        return '';
    }
};

