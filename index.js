// index.js

// 1. MUST be the very first imports
import './polyfills'; 
import 'web-streams-polyfill';
import 'react-native-gesture-handler';

// 2. Specialized React Native / LiveKit globals
import { registerGlobals } from '@livekit/react-native';
import { registerRootComponent } from 'expo';

registerGlobals();

// 3. Firebase, Location & UI Imports
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import './src/services/locationTrackingService';
import App from './App';

import { presentRemoteNotification, saveBackgroundNotificationPress } from './src/services/notificationService';

messaging().setBackgroundMessageHandler(remote => presentRemoteNotification(remote, true));
notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS) await saveBackgroundNotificationPress(detail.notification);
});

// 4. Register the Main Component
registerRootComponent(App);