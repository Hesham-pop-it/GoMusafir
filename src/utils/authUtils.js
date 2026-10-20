import { protectedSession } from '../services/protectedSessionService';
import { journeyWidget } from '../services/journeyWidgetService';
import { fetchAppAccess } from './participantAccess';
import { finishEnrollment } from './enrollmentSession';
import { signOut } from 'firebase/auth';
import { ref, update, get } from 'firebase/database';
import { database, auth } from '../config/firebase';
import { unregisterForPushNotificationsAsync } from '../services/notificationService';
import { stopLiveLocationTracking } from '../services/locationTrackingService';
import { isAccessDeniedError } from './sessionErrors';

const pendingSignOuts = new WeakMap();

/**
 * Safely signs out the current user by clearing RTDB presence, voice channel presence,
 * active hosts, push tokens, and location tracking BEFORE revoking auth credentials.
 *
 * @param {import('firebase/auth').Auth} authInstance
 * @param {{ tripId?: string, orgId?: string, localOnly?: boolean }} [activeTripContext]
 */
export const safeSignOut = (authInstance = auth, activeTripContext = {}) => {
    if (pendingSignOuts.has(authInstance)) return pendingSignOuts.get(authInstance);
    const pending = Promise.resolve().then(() => performSignOut(authInstance, activeTripContext)).finally(() => {
        pendingSignOuts.delete(authInstance);
    });
    pendingSignOuts.set(authInstance, pending);
    return pending;
};

const performSignOut = async (authInstance, activeTripContext) => {
    const user = authInstance.currentUser;
    let localOnly = activeTripContext.localOnly === true || protectedSession.isBlocked();
    const isCurrent = () => authInstance.currentUser === user;
    const endSession = () => isCurrent() ? signOut(authInstance) : Promise.resolve();
    protectedSession.invalidate();
    try { journeyWidget.clear(); } catch (_) {}
    finishEnrollment();
    const logoutTimer = setTimeout(() => {
        localOnly = true;
        endSession().catch(() => {});
    }, 1500);
    try {
        if (user && user.uid && !localOnly) {
            const uid = user.uid;
            const tripId = activeTripContext.tripId;
            const orgId = activeTripContext.orgId;

            const cleanupPromises = [];

            // 1. Clear presence for the explicitly passed trip context
            if (tripId && orgId) {
                cleanupPromises.push(
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_app_presence`), { [uid]: null }).catch(() => {}),
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_presence`), { [uid]: null }).catch(() => {}),
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/app_presence`), { [uid]: null }).catch(() => {}),
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/presence`), { [uid]: null }).catch(() => {}),
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/active_hosts`), { [uid]: null }).catch(() => {})
                );
            }

            // 2. Also check and clear current_trip in user profile if it differs
            try {
                const userSnap = await get(ref(database, `users/${uid}/current_trip`));
                const currentTripId = userSnap.val();
                if (isCurrent() && !localOnly && currentTripId && currentTripId !== tripId) {
                    const orgSnap = await get(ref(database, `trips_orgs/${currentTripId}`));
                    const currentOrgId = orgSnap.val();
                    if (isCurrent() && !localOnly && currentOrgId) {
                        cleanupPromises.push(
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_app_presence`), { [uid]: null }).catch(() => {}),
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_presence`), { [uid]: null }).catch(() => {}),
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/app_presence`), { [uid]: null }).catch(() => {}),
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence`), { [uid]: null }).catch(() => {}),
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts`), { [uid]: null }).catch(() => {})
                        );
                    }
                }
            } catch (e) {
                if (isAccessDeniedError(e)) localOnly = true;
                else console.warn("[safeSignOut] Error checking user's current trip:", e);
            }

            // Wait for RTDB presence clear to complete while still authenticated
            await Promise.all(cleanupPromises);
        }

        // 3. Stop live location tracking
        if (authInstance.currentUser && !isCurrent()) return;
        try {
            if (typeof stopLiveLocationTracking === 'function') {
                await stopLiveLocationTracking();
            }
        } catch (e) {
            console.warn("[safeSignOut] Error stopping live location tracking:", e);
        }

        // 4. Unregister push notifications
        if (authInstance.currentUser && !isCurrent()) return;
        try {
            if (typeof unregisterForPushNotificationsAsync === 'function') {
                await unregisterForPushNotificationsAsync({ localOnly: localOnly || !authInstance.currentUser });
            }
        } catch (e) {
            console.warn("[safeSignOut] Error unregistering push notifications:", e);
        }

        // 5. Clear local Firebase credentials (backend handles token revocation)
        await endSession();
    } catch (err) {
        console.warn("[safeSignOut] Error during safeSignOut flow:", err);
        // Ensure signOut is executed regardless
        await endSession();
    } finally {
        clearTimeout(logoutTimer);
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
    if (!uid || auth.currentUser?.uid !== uid) return false;
    // Let callers distinguish unavailable data from a confirmed denial.
    const access = await fetchAppAccess();
    return access.staff === true || access.expires_at > access.server_now;
};
