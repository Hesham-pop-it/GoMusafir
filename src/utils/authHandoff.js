import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, functions } from '../config/firebase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

let isHandlingHandoff = false;

/**
 * Parses and processes an auth handoff deep link URL.
 * URL format: gomusafir://auth-handoff?token=<token>
 *             https://app.gomusafir.app/auth-handoff?token=<token>
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


    try {
        let token = null;

        // 1. Try expo-linking parser
        try {
            const parsed = Linking.parse(url);
            token = parsed.queryParams?.token;
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

        if (!token) {
            console.warn('[AuthHandoff] No token found in handoff URL:', url);
            return false;
        }

        isHandlingHandoff = true;
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
            return true;
        } else {
            console.warn('[AuthHandoff] Response did not contain a custom token:', response.data);
            return false;
        }
    } catch (error) {
        console.warn('[AuthHandoff] Error during session handoff exchange:', error.message || error);
        return false;
    } finally {
        isHandlingHandoff = false;
    }
};

