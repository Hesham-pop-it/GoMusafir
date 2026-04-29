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
    let deviceRef = null;
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

        unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
          if (deviceRef) {
            off(deviceRef);
            deviceRef = null;
          }

          if (user && user.emailVerified) {
            deviceRef = ref(database, `users/${user.uid}/active_device_id`);
            await set(deviceRef, currentDeviceId);

            onValue(deviceRef, (snapshot) => {
              const activeId = snapshot.val();
              if (activeId && activeId !== currentDeviceId) {
                Alert.alert("Session Ended", "This account has been logged in on another device. You have been signed out.");
                signOut(auth);
              }
            });

            const userRef = ref(database, `users/${user.uid}`);
            onValue(userRef, async (snapshot) => {
              const userData = snapshot.val() || {};
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

              if (userData.mfa_pending || mfaLock) {
                setInitialRoute("BusinessVerification");
              } else if (!isJoining) {
                if (isStaff) {
                  setInitialRoute("Home");
                } else {
                  setInitialRoute("TripOverview");
                }
              }
              
              registerForPushNotificationsAsync();
              setTimeout(() => {
                setAppIsReady(true);
              }, 300);
            });

          } else {
            setInitialRoute("Welcome");
            setAppIsReady(true);
          }
        });

      } catch (e) {
        setAppIsReady(true);
      }
    };

    prepare();
    
    return () => {
        if (unsubscribeAuth) unsubscribeAuth();
        if (deviceRef) off(deviceRef);
    };
  }, []);

  const onLayoutRootView = useCallback(async () => {}, []);

  if (!appIsReady || !fontsLoaded) {
    return null;
  }

  return (
    <LanguageProvider>
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
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background
  }
});
