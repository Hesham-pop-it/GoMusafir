// LiveKit requires browser globals (Event, EventTarget, WebRTC, URL etc.)
// that React Native doesn't have. registerGlobals() must be called first.
import { registerGlobals } from '@livekit/react-native';
registerGlobals();

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TextInput, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreenNative from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SplashScreenCustom from './src/screens/splash/SplashScreen';
import RootNavigator, { navigationRef } from './src/navigation/RootNavigator';
import AppRootLayout from './src/components/AppRootLayout';
import TemplateAlertPopup from './src/components/TemplateAlertPopup';
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
    let currentDeviceId = null;

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

        if (auth) {
          unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (unsubscribeDevice) {
              unsubscribeDevice();
              unsubscribeDevice = null;
            }
            if (unsubscribeUser) {
              unsubscribeUser();
              unsubscribeUser = null;
            }

            if (user && !user.emailVerified) {
              try {
                await user.reload();
              } catch (reloadErr) {
                console.log("[App] user.reload error:", reloadErr?.message);
              }
            }

            const idTokenResultInitial = user ? await user.getIdTokenResult().catch(() => null) : null;
            const isVerifiedUser = user && (user.emailVerified || idTokenResultInitial?.claims?.email_verified || idTokenResultInitial?.claims?.handoff);

            if (isVerifiedUser) {
              if (!currentDeviceId) {
                currentDeviceId = await getDeviceId();
              }
              const deviceRef = ref(database, `users/${user.uid}/active_device_id`);

              // Guard flags to prevent multiple simultaneous forced sign-out attempts
              let isForceSigningOut = false;
              let hasConfirmedSession = false;

              await set(deviceRef, currentDeviceId);
              hasConfirmedSession = true;

              unsubscribeDevice = onValue(deviceRef, (snapshot) => {
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
              unsubscribeUser = onValue(userRef, async (snapshot) => {
                try {
                  const userData = snapshot.val() || {};
                  
                  if (!snapshot.exists()) {
                    return;
                  }

                  const idTokenResult = await user.getIdTokenResult(true);
                  const role = idTokenResult.claims.role || 'participant';
                  const isStaff = role === 'admin' || role === 'co-host' || role === 'manager' || !!userData.staff_org_id;
                  
                  const joinSnap = await get(ref(database, `users/${user.uid}/join_flow_status`));
                  let isJoining = joinSnap.exists() && joinSnap.val()?.isJoining === true;
                  const mfaLock = await AsyncStorage.getItem('mfa_lock');

                  const invitationCode = joinSnap.val()?.invitationCode;
                  if (isJoining && !invitationCode && !userData.mfa_pending && !mfaLock && (isStaff || Object.keys(userData?.joined_trips ?? {}).length > 0)) {
                    await set(ref(database, `users/${user.uid}/join_flow_status/isJoining`), false);
                    isJoining = false;
                  }

                  // Participant Trip Access Check: Non-staff users must have a valid active trip
                  if (!isStaff && !isJoining && !userData.mfa_pending && !mfaLock) {
                    const hasActiveTrip = await hasValidActiveTrip(user.uid);
                    if (!hasActiveTrip && !isForceSigningOut) {
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
                        setInitialRoute("Welcome");
                        setAppIsReady(true);
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

                  if (!appIsReady) {
                    setInitialRoute(targetScreen);
                  }

                  if (navigationRef.isReady()) {
                    const currentRoute = navigationRef.getCurrentRoute()?.name;
                    if (currentRoute === "Welcome" || currentRoute === "Login" || currentRoute === "Signup") {
                      navigationRef.reset({
                        index: 0,
                        routes: [{ name: targetScreen }]
                      });
                    }
                  }
                  
                  setTimeout(() => {
                    setAppIsReady(true);
                  }, 300);
                } catch (error) {
                  console.warn("[App] Error in user data listener:", error);
                  setAppIsReady(true);
                }
              }, (err) => {
                console.log("[App] userRef error:", err?.message);
                setAppIsReady(true);
              });

            } else {
              if (!appIsReady) {
                setInitialRoute("Welcome");
              }
              setAppIsReady(true);
              if (navigationRef.isReady()) {
                const currentRoute = navigationRef.getCurrentRoute()?.name;
                if (currentRoute && currentRoute !== "Welcome" && currentRoute !== "Login" && currentRoute !== "BusinessLogin" && currentRoute !== "Signup") {
                  navigationRef.reset({
                    index: 0,
                    routes: [{ name: "Welcome" }]
                  });
                }
              }
            }
          });
        } else {
          console.warn("[App] Firebase Auth not initialized. Defaulting to Welcome screen.");
          setInitialRoute("Welcome");
          setAppIsReady(true);
        }

      } catch (e) {
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
        clearTimeout(fallbackTimer);
        if (unsubscribeAuth) unsubscribeAuth();
        if (unsubscribeDevice) unsubscribeDevice();
        if (unsubscribeUser) unsubscribeUser();
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
              <RootNavigator initialRouteName={initialRoute} />
              <TemplateAlertPopup />
            </AppRootLayout>
          
        </View>
      </SafeAreaProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background
  }
});
