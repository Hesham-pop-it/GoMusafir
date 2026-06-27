// index.js

// 1. MUST be the very first imports
import './polyfills'; 
import 'web-streams-polyfill';
import 'react-native-gesture-handler';

// 2. Specialized React Native / LiveKit globals
import { registerGlobals } from '@livekit/react-native';
import { registerRootComponent } from 'expo';

registerGlobals();

// 3. Firebase and UI Imports
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import App from './App';

// Register background handler for Firebase Messaging
messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('Message handled in the background!', remoteMessage);
    
    // Only display manual notification if the message does not contain a notification payload
    // (i.e. it is a data-only message). If it has a notification payload, FCM handles displaying it natively.
    if (!remoteMessage.notification) {
        await notifee.displayNotification({
            title: remoteMessage.data?.title || 'GoMusafir Update',
            body: remoteMessage.data?.body || 'New message received.',
            android: {
                channelId: 'default',
                importance: AndroidImportance.HIGH,
            },
        });
    }
});

// 4. Register the Main Component
registerRootComponent(App);