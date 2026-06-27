import { Platform } from 'react-native';
import * as Device from 'expo-device';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { database, auth } from '../config/firebase';
import { ref, set } from 'firebase/database';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let isForegroundListenerRegistered = false;

export async function registerForPushNotificationsAsync(user = null) {
    if (isExpoGo) {
        console.warn("[PushNotification] Push notifications are bypassed because you are running in Expo Go. To test Firebase Cloud Messaging, you must run a native Development Client build (npx expo run:ios / run:android).");
        return null;
    }

    // Allow emulators for Android as they support FCM
    if (Platform.OS === 'ios' && !Device.isDevice) {
        console.warn("[PushNotification] Push notifications are not supported on iOS Simulators. Please use a physical iOS device.");
        return null;
    }

    try {
        console.log("[PushNotification] Requesting push notification permissions...");
        // 1. Request Permission (iOS requires this explicitly for Firebase)
        const authStatus = await messaging().requestPermission();
        const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (!enabled) {
            console.warn("[PushNotification] Push permission denied. Auth status:", authStatus);
            return null;
        }

        // 2. Create Android Notification Channels (Required for Android 8.0+)
        if (Platform.OS === 'android') {
            await Promise.all([
                notifee.createChannel({
                    id: 'default',
                    name: 'Default Channel',
                    importance: AndroidImportance.HIGH,
                    vibration: true,
                }),
                notifee.createChannel({
                    id: 'Chat',
                    name: 'Chat Messages',
                    importance: AndroidImportance.HIGH,
                    vibration: true,
                }),
                notifee.createChannel({
                    id: 'Safety',
                    name: 'Safety & Emergency',
                    importance: AndroidImportance.HIGH,
                    vibration: true,
                }),
                notifee.createChannel({
                    id: 'Admin',
                    name: 'Admin Alerts',
                    importance: AndroidImportance.HIGH,
                    vibration: true,
                }),
                notifee.createChannel({
                    id: 'Trip Audio',
                    name: 'Trip Audio',
                    importance: AndroidImportance.HIGH,
                    vibration: true,
                })
            ]);
            console.log("[PushNotification] Android notification channels created successfully.");
        }

        // 3. Register for remote messages (Critical for iOS)
        if (Platform.OS === 'ios') {
            await messaging().registerDeviceForRemoteMessages();
        }

        // 4. Get FCM Token
        const token = await messaging().getToken();
        console.log("[PushNotification] FCM Token retrieved successfully:", token);

        // 4. Save to Database
        const uid = user?.uid || auth.currentUser?.uid;
        if (uid) {
            await set(ref(database, `users/${uid}/fcmToken`), token);
            console.log(`[PushNotification] Token saved to Realtime Database under users/${uid}/fcmToken`);
        }

        // 5. Handle foreground messages
        if (!isForegroundListenerRegistered) {
            messaging().onMessage(async remoteMessage => {
                console.log("[PushNotification] Received foreground notification message:", remoteMessage);
                await notifee.displayNotification({
                    title: remoteMessage.notification?.title || 'New Update',
                    body: remoteMessage.notification?.body || 'You have a new message from GoMusafir.',
                    android: {
                        channelId: remoteMessage.notification?.android?.channelId || 'default',
                        importance: AndroidImportance.HIGH,
                        pressAction: {
                            id: 'default',
                        },
                    },
                });
            });
            isForegroundListenerRegistered = true;
            console.log("[PushNotification] Foreground notification listener registered successfully.");
        }

        return token;
    } catch (error) {
        console.error("[PushNotification] Error registering for push notifications:", error);
        return null;
    }
}

export async function unregisterForPushNotificationsAsync() {
    if (isExpoGo) return;
    try {
        const uid = auth.currentUser?.uid;
        if (uid) {
            // Remove token from database
            await set(ref(database, `users/${uid}/fcmToken`), null);
        }
        // Delete token from Firebase Messaging
        await messaging().deleteToken();
    } catch (error) {
        // console.warn("Error unregistering notifications:", error);
    }
}
