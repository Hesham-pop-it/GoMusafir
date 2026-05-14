import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY_ID = 'GOMUSAFIR_CHAT_ENCRYPTION_KEY';

/**
 * Industrial-level Encryption Utility
 * Manages 256-bit keys in the device's Secure Store (Keystore/Keychain)
 */
class ChatEncryption {
    static key = null;

    /**
     * Initializes or retrieves the 256-bit encryption key from SecureStore
     */
    static async initialize() {
        if (this.key) return this.key;

        try {
            let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_ID);

            if (!key) {
                // S24: Generate a cryptographically strong 256-bit key using hardware crypto
                const randomBytes = Crypto.getRandomBytes(32);
                key = Array.from(randomBytes)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');

                await SecureStore.setItemAsync(ENCRYPTION_KEY_ID, key);
            }

            this.key = key;
            return key;
        } catch (error) {
            console.log('Failed to initialize chat encryption:', error);
            return null;
        }
    }

    /**
     * Encrypts a string using AES-256
     */
    static encrypt(text) {
        if (!this.key || !text) return text;
        try {
            return CryptoJS.AES.encrypt(text, this.key).toString();
        } catch (e) {
            return text;
        }
    }

    /**
     * Decrypts a string using AES-256
     */
    static decrypt(cipherText) {
        if (!this.key || !cipherText) return cipherText;
        try {
            const bytes = CryptoJS.AES.decrypt(cipherText, this.key);
            const originalText = bytes.toString(CryptoJS.enc.Utf8);
            return originalText || cipherText; // Fallback to cipher if decryption fails (e.g. malformed)
        } catch (e) {
            return cipherText;
        }
    }

    /**
     * Encrypts a message object's sensitive fields
     */
    static encryptMessage(msg) {
        const encrypted = { ...msg };
        if (msg.text) encrypted.text = this.encrypt(msg.text);
        if (msg.image_url) encrypted.image_url = this.encrypt(msg.image_url);
        if (msg.media_url) encrypted.media_url = this.encrypt(msg.media_url);
        if (msg.audio_url) encrypted.audio_url = this.encrypt(msg.audio_url);
        return encrypted;
    }

    /**
     * Decrypts a message object's sensitive fields
     */
    static decryptMessage(msg) {
        const decrypted = { ...msg };
        if (msg.text) decrypted.text = this.decrypt(msg.text);
        if (msg.image_url) decrypted.image_url = this.decrypt(msg.image_url);
        if (msg.media_url) decrypted.media_url = this.decrypt(msg.media_url);
        if (msg.audio_url) decrypted.audio_url = this.decrypt(msg.audio_url);
        return decrypted;
    }
}

export default ChatEncryption;
