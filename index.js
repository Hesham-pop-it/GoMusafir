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
import notifee, { AndroidImportance } from '@notifee/react-native';
import './src/services/locationTrackingService';
import App from './App';

// Register background handler for Firebase Messaging
messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('Message handled in the background!', remoteMessage);
    
    // Only display manual notification if the message does not contain a notification payload
    // (i.e. it is a data-only message). If it has a notification payload, FCM handles displaying it natively.
    if (!remoteMessage.notification) {
        const isEmergency = remoteMessage.data?.type === 'emergency' || remoteMessage.data?.type === 'sos';
        const isVoice = remoteMessage.data?.type?.startsWith('voice') || remoteMessage.data?.type === 'audio';
        const isChat = remoteMessage.data?.type === 'chat_message' || remoteMessage.data?.type === 'chat';
        const channelId = remoteMessage.data?.androidChannelId || (isEmergency ? 'Safety' : (isVoice ? 'Trip Audio' : (isChat ? 'Chat' : 'default')));
        await notifee.displayNotification({
            title: remoteMessage.data?.title || (isEmergency ? 'EMERGENCY ALERT' : (isChat ? (remoteMessage.data?.name || 'New Message') : 'GoMusafir Update')),
            body: remoteMessage.data?.body || remoteMessage.data?.message || 'New message received.',
            data: remoteMessage.data || {},
            android: {
                channelId: channelId,
                importance: AndroidImportance.HIGH,
            },
        });
    }
});

// 4. Register the Main Component
registerRootComponent(App);