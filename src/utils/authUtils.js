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

/**
 * Checks whether a given user has at least one valid/active trip.
 * Staff members (admins, co-hosts, managers) always return true.
 * Participants return true ONLY if they belong to at least one active, non-closed trip.
 *
 * @param {string} uid User ID to check
 * @returns {Promise<boolean>}
 */
export const hasValidActiveTrip = async (uid) => {
    if (!uid) return false;
    try {
        const userSnap = await get(ref(database, `users/${uid}`));
        if (!userSnap.exists()) return false;
        const userData = userSnap.val() || {};

        // Staff check: Admins, co-hosts, managers, or staff_org_id bypass participant trip checks
        const userObj = auth.currentUser;
        if (userObj && userObj.uid === uid) {
            try {
                const tokenResult = await userObj.getIdTokenResult();
                const role = tokenResult?.claims?.role;
                if (role === 'admin' || role === 'co-host' || role === 'manager' || userData.staff_org_id) {
                    return true;
                }
            } catch (e) {}
        }
        if (userData.staff_org_id) {
            return true;
        }

        // Participant check: Must have at least one active trip in joined_trips
        const joinedTrips = userData.joined_trips || {};
        const tripIds = Object.keys(joinedTrips);
        if (tripIds.length === 0) {
            return false;
        }

        for (const tripId of tripIds) {
            const joinedData = joinedTrips[tripId];
            let orgId = joinedData?.org_id || joinedData?.orgId;

            if (!orgId) {
                const orgSnap = await get(ref(database, `trips_orgs/${tripId}`));
                orgId = orgSnap.val();
            }

            if (!orgId) continue;

            // Check if participant is still in trips_participants
            const participantSnap = await get(ref(database, `trips_participants/${tripId}/${uid}`));
            if (!participantSnap.exists()) continue;

            // Check trip status in orgs/orgId/trips/tripId
            const tripSnap = await get(ref(database, `orgs/${orgId}/trips/${tripId}`));
            if (tripSnap.exists()) {
                const trip = tripSnap.val();
                const isClosed = trip.status === 'closed' || trip.status === 'ended';
                if (!isClosed) {
                    return true; // Found at least one valid active trip
                }
            }
        }

        return false;
    } catch (err) {
        console.warn("[hasValidActiveTrip] Error checking trip validity:", err);
        return false;
    }
};

