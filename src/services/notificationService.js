import { Platform } from 'react-native';
import * as Device from 'expo-device';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { database, auth } from '../config/firebase';
import { ref, set, push } from 'firebase/database';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let isForegroundListenerRegistered = false;

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
            messaging().onMessage(async remoteMessage => {
                const isEmergency = remoteMessage.data?.type === 'emergency' || remoteMessage.data?.type === 'sos';
                const isVoice = remoteMessage.data?.type?.startsWith('voice') || remoteMessage.data?.type === 'audio';
                const isChat = remoteMessage.data?.type === 'chat_message' || remoteMessage.data?.type === 'chat';
                const targetChannelId = remoteMessage.notification?.android?.channelId || remoteMessage.data?.androidChannelId || (isEmergency ? 'Safety' : (isVoice ? 'Trip Audio' : (isChat ? 'Chat' : 'default')));
                
                await notifee.displayNotification({
                    title: remoteMessage.notification?.title || (isEmergency ? 'EMERGENCY ALERT' : (isChat ? (remoteMessage.data?.name || 'New Message') : 'New Update')),
                    body: remoteMessage.notification?.body || (isChat ? (remoteMessage.data?.message || 'You received a new message.') : 'You have a new message from GoMusafir.'),
                    data: {
                        ...(remoteMessage.data || {}),
                        title: remoteMessage.notification?.title,
                        message: remoteMessage.notification?.body,
                    },
                    android: {
                        channelId: targetChannelId,
                        importance: AndroidImportance.HIGH,
                        pressAction: {
                            id: 'default',
                        },
                    },
                    ios: {
                        sound: 'default',
                        foregroundPresentationOptions: {
                            badge: true,
                            sound: true,
                            banner: true,
                            list: true,
                        }
                    }
                });
            });

            // 6. Handle Notifee notification taps (Foreground)
            notifee.onForegroundEvent(({ type, detail }) => {
                if (type === notifee.EventType?.PRESS || type === 1) { // 1 is EventType.PRESS
                    const notifData = detail.notification?.data;
                    if (notifData) {
                        import('../utils/notificationNavigation').then(({ navigateToNotificationTarget }) => {
                            navigateToNotificationTarget(notifData);
                        }).catch(err => console.log("[PushNotification] Error handling foreground tap:", err));
                    }
                }
            });

            // 7. Handle Firebase background / opened notifications
            messaging().onNotificationOpenedApp(remoteMessage => {
                if (remoteMessage) {
                    const payload = {
                        ...(remoteMessage.data || {}),
                        title: remoteMessage.notification?.title,
                        message: remoteMessage.notification?.body
                    };
                    import('../utils/notificationNavigation').then(({ navigateToNotificationTarget }) => {
                        navigateToNotificationTarget(payload);
                    }).catch(err => console.log("[PushNotification] Error handling opened app notification:", err));
                }
            });

            // 8. Handle cold start / killed state launch from notification
            messaging().getInitialNotification().then(remoteMessage => {
                if (remoteMessage) {
                    const payload = {
                        ...(remoteMessage.data || {}),
                        title: remoteMessage.notification?.title,
                        message: remoteMessage.notification?.body
                    };
                    import('../utils/notificationNavigation').then(({ navigateToNotificationTarget }) => {
                        navigateToNotificationTarget(payload);
                    }).catch(err => console.log("[PushNotification] Error handling initial notification:", err));
                }
            }).catch(() => {});

            notifee.getInitialNotification().then(initialNotif => {
                if (initialNotif?.notification?.data) {
                    import('../utils/notificationNavigation').then(({ navigateToNotificationTarget }) => {
                        navigateToNotificationTarget(initialNotif.notification.data);
                    }).catch(err => console.log("[PushNotification] Error handling initial notifee notification:", err));
                }
            }).catch(() => {});

            isForegroundListenerRegistered = true;
        }

        return token;
    } catch (error) {
        console.log("[PushNotification] Error registering for push notifications:", error);
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
        // Delete token from Firebase Messaging with a 1.5s timeout to prevent hanging the sign-out process
        const deleteTokenPromise = messaging().deleteToken();
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500));
        await Promise.race([deleteTokenPromise, timeoutPromise]);
    } catch (error) {
        // console.warn("Error unregistering notifications:", error);
    }
}
