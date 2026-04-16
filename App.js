import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TextInput, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreenNative from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SplashScreenCustom from './src/screens/splash/SplashScreen';
import RootNavigator from './src/navigation/RootNavigator';
import AppRootLayout from './src/components/AppRootLayout';
import { Colors } from './src/constants/Colors';
import { auth, database } from './src/config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, set, onValue, off, get } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { registerForPushNotificationsAsync } from './src/services/notificationService';

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
    // Cormorant
    CormorantGaramond: CormorantGaramond_400Regular,
    CormorantGaramond_Medium: CormorantGaramond_500Medium,
    CormorantGaramond_SemiBold: CormorantGaramond_600SemiBold,
    CormorantGaramond_Bold: CormorantGaramond_700Bold,

    // IBM Plex Sans (default)
    IBMPlexSans: IBMPlexSans_400Regular,
    IBMPlexSans_Medium: IBMPlexSans_500Medium,
    IBMPlexSans_SemiBold: IBMPlexSans_600SemiBold,
    IBMPlexSans_Bold: IBMPlexSans_700Bold,

    // Manrope
    Manrope: Manrope_400Regular,
    Manrope_Medium: Manrope_500Medium
  });

  useEffect(() => {
    let unsubscribeAuth;
    let deviceRef = null;
    let currentDeviceId = null;

    const getDeviceId = async () => {
      let id = await AsyncStorage.getItem('device_id');
      console.log("[App] Retrieved Device ID:", id);
      if (!id) {
        id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await AsyncStorage.setItem('device_id', id);
        console.log("[App] Generated New Device ID:", id);
      }
      return id;
    };

    const prepare = async () => {
      try {
        currentDeviceId = await getDeviceId();

        // We wait for Firebase auth state to resolve to determine the initial route
        unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
          console.log("[App] Auth State Changed. User:", user ? user.uid : "null", "Verified:", user?.emailVerified);
          // Cleanup previous listener if any
          if (deviceRef) {
            off(deviceRef);
            deviceRef = null;
          }

          if (user && user.emailVerified) {
            deviceRef = ref(database, `users/${user.uid}/active_device_id`);
            
            // Register this device as the active one
            await set(deviceRef, currentDeviceId);

            // Listen for takeovers
            onValue(deviceRef, (snapshot) => {
              const activeId = snapshot.val();
              console.log("[App] Active Device Validation:", { activeId, currentDeviceId });
              if (activeId && activeId !== currentDeviceId) {
                console.log("Session hijacked by another device! Signing out.");
                Alert.alert("Session Ended", "This account has been logged in on another device. You have been signed out.");
                signOut(auth);
              }
            });

            // S6/S22: Check Custom Claims (Role) before deciding the initial route to prevent flickering
            const idTokenResult = await user.getIdTokenResult(true);
            const role = idTokenResult.claims.role || 'participant';

            // Check if we should skip the Home/Overview redirect (e.g. during active Join flow)
            const userSnap = await get(ref(database, `users/${user.uid}`));
            const userData = userSnap.val() || {};
            
            const joinSnap = await get(ref(database, `users/${user.uid}/join_flow_status`));
            let isJoining = joinSnap.exists() && joinSnap.val()?.isJoining === true;

            // Self-repair: If they are marked as joining but already have trips or are staff, clear the flag
            if (isJoining && (role === 'admin' || Object.keys(userData?.joined_trips ?? {}).length > 0)) {
              console.log("[App] Self-repair: User already onboarded but flag stuck. Clearing.");
              await set(ref(database, `users/${user.uid}/join_flow_status/isJoining`), false);
              isJoining = false;
            }

            if (!isJoining) {
              console.log("[App] Persistence check - role:", role, "uid:", user.uid);
              if (role === 'admin') {
                setInitialRoute("Home");
              } else {
                setInitialRoute("TripOverview");
              }
              registerForPushNotificationsAsync();
            } else {
              console.log("[App] User in Join Flow, keeping Welcome/Join as base.");
            }

          } else {
            console.log("[App] No authenticated user found or email not verified.");
            setInitialRoute("Welcome");
          }
          
          setTimeout(() => {
            setAppIsReady(true);
          }, 300); // slight delay to let state settle
        });

      } catch (e) {
        console.warn(e);
        setAppIsReady(true); // Don't block app if auth fails
      }
    };

    prepare();
    
    return () => {
        if (unsubscribeAuth) unsubscribeAuth();
        if (deviceRef) off(deviceRef);
    };
  }, []);

  const onLayoutRootView = useCallback(async () => {
    // We handle hiding the splash screen inside the custom SplashScreen component
    // to ensure a seamless transition without flicker.
  }, []);

  if (!appIsReady || !fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container} onLayout={onLayoutRootView}>
        <StatusBar style="light" />
        {showSplash ? (
          <SplashScreenCustom onFinish={() => setShowSplash(false)} />
        ) : (
          <AppRootLayout>
            <RootNavigator key={initialRoute} initialRouteName={initialRoute} />
          </AppRootLayout>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background
  }
});
