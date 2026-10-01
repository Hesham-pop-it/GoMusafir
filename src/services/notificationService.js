import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { database, auth } from '../config/firebase';
import { ref, set } from 'firebase/database';

import { STANDARD, SOS, notificationSound } from '../../functions/services/notificationSoundConfig';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let isForegroundListenerRegistered = false;
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeNotification, publishForegroundNotification, resetNotificationPresentation } from './notificationPresentation';
const PENDING_TAP = 'gomusafir.pendingNotificationTap';
const recentTaps = new Map();
export async function handleNotificationPress(data) {
    if (!data) return;
    const key = data.notificationId || data.messageId || data.id || JSON.stringify(data);
    const now = Date.now();
    for (const [id, time] of recentTaps) if (now - time > 30000) recentTaps.delete(id);
    if (recentTaps.has(key)) return;
    recentTaps.set(key, now);
    const { navigateToNotificationTarget } = await import('../utils/notificationNavigation');
    await navigateToNotificationTarget(data);
}
export async function saveBackgroundNotificationPress(notification) {
    await AsyncStorage.setItem(PENDING_TAP, JSON.stringify(normalizeNotification({ data: notification?.data, messageId: notification?.id, notification: { title: notification?.title, body: notification?.body } })));
}
async function drainNotificationPress() {
    const value = await AsyncStorage.getItem(PENDING_TAP);
    if (!value) return;
    await AsyncStorage.removeItem(PENDING_TAP);
    await handleNotificationPress(JSON.parse(value));
}
export async function presentRemoteNotification(remoteMessage, fromBackgroundHandler = false) {
    if (fromBackgroundHandler && remoteMessage.notification) return;
    if (AppState.currentState === 'active') {
        publishForegroundNotification(remoteMessage);
        return;
    }
    // APNs/FCM already presents notification payloads in the background.
    const item = normalizeNotification(remoteMessage);
    const soundProfile = notificationSound(item);
    const channelId = soundProfile.channelId;
    if (Platform.OS === 'android') await notifee.createChannel({
        id: channelId, name: soundProfile.name, sound: soundProfile.sound,
        importance: AndroidImportance.HIGH, vibration: true,
    });
    await notifee.displayNotification({
        ...(item.id ? { id: item.id } : {}), title: item.title, body: item.message,
        data: { ...(remoteMessage.data || {}), title: item.title, message: item.message,
            ...(item.id ? { id: item.id } : {}) },
        android: { channelId, sound: soundProfile.sound, importance: AndroidImportance.HIGH, pressAction: { id: 'default' } },
        ios: { sound: soundProfile.file, foregroundPresentationOptions: { badge: false, sound: false, banner: false, list: false } },
    });
}


export async function registerForPushNotificationsAsync(user = null) {
    if (isExpoGo) {
        console.log("[PushNotification] Push notifications are bypassed because you are running in Expo Go. To test Firebase Cloud Messaging, you must run a native Development Client build (npx expo run:ios / run:android).");
        return null;
    }

    // Allow emulators for Android as they support FCM
    if (Platform.OS === 'ios' && !Device.isDevice) {
        console.log("[PushNotification] Push notifications are not supported on iOS Simulators. Please use a physical iOS device.");
        return null;
    }

    try {
        // 1. Request Permission (iOS requires this explicitly for Firebase)
        const authStatus = await messaging().requestPermission();
        const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (!enabled) {
            console.log("[PushNotification] Push permission denied. Auth status:", authStatus);
            return null;
        }

        // 2. Create Android Notification Channels (Required for Android 8.0+)
        if (Platform.OS === 'android') {
            await Promise.all([STANDARD, SOS].map(profile => notifee.createChannel({
                id: profile.channelId, name: profile.name, sound: profile.sound,
                importance: AndroidImportance.HIGH, vibration: true,
            })));
        }

        // 3. Register for remote messages (Critical for iOS)
        if (Platform.OS === 'ios') {
            await messaging().registerDeviceForRemoteMessages();
        }

        // 4. Get FCM Token
        const token = await messaging().getToken();

        // 4. Save to Database
        const uid = user?.uid || auth.currentUser?.uid;
        if (uid && token) {
            await set(ref(database, `users/${uid}/fcmToken`), token);
        }

        // Keep token in sync when refreshed by APNs / FCM on iOS & Android
        messaging().onTokenRefresh(async (newToken) => {
            const currentUid = auth.currentUser?.uid || user?.uid;
            if (currentUid && newToken) {
                try {
                    await set(ref(database, `users/${currentUid}/fcmToken`), newToken);
                } catch (e) {
                    console.log("[PushNotification] Error updating refreshed token:", e);
                }
            }
        });

        // 5. Handle foreground messages
        if (!isForegroundListenerRegistered) {
            messaging().onMessage(remote => presentRemoteNotification(remote));
            notifee.onForegroundEvent(({ type, detail }) => {
                if (type === 1) handleNotificationPress(normalizeNotification({ data: detail.notification?.data, messageId: detail.notification?.id })).catch(console.warn);
            });
            messaging().onNotificationOpenedApp(remote => {
                if (remote) handleNotificationPress(normalizeNotification(remote)).catch(console.warn);
            });
            messaging().getInitialNotification().then(remote => {
                if (remote) return handleNotificationPress(normalizeNotification(remote));
            }).catch(console.warn);
            notifee.getInitialNotification().then(initial => {
                if (initial?.notification) return handleNotificationPress(normalizeNotification({ data: initial.notification.data, messageId: initial.notification.id }));
            }).catch(console.warn);
            AppState.addEventListener('change', state => {
                if (state === 'active') drainNotificationPress().catch(console.warn);
            });
            drainNotificationPress().catch(console.warn);

            isForegroundListenerRegistered = true;
        }

        return token;
    } catch (error) {
        console.log("[PushNotification] Error registering for push notifications:", error);
        return null;
    }
}

export async function unregisterForPushNotificationsAsync({ localOnly = false } = {}) {
    if (isExpoGo) return;
    if (localOnly) {
        recentTaps.clear();
        resetNotificationPresentation();
        await notifee.cancelAllNotifications().catch(() => {});
    }
    try {
        const uid = auth.currentUser?.uid;
        if (uid && !localOnly) {
            // Remove token from database
            await set(ref(database, `users/${uid}/fcmToken`), null);
        }
        // Delete token from Firebase Messaging with a 1.5s timeout to prevent hanging the sign-out process
        const deleteTokenPromise = messaging().deleteToken();
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500));
        await Promise.race([deleteTokenPromise, timeoutPromise]);
    } catch (error) {
        // console.warn("Error unregistering notifications:", error);
    }
}
