import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, set, get, serverTimestamp } from 'firebase/database';
import { database, auth } from '../config/firebase';
import { AppState, Platform } from 'react-native';

export const BACKGROUND_LOCATION_TASK = 'GOMUSAFIR_BACKGROUND_LOCATION_TRACKING';
const ACTIVE_LOCATION_SYNC_KEY = '@active_location_sync';

// Local references for foreground watcher
let foregroundWatcher = null;
let appStateSubscription = null;
let currentTrackingTrip = null;

/**
 * 1. Define Background Location Task
 * Must be registered at the top level in global scope.
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
        console.log('[BackgroundLocation] TaskManager error:', error);
        return;
    }
    // A queued native task may arrive after permission was downgraded in Settings.
    if (!(await hasBackgroundLocationPermission())) {
        await stopBackgroundLocationUpdates();
        return;
    }
    if (data) {
        const { locations } = data;
        if (locations && locations.length > 0) {
            const latestLocation = locations[locations.length - 1];
            if (latestLocation?.coords) {
                await syncLocationToFirebase(latestLocation.coords);
            }
        }
    }
});

/**
 * Synchronizes coordinates to Firebase Realtime Database
 * Respects participant visibility and global trip privacy settings.
 */
async function syncLocationToFirebase(coords) {
    try {
        let userId = auth.currentUser?.uid;
        let activeTrip = currentTrackingTrip;

        if (!activeTrip || !userId) {
            const stored = await AsyncStorage.getItem(ACTIVE_LOCATION_SYNC_KEY);
            if (stored) {
                activeTrip = JSON.parse(stored);
                if (!userId && activeTrip?.userId) {
                    userId = activeTrip.userId;
                }
            }
        }

        if (!userId || !activeTrip?.tripId || !activeTrip?.orgId) {
            return;
        }

        const { orgId, tripId } = activeTrip;
        const lat = Number(coords.latitude);
        const lng = Number(coords.longitude);

        if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
            return;
        }

        // Coordinates are stored privately. The server applies field visibility
        // and accepted, expiring location grants before returning any coordinates.
        // A hidden global setting must not prevent an explicitly accepted request.
        const locationRef = ref(database, `trips_active/${orgId}/${tripId}/locations/${userId}`);
        await set(locationRef, {
            lat: lat,
            lng: lng,
            latitude: lat,
            longitude: lng,
            speed: typeof coords.speed === 'number' ? coords.speed : null,
            heading: typeof coords.heading === 'number' ? coords.heading : null,
            accuracy: typeof coords.accuracy === 'number' ? coords.accuracy : null,
            updated_at: serverTimestamp(),
        });
    } catch (err) {
        console.log('[BackgroundLocation] Failed to sync location to Firebase:', err);
    }
}

/**
 * Requests all required foreground and background location permissions.
 */
export async function requestLocationTrackingPermissions() {
    try {
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
            console.log('[BackgroundLocation] Foreground location permission denied');
            return false;
        }

        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
            console.log('[BackgroundLocation] Background location permission denied or limited:', backgroundStatus);
            // Even if background is not 'granted' immediately on some iOS versions, foreground tracking still works.
        }

        return true;
    } catch (error) {
        console.log('[BackgroundLocation] Error requesting location permissions:', error);
        return false;
    }
}

async function hasBackgroundLocationPermission() {
    try {
        const foreground = await Location.getForegroundPermissionsAsync();
        const background = await Location.getBackgroundPermissionsAsync();
        return foreground.status === 'granted' && background.status === 'granted';
    } catch (error) {
        console.log('[BackgroundLocation] Could not verify permission:', error);
        return false;
    }
}

async function stopBackgroundLocationUpdates() {
    try {
        if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
    } catch (error) {
        console.log('[BackgroundLocation] Error stopping background location updates:', error);
    }
}

