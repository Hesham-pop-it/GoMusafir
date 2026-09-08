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

        // Check global config and personal visibility settings
        try {
            const globalVisSnap = await get(ref(database, `orgs/${orgId}/trips/${tripId}/visibility_config`));
            let globalSetting = 'show to everyone';
            if (globalVisSnap.exists()) {
                const gVal = globalVisSnap.val();
                const rawGlobal = gVal?.location ?? gVal?.liveLocation ?? gVal?.live_location ?? gVal?.Location;
                if (rawGlobal) {
                    const s = String(rawGlobal).trim().toLowerCase();
                    if (s === 'do not show' || s === "don't show" || s === 'hide' || s === 'none' || s === 'hidden') {
                        globalSetting = 'do not show';
                    } else if (s === 'custom choice' || s === 'custom') {
                        globalSetting = 'custom choice';
                    } else if (s === 'show to organizer' || s === 'show to organizers' || s === 'organizers' || s === 'organizer') {
                        globalSetting = 'show to organizer';
                    } else {
                        globalSetting = 'show to everyone';
                    }
                }
            }

            // If global setting is explicitly 'do not show', do not sync
            if (globalSetting === 'do not show') {
                return;
            }

            // If global setting is 'custom choice', respect participant's personal preference
            if (globalSetting === 'custom choice') {
                const userVisSnap = await get(ref(database, `users/${userId}/participant_visibility/${tripId}/location`));
                if (userVisSnap.exists()) {
                    const setting = String(userVisSnap.val()).trim().toLowerCase();
                    if (setting === 'do not show' || setting === "don't show" || setting === 'hide' || setting === 'none' || setting === 'hidden') {
                        return;
                    }
                }
            }
        } catch (e) {
            // Proceed if non-fatal
        }

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

/**
 * Starts continuous live location tracking (Foreground + Background Service).
 */
export async function startLiveLocationTracking(orgId, tripId) {
    if (!orgId || !tripId) return false;
    const userId = auth.currentUser?.uid;
    if (!userId) return false;

    currentTrackingTrip = { orgId, tripId, userId };

    // Persist active trip context to AsyncStorage
    await AsyncStorage.setItem(ACTIVE_LOCATION_SYNC_KEY, JSON.stringify({
        orgId,
        tripId,
        userId,
        timestamp: Date.now()
    }));

    // 1. Request permissions
    await requestLocationTrackingPermissions();

    // 2. Perform immediate high-accuracy location sync
    await syncCurrentUserLocationNow();

    // 3. Start Background Location Task
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

        if (!hasStarted) {
            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 4000, // Every 4 seconds
                distanceInterval: 5, // Every 5 meters
                deferredUpdatesInterval: 4000,
                deferredUpdatesDistance: 5,
                showsBackgroundLocationIndicator: true,
                pausesLocationUpdatesAutomatically: false,
                foregroundService: {
                    notificationTitle: "GoMusafir Live Journey",
                    notificationBody: "Sharing your live location with trip members",
                    notificationColor: "#B99A4A",
                },
            });
            console.log('[BackgroundLocation] Background location updates started successfully');
        }
    } catch (err) {
        console.log('[BackgroundLocation] Could not start background location updates:', err);
    }

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
        appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'active') {
                syncCurrentUserLocationNow();
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

    try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (hasStarted) {
            await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
            console.log('[BackgroundLocation] Background location updates stopped');
        }
    } catch (e) {
        console.log('[BackgroundLocation] Error stopping background location updates:', e);
    }
}

/**
 * Immediately fetches the freshest high-accuracy location and syncs it.
 */
export async function syncCurrentUserLocationNow() {
    try {
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
