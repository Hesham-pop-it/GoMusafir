import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreenNative from 'expo-splash-screen';
import SplashScreenCustom from './src/screens/splash/SplashScreen';
import RootNavigator from './src/navigation/RootNavigator';
import { Colors } from './src/constants/Colors';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppRootLayout from './src/components/AppRootLayout';

import { useFonts, CormorantGaramond_400Regular, CormorantGaramond_500Medium, CormorantGaramond_600SemiBold, CormorantGaramond_700Bold } from '@expo-google-fonts/cormorant-garamond';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold
} from '@expo-google-fonts/ibm-plex-sans';
import {
  Manrope_400Regular,
  Manrope_500Medium,
} from '@expo-google-fonts/manrope';

// Keep the splash screen visible while we fetch resources
SplashScreenNative.preventAutoHideAsync();

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const [fontsLoaded] = useFonts({
    'CormorantGaramond': CormorantGaramond_400Regular,
    'CormorantGaramond_Medium': CormorantGaramond_500Medium,
    'CormorantGaramond_SemiBold': CormorantGaramond_600SemiBold,
    'CormorantGaramond_Bold': CormorantGaramond_700Bold,
    'IBMPlexSans': IBMPlexSans_400Regular,
    'IBMPlexSans_Medium': IBMPlexSans_500Medium,
    'IBMPlexSans_SemiBold': IBMPlexSans_600SemiBold,
    'IBMPlexSans_Bold': IBMPlexSans_700Bold,
    'Manrope': Manrope_400Regular,
    'Manrope_Medium': Manrope_500Medium,
  });

  useEffect(() => {
    async function prepare() {
      try {
        // Pre-load fonts, make any API calls before the app is ready
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady && fontsLoaded) {
      // This tells the native splash screen to hide immediately!
      // We can then show our custom animated splash screen.
      await SplashScreenNative.hideAsync();
    }
  }, [appIsReady, fontsLoaded]);

  if (!appIsReady || !fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container} onLayout={onLayoutRootView}>
        {showSplash ? (
          <SplashScreenCustom onFinish={() => setShowSplash(false)} />
        ) : (
          <AppRootLayout>
            <RootNavigator />
          </AppRootLayout>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
});