async function refreshBackgroundLocationTracking() {
    // When In Use / Allow Once is foreground-only for GoMusafir. Do not rely on
    // iOS allowing a background session with a mandatory blue indicator.
    if (!(await hasBackgroundLocationPermission())) {
        await stopBackgroundLocationUpdates();
        return;
    }
    if (!currentTrackingTrip) return;

    try {
        // Reapply options to persisted tasks, including tasks from older builds.
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000,
            distanceInterval: 5,
            deferredUpdatesInterval: 4000,
            deferredUpdatesDistance: 5,
            // Apple's optional indicator for Always authorization only.
            // Required system privacy indicators remain controlled by iOS.
            showsBackgroundLocationIndicator: false,
            pausesUpdatesAutomatically: false,
            ...(Platform.OS === 'android' ? {
                // Required foreground-service notification; keep it visible.
                foregroundService: {
                    notificationTitle: "GoMusafir Live Journey",
                    notificationBody: "Sharing your live location with trip members",
                    notificationColor: "#B99A4A",
                    killServiceOnDestroy: false,
                },
            } : {}),
        });
    } catch (error) {
        console.log('[BackgroundLocation] Could not start background location updates:', error);
    }
}

/**
 * Starts continuous live location tracking (Foreground + Background Service).
 */
export async function startLiveLocationTracking(orgId, tripId) {
    if (!orgId || !tripId) return false;
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    // Do not persist or start a tracking session after foreground denial.
    if (!(await requestLocationTrackingPermissions())) {
        await stopLiveLocationTracking();
        return false;
    }

    currentTrackingTrip = { orgId, tripId, userId };

    // Persist active trip context to AsyncStorage
    await AsyncStorage.setItem(ACTIVE_LOCATION_SYNC_KEY, JSON.stringify({
        orgId,
        tripId,
        userId,
        timestamp: Date.now()
    }));

    await refreshBackgroundLocationTracking();
    await syncCurrentUserLocationNow();

    // 4. Start foreground watcher for high responsiveness when app is open
    if (!foregroundWatcher) {
        try {
            foregroundWatcher = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 3000,
                    distanceInterval: 3,
                },
                (loc) => {
                    if (loc?.coords) {
                        syncLocationToFirebase(loc.coords);
                    }
                }
            );
        } catch (e) {
            console.log('[BackgroundLocation] Foreground watcher setup error:', e);
        }
    }

    // 5. Setup AppState listener to immediately refresh location when returning to foreground
    if (!appStateSubscription) {
        appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
            if (nextAppState !== 'active' || !currentTrackingTrip) return;
            try {
                const foreground = await Location.getForegroundPermissionsAsync();
                if (foreground.status !== 'granted') {
                    await stopLiveLocationTracking();
                    return;
                }
                // Settings may have granted Always or downgraded it to When In Use.
                // Recheck without prompting again.
                await refreshBackgroundLocationTracking();
                await syncCurrentUserLocationNow();
            } catch (error) {
                console.log('[BackgroundLocation] Could not refresh tracking:', error);
            }
        });
    }

    return true;
}

/**
 * Stops live location tracking and background updates.
 */
export async function stopLiveLocationTracking() {
    currentTrackingTrip = null;
    await AsyncStorage.removeItem(ACTIVE_LOCATION_SYNC_KEY);

    if (foregroundWatcher) {
        try {
            foregroundWatcher.remove();
        } catch (e) { }
        foregroundWatcher = null;
    }

    if (appStateSubscription) {
        try {
            appStateSubscription.remove();
        } catch (e) { }
        appStateSubscription = null;
    }

    await stopBackgroundLocationUpdates();
}

/**
 * Immediately fetches the freshest high-accuracy location and syncs it.
 */
export async function syncCurrentUserLocationNow() {
    try {
        const foreground = await Location.getForegroundPermissionsAsync();
        if (foreground.status !== 'granted') return null;
        if (AppState.currentState !== 'active' && !(await hasBackgroundLocationPermission())) return null;
        const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
        });
        if (loc?.coords) {
            await syncLocationToFirebase(loc.coords);
            return loc.coords;
        }
    } catch (err) {
        console.log('[BackgroundLocation] Error getting current position now:', err);
    }
    return null;
}
