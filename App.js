import { isEnrolling } from './src/utils/enrollmentSession';
import { watchParticipantAccess, onAppAccessPublished } from './src/utils/participantAccess';
// LiveKit requires browser globals (Event, EventTarget, WebRTC, URL etc.)
// that React Native doesn't have. registerGlobals() must be called first.
import { registerGlobals } from '@livekit/react-native';
registerGlobals();

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TextInput, Alert, AppState, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreenNative from 'expo-splash-screen';
import * as Network from 'expo-network';
import { isAuthenticationError, isNetworkOffline } from './src/utils/sessionErrors';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SplashScreenCustom from './src/screens/splash/SplashScreen';
import RootNavigator, { navigationRef } from './src/navigation/RootNavigator';
import AppRootLayout from './src/components/AppRootLayout';
import TemplateAlertPopup from './src/components/TemplateAlertPopup';
import CompatModal from './src/components/CompatModal';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from './src/constants/Colors';
import { auth, database } from './src/config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, set, onValue, off, get } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { handleAuthHandoffUrl } from './src/utils/authHandoff';
import { safeSignOut, hasValidActiveTrip } from './src/utils/authUtils';

import { registerForPushNotificationsAsync, unregisterForPushNotificationsAsync } from './src/services/notificationService';
import { LanguageProvider } from './src/context/LanguageContext';

import {
  useFonts,
  CormorantGaramond_400Regular,
  CormorantGaramond_500Medium,
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold
} from '@expo-google-fonts/cormorant-garamond';

import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold
} from '@expo-google-fonts/ibm-plex-sans';

import {
  Manrope_400Regular,
  Manrope_500Medium
} from '@expo-google-fonts/manrope';

