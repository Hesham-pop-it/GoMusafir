import { Alert } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, functions } from '../config/firebase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

let isHandlingHandoff = false;

let currentHandoffState = {
    isLoggingIn: false,
    source: null,
    isCreateBusiness: false,
};

const handoffListeners = new Set();

export const getAuthHandoffState = () => currentHandoffState;

export const subscribeToAuthHandoff = (listener) => {
    handoffListeners.add(listener);
    try {
        listener(currentHandoffState);
    } catch (e) {}
    return () => {
        handoffListeners.delete(listener);
    };
};

const updateHandoffState = (newState) => {
    currentHandoffState = { ...currentHandoffState, ...newState };
    handoffListeners.forEach((listener) => {
        try {
            listener(currentHandoffState);
        } catch (e) {
            console.warn('[AuthHandoff] Error in handoff listener:', e);
        }
    });
};

/**
 * Parses and processes an auth handoff deep link URL.
 * URL format: gomusafir://auth-handoff?token=<token>&source=<source>
 *             https://app.gomusafir.app/auth-handoff?token=<token>&source=<source>
 * 
 * @param {string} url - The incoming deep link URL
 * @returns {Promise<boolean>} True if the handoff token was successfully exchanged and signed in
 */
export const handleAuthHandoffUrl = async (url) => {
    if (!url || typeof url !== 'string') return false;

    // Check if the URL matches the auth handoff pattern
    const isHandoffUrl = url.includes('auth-handoff') || url.includes('auth/handoff') || (url.includes('token=') && url.includes('gomusafir://'));
    if (!isHandoffUrl) return false;

    // Dismiss the in-app browser immediately so the native app becomes visible
    try {
        await WebBrowser.dismissBrowser();
    } catch (dismissErr) {
        console.warn('[AuthHandoff] Error dismissing in-app browser:', dismissErr);
    }

    if (isHandlingHandoff) {
        console.log('[AuthHandoff] Already handling a handoff request, skipping duplicate.');
        return false;
    }
    isHandlingHandoff = true;

    try {
        let token = null;
        let source = null;

        // 1. Try expo-linking parser
        try {
            const parsed = Linking.parse(url);
            token = parsed.queryParams?.token;
            source = parsed.queryParams?.source;
        } catch (parseErr) {
            console.warn('[AuthHandoff] Linking.parse failed:', parseErr);
        }

        // 2. Fallback regex extraction
        if (!token && url.includes('token=')) {
            const match = url.match(/[?&]token=([^&#]+)/);
            if (match) {
                token = decodeURIComponent(match[1]);
            }
        }
        if (!source && url.includes('source=')) {
            const match = url.match(/[?&]source=([^&#]+)/);
            if (match) {
                source = decodeURIComponent(match[1]);
            }
        }

        if (!token) {
            console.warn('[AuthHandoff] No token found in handoff URL:', url);
            isHandlingHandoff = false;
            return false;
        }

        const isCreateBusiness = source === 'create_business' || source === 'create-business' || source === 'create_account';

        updateHandoffState({
            isLoggingIn: true,
            source,
            isCreateBusiness,
        });

        // Give alert that we are logging you in ONLY when pressing "open the app" from create a business account
        if (isCreateBusiness) {
            setTimeout(() => {
                Alert.alert(
                    "Logging In",
                    "We are logging you in...",
                    [{ text: "OK" }],
                    { cancelable: false }
                );
            }, 150);
        }

        console.log('[AuthHandoff] Exchanging session handoff token with Cloud Functions...');

        // Clear any stale local MFA lock
        await AsyncStorage.multiRemove(['mfa_lock']).catch(() => {});

        const exchangeAuthHandoff = httpsCallable(functions, 'exchangeAuthHandoffToken');
        const response = await exchangeAuthHandoff({ token });

        const customToken = response.data?.customToken;
        if (customToken) {
            console.log('[AuthHandoff] Custom token received, signing in via Firebase Auth...');
            // Ensure local MFA lock is cleared before signing in
            await AsyncStorage.multiRemove(['mfa_lock']).catch(() => {});
            
            const userCredential = await signInWithCustomToken(auth, customToken);
            console.log('[AuthHandoff] ✅ Successfully authenticated via session handoff for UID:', userCredential.user?.uid);

            // Sync user data & reload to ensure emailVerified status is reflected locally
            await userCredential.user?.reload().catch(() => {});
            await AsyncStorage.multiRemove(['mfa_lock']).catch(() => {});

            // Direct auto-navigation to Home screen for business account creation
            const { navigationRef } = require('../navigation/RootNavigator');
            if (navigationRef?.isReady()) {
                navigationRef.reset({
                    index: 0,
                    routes: [{ name: 'Home' }]
                });
            }

            return true;
        } else {
            console.warn('[AuthHandoff] Response did not contain a custom token:', response.data);
            updateHandoffState({ isLoggingIn: false, source: null, isCreateBusiness: false });
            return false;
        }
    } catch (error) {
        console.warn('[AuthHandoff] Error during session handoff exchange:', error.message || error);
        updateHandoffState({ isLoggingIn: false, source: null, isCreateBusiness: false });
        if (url.includes('create_business') || url.includes('create-business')) {
            Alert.alert("Login Failed", "Unable to log in automatically. Please log in with your credentials.");
        }
        return false;
    } finally {
        isHandlingHandoff = false;
        // Keep state disabled until navigation transition completes or safety timeout
        setTimeout(() => {
            updateHandoffState({ isLoggingIn: false, source: null, isCreateBusiness: false });
        }, 5000);
    }
};

