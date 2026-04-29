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
    
    await notifee.displayNotification({
        title: remoteMessage.notification?.title || 'GoMusafir Update',
        body: remoteMessage.notification?.body || 'New message received.',
        android: {
            channelId: 'default',
            importance: AndroidImportance.HIGH,
        },
    });
});

// 4. Register the Main Component
registerRootComponent(App);