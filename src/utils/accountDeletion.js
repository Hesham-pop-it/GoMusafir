import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { finishEnrollment } from './enrollmentSession';
import { stopLiveLocationTracking } from '../services/locationTrackingService';
import { unregisterForPushNotificationsAsync } from '../services/notificationService';
import ChatDatabase from './chatDb';
import ChatEncryption from './chatEncryption';

// Only call after the server confirms deletion. The user no longer has database
// permissions, so this path must never wait on remote presence/profile cleanup.
export async function completeAccountDeletion(authInstance, navigation) {
    finishEnrollment();
    try {
        // Firebase removes its persisted user/access/refresh-token record locally.
        // This works offline and emits the null-user event to all app providers.
        await signOut(authInstance);
    } finally {
        // Reset, rather than navigate, so Back cannot reopen the deleted account.
        navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
        const results = await Promise.allSettled([
            AsyncStorage.multiRemove([
                'mfa_lock', '@voice_session', '@active_location_sync',
                'gomusafir.pendingNotificationTap', 'cached_prayer_times',
            ]),
            ChatDatabase.clearAll(),
            ChatEncryption.clear(),
            stopLiveLocationTracking(),
            unregisterForPushNotificationsAsync({ localOnly: true }),
        ]);
        for (const result of results) {
            if (result.status === 'rejected') console.warn('[Account deletion] Local cleanup failed:', result.reason);
        }
    }
}
