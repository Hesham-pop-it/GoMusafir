import { signOut } from 'firebase/auth';
import { ref, update, get } from 'firebase/database';
import { database, auth } from '../config/firebase';
import { unregisterForPushNotificationsAsync } from '../services/notificationService';
import { stopLiveLocationTracking } from '../services/locationTrackingService';

/**
 * Safely signs out the current user by clearing RTDB presence, voice channel presence,
 * active hosts, push tokens, and location tracking BEFORE revoking auth credentials.
 *
 * @param {import('firebase/auth').Auth} authInstance
 * @param {{ tripId?: string, orgId?: string }} [activeTripContext]
 */
export const safeSignOut = async (authInstance = auth, activeTripContext = {}) => {
    try {
        const user = authInstance.currentUser;
        if (user && user.uid) {
            const uid = user.uid;
            const tripId = activeTripContext.tripId;
            const orgId = activeTripContext.orgId;

            const cleanupPromises = [];

            // 1. Clear presence for the explicitly passed trip context
            if (tripId && orgId) {
                cleanupPromises.push(
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/app_presence`), { [uid]: null }).catch(() => {}),
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/presence`), { [uid]: null }).catch(() => {}),
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/active_hosts`), { [uid]: null }).catch(() => {})
                );
            }

            // 2. Also check and clear current_trip in user profile if it differs
            try {
                const userSnap = await get(ref(database, `users/${uid}/current_trip`));
                const currentTripId = userSnap.val();
                if (currentTripId && currentTripId !== tripId) {
                    const orgSnap = await get(ref(database, `trips_orgs/${currentTripId}`));
                    const currentOrgId = orgSnap.val();
                    if (currentOrgId) {
                        cleanupPromises.push(
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/app_presence`), { [uid]: null }).catch(() => {}),
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence`), { [uid]: null }).catch(() => {}),
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts`), { [uid]: null }).catch(() => {})
                        );
                    }
                }
            } catch (e) {
                console.warn("[safeSignOut] Error checking user's current trip:", e);
            }

            // Wait for RTDB presence clear to complete while still authenticated
            await Promise.all(cleanupPromises);
        }

        // 3. Stop live location tracking
        try {
            if (typeof stopLiveLocationTracking === 'function') {
                await stopLiveLocationTracking();
            }
        } catch (e) {
            console.warn("[safeSignOut] Error stopping live location tracking:", e);
        }

        // 4. Unregister push notifications
        try {
            if (typeof unregisterForPushNotificationsAsync === 'function') {
                await unregisterForPushNotificationsAsync();
            }
        } catch (e) {
            console.warn("[safeSignOut] Error unregistering push notifications:", e);
        }

        // 5. Revoke Firebase Auth session
        await signOut(authInstance);
    } catch (err) {
        console.warn("[safeSignOut] Error during safeSignOut flow:", err);
        // Ensure signOut is executed regardless
        await signOut(authInstance);
    }
};