SplashScreenNative.preventAutoHideAsync();

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [offline, setOffline] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [initialRoute, setInitialRoute] = useState("Welcome");

  const [fontsLoaded] = useFonts({
    CormorantGaramond: CormorantGaramond_400Regular,
    CormorantGaramond_Medium: CormorantGaramond_500Medium,
    CormorantGaramond_SemiBold: CormorantGaramond_600SemiBold,
    CormorantGaramond_Bold: CormorantGaramond_700Bold,

    IBMPlexSans: IBMPlexSans_400Regular,
    IBMPlexSans_Medium: IBMPlexSans_500Medium,
    IBMPlexSans_SemiBold: IBMPlexSans_600SemiBold,
    IBMPlexSans_Bold: IBMPlexSans_700Bold,

    Manrope: Manrope_400Regular,
    Manrope_Medium: Manrope_500Medium
  });

  useEffect(() => {
    let unsubscribeAuth;
    let unsubscribeDevice = null;
    let unsubscribeUser = null;
    let unsubscribeAccess = null;
    let unsubscribeAccessPublished = null;
    let currentDeviceId = null;
    let disposed = false;
    let generation = 0;
    let retrySession = () => {};
    let retryNeeded = true;
    let deviceClaimedFor = null;
    let offlineDetected = false;
    let networkRevision = 0;
    const confirmConnection = () => {
      if (disposed) return;
      // A live backend connection or forced token refresh is stronger evidence
      // than a cached OS reachability result. Invalidate older pending probes.
      networkRevision++;
      offlineDetected = false;
      setOffline(false);
    };
    const resolveSession = route => {
      setInitialRoute(route);
      setSessionResolved(true);
      setSyncFailed(false);
      setAppIsReady(true);
      retryNeeded = false;
    };
    const handleSessionError = (error, user) => {
      if (disposed || auth.currentUser !== user) return;
      if (isAuthenticationError(error)) {
        signOut(auth).catch(err => console.warn('[App] Sign out failed:', err));
      } else {
        retryNeeded = true;
        setSyncFailed(true);
        setAppIsReady(true);
      }
    };
    const updateNetwork = state => {
      if (disposed) return;
      networkRevision++;
      offlineDetected = isNetworkOffline(state);
      setOffline(offlineDetected);
      if (offlineDetected) {
        retryNeeded = true;
        setAppIsReady(true);
      } else retrySession();
    };
    const checkNetwork = async () => {
      const revision = networkRevision;
      try {
        const state = await Network.getNetworkStateAsync();
        if (!disposed && revision === networkRevision) updateNetwork(state);
      } catch (_) {
        // An OS reachability failure is not an authentication failure.
      }
    };
    const networkSubscription = Network.addNetworkStateListener(updateNetwork);
    checkNetwork();
    let wasConnected = false;
    const connectionSubscription = database ? onValue(ref(database, '.info/connected'), snapshot => {
      if (disposed) return;
      if (snapshot.val() === true) {
        wasConnected = true;
        confirmConnection();
        retrySession();
      } else if (wasConnected) {
        // Wi-Fi can remain attached while internet/backend access disappears.
        retryNeeded = true;
        setSyncFailed(true);
      }
    }) : () => {};
    const foregroundSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        checkNetwork();
        retrySession();
      }
    });
    // Also retry when a service recovers without a network-interface change.
    const retryTimer = setInterval(() => {
      if (offlineDetected || retryNeeded) {
        checkNetwork();
        // Try the backend even if the OS still reports offline. Its network
        // event may have been missed or its reachability value may be stale.
        retrySession();
      }
    }, 15000);

    const getDeviceId = async () => {
      let id = await AsyncStorage.getItem('device_id');
      if (!id) {
        id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await AsyncStorage.setItem('device_id', id);
      }
      return id;
    };

    const prepare = async () => {
      try {
        currentDeviceId = await getDeviceId();

        // S15: Check if app was opened via auth-handoff deep link (cold start)
        try {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl && (initialUrl.includes('auth-handoff') || initialUrl.includes('auth/handoff') || (initialUrl.includes('token=') && initialUrl.includes('gomusafir://')))) {
            console.log('[App] Detected initial auth-handoff URL:', initialUrl);
            await handleAuthHandoffUrl(initialUrl);
          }
        } catch (handoffErr) {
          console.warn('[App] Initial auth-handoff processing failed:', handoffErr);
        }

        if (disposed) return;
        if (auth) {
          const restoreSession = async (user) => {
            const run = ++generation;
            const isCurrent = () => !disposed && run === generation && auth.currentUser === user;
            let restoring = true;
            retrySession = () => { if (!restoring) restoreSession(auth.currentUser); };
            try {
              if (unsubscribeAccess) { unsubscribeAccess(); unsubscribeAccess = null; }
              if (unsubscribeDevice) {
                unsubscribeDevice();
                unsubscribeDevice = null;
              }
              if (unsubscribeUser) {
                unsubscribeUser();
                unsubscribeUser = null;
              }

              if (user && !user.emailVerified) {
                await user.reload();
              }

              const idTokenResultInitial = user ? await user.getIdTokenResult() : null;
              if (!isCurrent()) return;
              const isVerifiedUser = user && (user.emailVerified || idTokenResultInitial?.claims?.email_verified || idTokenResultInitial?.claims?.handoff);

              if (isVerifiedUser) {
                if (!currentDeviceId) {
                  currentDeviceId = await getDeviceId();
                }
                if (!isCurrent()) return;
                const deviceRef = ref(database, `users/${user.uid}/active_device_id`);

                // Guard flags to prevent multiple simultaneous forced sign-out attempts
                let isForceSigningOut = false;
                let hasConfirmedSession = false;
                let previousAccessTrip = null;
                unsubscribeAccess = watchParticipantAccess(user, () => {
                  if (!isCurrent() || isForceSigningOut) return;
                  isForceSigningOut = true;
                  // Hide protected screens immediately, before network cleanup.
                  if (navigationRef.isReady()) navigationRef.reset({ index: 0, routes: [{ name: 'Welcome' }] });
                  resolveSession('Welcome');
                  safeSignOut(auth).catch(error => console.warn('Access logout failed:', error));
                  Alert.alert('Trip Access Ended', 'Your trip has ended or your access has been revoked. Join a valid trip to use the app again.');
                }, access => {
                  if (!isCurrent()) return;
                  const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : null;
                  const displayedTrip = route?.params?.tripId || previousAccessTrip;
                  previousAccessTrip = access.current_trip;
                  if (!isEnrolling() && displayedTrip && !access.trips?.[displayedTrip] && access.current_trip) {
                    navigationRef.reset({ index: 0, routes: [{ name: 'TripOverview', params: { tripId: access.current_trip, isAdmin: false } }] });
                  }
                });

                // RTDB writes stay pending offline. Never block authentication
                // restoration on their server acknowledgement.
                if (deviceClaimedFor !== user.uid) {
                  deviceClaimedFor = user.uid;
                  set(deviceRef, currentDeviceId).catch(error => {
                    if (isCurrent()) handleSessionError(error, user);
                  });
                }

                unsubscribeDevice = onValue(deviceRef, (snapshot) => {
                  if (!isCurrent()) return;
                  const activeId = snapshot.val();
                  if (activeId === currentDeviceId) {
                    hasConfirmedSession = true;
                  } else if (activeId && activeId !== currentDeviceId && hasConfirmedSession && !isForceSigningOut) {
                    isForceSigningOut = true;

                    if (unsubscribeDevice) {
                      unsubscribeDevice();
                      unsubscribeDevice = null;
                    }

                    Alert.alert(
                      "Session Ended",
                      "This account has been signed in on another device. You have been signed out.",
                      [{ text: "OK" }],
                      { cancelable: false }
                    );

                    AsyncStorage.multiRemove(['mfa_lock']).catch(() => {});

                    safeSignOut(auth).catch(err => {
                      console.warn("Auto sign out failed:", err);
                      setInitialRoute("Welcome");
                      setAppIsReady(true);
                    });
                  }
                }, (err) => {
                  console.log("[App] deviceRef error:", err?.message);
                });

                registerForPushNotificationsAsync(user);

                const userRef = ref(database, `users/${user.uid}`);
                let latestSnapshot;
                let refreshing = false;
                let refreshAgain = false;
                const refreshUser = async (snapshot = latestSnapshot) => {
                  if (!isCurrent() || !snapshot) return;
                  latestSnapshot = snapshot;
                  if (refreshing) { refreshAgain = true; return; }
                  refreshing = true;
                  try {
                    const userData = snapshot.val() || {};

                    if (!snapshot.exists()) {
                      retryNeeded = true;
                      setSyncFailed(true);
                      setAppIsReady(true);
                      return;
                    }

                    const idTokenResult = await user.getIdTokenResult(true);
                    if (!isCurrent() || isForceSigningOut) return;
                    confirmConnection();
                    const role = idTokenResult.claims.role || 'participant';
                    const isStaff = role === 'admin' || role === 'co-host' || role === 'manager';

                    const joinSnap = await get(ref(database, `users/${user.uid}/join_flow_status`));
                    let isJoining = joinSnap.exists() && joinSnap.val()?.isJoining === true;
                    const mfaLock = await AsyncStorage.getItem('mfa_lock');

                    if (!isCurrent() || isForceSigningOut) return;
                    const invitationCode = joinSnap.val()?.invitationCode;
                    if (isJoining && !invitationCode && !userData.mfa_pending && !mfaLock && (isStaff || Object.keys(userData?.joined_trips ?? {}).length > 0)) {
                      await set(ref(database, `users/${user.uid}/join_flow_status/isJoining`), false);
                      isJoining = false;
                    }

                    // Participant Trip Access Check: Non-staff users must have a valid active trip
                    if (!isStaff && !isEnrolling() && !isJoining && !userData.mfa_pending && !mfaLock) {
                      const hasActiveTrip = await hasValidActiveTrip(user.uid);
                      if (!isCurrent() || isForceSigningOut) return;
                      if (!hasActiveTrip) {
                        isForceSigningOut = true;

                        if (unsubscribeUser) {
                          unsubscribeUser();
                          unsubscribeUser = null;
                        }

                        Alert.alert(
                          "Trip Ended",
                          "Your trip has ended or you are no longer part of an active trip. You have been logged out.",
                          [{ text: "OK" }],
                          { cancelable: false }
                        );

                        AsyncStorage.multiRemove(['mfa_lock']).catch(() => {});

                        safeSignOut(auth).catch(err => {
                          console.warn("Participant auto sign out failed:", err);
                        }).finally(() => {
                          resolveSession("Welcome");
                          if (navigationRef.isReady()) {
                            navigationRef.reset({
                              index: 0,
                              routes: [{ name: "Welcome" }]
                            });
                          }
                        });
                        return;
                      }
                    }

                    // Account creation emits auth/user snapshots before OTP setup
                    // finishes. The invitation flow owns the mounted navigator;
                    // never resolve Home/TripOverview from these intermediate states.
                    if (isEnrolling() && navigationRef.isReady()) return;

                    let targetScreen = "Welcome";
                    if (userData.mfa_pending || mfaLock) {
                      targetScreen = "BusinessVerification";
                    } else if (!isJoining) {
                      if (isStaff) {
                        targetScreen = "Home";
                      } else {
                        targetScreen = "TripOverview";
                      }
                    }

                    if (!isCurrent() || isForceSigningOut) return;
                    resolveSession(targetScreen);

                    if (navigationRef.isReady()) {
                      const currentRoute = navigationRef.getCurrentRoute()?.name;
                      if (currentRoute === "Welcome" || currentRoute === "Login" || currentRoute === "Signup") {
                        navigationRef.reset({
                          index: 0,
                          routes: [{ name: targetScreen }]
                        });
                      }
                    }


                  } catch (error) {
                    console.warn("[App] Error in user data listener:", error);
                    if (isCurrent()) handleSessionError(error, user);
                  } finally {
                    refreshing = false;
                    if (refreshAgain && isCurrent()) {
                      refreshAgain = false;
                      refreshUser();
                    }
                  }
                };
                let fetchingProfile = false;
                retrySession = async () => {
                  if (!isCurrent() || fetchingProfile) return;
                  fetchingProfile = true;
                  try {
                    await refreshUser(await get(userRef));
                  } catch (error) {
                    if (isCurrent()) handleSessionError(error, user);
                  } finally {
                    fetchingProfile = false;
                  }
                };
                unsubscribeUser = onValue(userRef, refreshUser, error => {
                  if (isCurrent()) handleSessionError(error, user);
                });

              } else {
                deviceClaimedFor = null;
                retrySession = () => {};
                resolveSession("Welcome");
                if (navigationRef.isReady() && !(user && isEnrolling())) {
                  const currentRoute = navigationRef.getCurrentRoute()?.name;
                  if (currentRoute && currentRoute !== "Welcome" && currentRoute !== "Login" && currentRoute !== "BusinessLogin" && currentRoute !== "Signup") {
                    navigationRef.reset({
                      index: 0,
                      routes: [{ name: "Welcome" }]
                    });
                  }
                }
              }
            } catch (error) {
              if (isCurrent()) handleSessionError(error, user);
            } finally {
              restoring = false;
            }
          };
          // Email verification/reload does not necessarily emit an auth-state
          // change. A confirmed join must initialize global listeners immediately.
          unsubscribeAccessPublished = onAppAccessPublished(uid => {
            if (!disposed && auth.currentUser?.uid === uid) restoreSession(auth.currentUser);
          });
          unsubscribeAuth = onAuthStateChanged(auth, user => {
            // Keep an already-mounted navigator alive: sign-in handlers may
            // still be completing MFA/enrollment when Firebase emits a user.
            restoreSession(user);
          });
        } else {
          console.warn("[App] Firebase Auth not initialized.");
          setSyncFailed(true);
          setAppIsReady(true);
        }

      } catch (e) {
        setSyncFailed(true);
        setAppIsReady(true);
      }
    };

    prepare();

    // S15: Runtime deep link listener (warm start while app is open)
    const handleRuntimeDeepLink = (event) => {
      try {
        WebBrowser.dismissBrowser();
      } catch (e) {}

      if (event?.url && (event.url.includes('auth-handoff') || event.url.includes('auth/handoff') || (event.url.includes('token=') && event.url.includes('gomusafir://')))) {
        console.log('[App] Received runtime auth-handoff URL:', event.url);
        handleAuthHandoffUrl(event.url);
      }
    };

    const linkingSubscription = Linking.addEventListener('url', handleRuntimeDeepLink);
    
    // Fallback safety timeout so app never hangs indefinitely on splash
    const fallbackTimer = setTimeout(() => {
      setAppIsReady(true);
    }, 4000);

    return () => {
        disposed = true;
        generation++;
        clearInterval(retryTimer);
        networkSubscription.remove();
        connectionSubscription();
        foregroundSubscription.remove();
        clearTimeout(fallbackTimer);
        if (unsubscribeAuth) unsubscribeAuth();
        if (unsubscribeAccessPublished) unsubscribeAccessPublished();
        if (unsubscribeDevice) unsubscribeDevice();
        if (unsubscribeUser) unsubscribeUser();
        if (unsubscribeAccess) unsubscribeAccess();
        if (linkingSubscription) linkingSubscription.remove();
    };

  }, []);

  useEffect(() => {
    if (appIsReady && fontsLoaded) {
      SplashScreenNative.hideAsync().catch((e) => {
        console.warn('[App] Error hiding native splash screen:', e);
      });
    }
  }, [appIsReady, fontsLoaded]);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady && fontsLoaded) {
      try {
        await SplashScreenNative.hideAsync();
      } catch (e) {
        console.warn('[App] Error hiding splash screen on layout:', e);
      }
    }
  }, [appIsReady, fontsLoaded]);

  if (!appIsReady || !fontsLoaded) {
    return null;
  }

  return (
    <LanguageProvider>
      <SafeAreaProvider>
        <View style={styles.container} onLayout={onLayoutRootView}>
          <StatusBar style="light" />

            <AppRootLayout>
              {sessionResolved && <RootNavigator initialRouteName={initialRoute} />}
              {sessionResolved && <TemplateAlertPopup />}
              {!sessionResolved && !offline && !syncFailed && (
                <View style={styles.connectionState} accessibilityLiveRegion="polite">
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text style={styles.connectionTitle}>Restoring your session</Text>
                  <Text style={styles.connectionMessage}>Please wait while we load your account.</Text>
                </View>
              )}
              <CompatModal
                isVisible={offline || syncFailed}
                animationIn="zoomIn"
                backdropOpacity={0.65}
                style={styles.connectionModal}
              >
                <View style={styles.connectionCard} accessibilityViewIsModal accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <View style={styles.connectionIcon}>
                    <Ionicons name="cloud-offline-outline" size={32} color={Colors.dark.primary} />
                  </View>
                  <Text style={styles.connectionTitle}>
                    {offline ? 'No internet connection' : 'Unable to connect'}
                  </Text>
                  <Text style={styles.connectionMessage}>
                    An internet connection is required to load or update online features.
                  </Text>
                  {auth?.currentUser && (
                    <Text style={styles.connectionMessage}>Your sign-in is saved. You don’t need to log in again.</Text>
                  )}
                  <View style={styles.reconnectStatus}>
                    <ActivityIndicator size="small" color={Colors.dark.primary} />
                    <Text style={styles.reconnectText}>Reconnecting automatically…</Text>
                  </View>
                </View>
              </CompatModal>
            </AppRootLayout>
          
        </View>
      </SafeAreaProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  connectionModal: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  connectionCard: {
    width: '100%',
    maxWidth: 400,
    padding: 28,
    borderRadius: 24,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
  },
  connectionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#B99A4A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reconnectStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 24, gap: 10 },
  reconnectText: { color: Colors.dark.textSecondary, fontSize: 13, flexShrink: 1 },
  connectionState: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    zIndex: 100,
  },
  connectionTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', textAlign: 'center', marginTop: 20 },
  connectionMessage: { color: '#D1D5DB', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 16 },
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background
  }
});
