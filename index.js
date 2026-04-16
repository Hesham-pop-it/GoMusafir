import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

import App from './App';

// Register background handler for Firebase Messaging
messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('Message handled in the background!', remoteMessage);
    // You can also display a notification here using Notifee if needed,
    // although Firebase usually displays its own if a 'notification' object is present.
    await notifee.displayNotification({
        title: remoteMessage.notification?.title || 'GoMusafir Update',
        body: remoteMessage.notification?.body || 'New message received.',
        android: {
            channelId: 'default',
            importance: AndroidImportance.HIGH,
        },
    });
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
