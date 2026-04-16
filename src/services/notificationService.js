import { Platform } from 'react-native';
import * as Device from 'expo-device';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { database, auth } from '../config/firebase';
import { ref, set } from 'firebase/database';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export async function registerForPushNotificationsAsync() {
    if (isExpoGo) {
        console.log("Push notifications (Firebase/Notifee) are disabled in Expo Go. Use a Development Build.");
        return null;
    }

    if (!Device.isDevice) {
        console.log('Must use physical device for Push Notifications');
        return null;
    }

    try {
        // 1. Request Permission (iOS requires this explicitly for Firebase)
        const authStatus = await messaging().requestPermission();
        const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (!enabled) {
            console.log('Failed to get push permission!');
            return null;
        }

        // 2. Create Android Notification Channel (Required for Android 8.0+)
        if (Platform.OS === 'android') {
            await notifee.createChannel({
                id: 'default',
                name: 'Default Channel',
                importance: AndroidImportance.HIGH,
                vibration: true,
            });
        }

        // 3. Get FCM Token
        const token = await messaging().getToken();

        // 4. Save to Database
        if (auth.currentUser) {
            await set(ref(database, `users/${auth.currentUser.uid}/fcmToken`), token);
        }

        // 5. Handle foreground messages
        messaging().onMessage(async remoteMessage => {
            console.log('Foreground message received:', remoteMessage);
            await notifee.displayNotification({
                title: remoteMessage.notification?.title || 'New Update',
                body: remoteMessage.notification?.body || 'You have a new message from GoMusafir.',
                android: {
                    channelId: 'default',
                    importance: AndroidImportance.HIGH,
                    pressAction: {
                        id: 'default',
                    },
                },
            });
        });

        return token;
    } catch (error) {
        console.warn("Notification registration error:", error);
        return null;
    }
}
