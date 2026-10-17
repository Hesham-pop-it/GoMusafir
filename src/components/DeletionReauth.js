import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../config/firebase';
import { useLanguage } from '../context/LanguageContext';
import { Typography } from '../constants/Typography';

// Re-confirms the signed-in person before a deletion: a password for staff,
// an emailed code for people who have no password (participants).
// Calls onVerified() once the server will accept the deletion request.
const DeletionReauth = ({ method, onVerified, disabled, confirmLabel }) => {
    const { t } = useLanguage();
    const [secret, setSecret] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [busy, setBusy] = useState(false);

    const fail = (e) => {
        console.warn('[Deletion reauth]', e?.code || e?.message);
        Alert.alert(t('del_acc_title'), e?.message && e?.code?.startsWith('functions/') ? e.message : t('del_acc_reauth_failed'));
    };

    const confirmPassword = async () => {
        setBusy(true);
        try {
            const user = auth.currentUser;
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, secret));
            // Refresh the token so the server sees the new auth_time.
            await user.getIdToken(true);
            await onVerified();
        } catch (e) { fail(e); } finally { setBusy(false); }
    };

    const sendCode = async () => {
        setBusy(true);
        try {
            const user = auth.currentUser;
            await httpsCallable(functions, 'sendCustomEmailOTP')({ email: user.email, uid: user.uid, isMobile: true });
            setCodeSent(true);
        } catch (e) { fail(e); } finally { setBusy(false); }
    };

    const confirmCode = async () => {
        setBusy(true);
        try {
            await httpsCallable(functions, 'verifyCustomEmailOTP')({ uid: auth.currentUser.uid, otp: secret, purpose: 'delete_account' });
            await onVerified();
        } catch (e) { fail(e); } finally { setBusy(false); }
    };

    const isPassword = method === 'password';
    const showInput = isPassword || codeSent;
    const off = disabled || busy || (showInput && !secret);

    return (
        <View>
            {!isPassword && !codeSent ? <Text style={styles.hint}>{t('del_acc_code_hint')}</Text> : null}
            {showInput ? (
                <>
                    <Text style={styles.label}>{isPassword ? t('del_acc_password_label') : t('del_acc_code_label')}</Text>
                    <TextInput
                        style={styles.input}
                        value={secret}
                        onChangeText={setSecret}
                        secureTextEntry={isPassword}
                        keyboardType={isPassword ? 'default' : 'number-pad'}
                        maxLength={isPassword ? 128 : 6}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholderTextColor="#71717A"
                    />
                </>
            ) : null}
            <TouchableOpacity
                style={[styles.button, off && { opacity: 0.5 }]}
                disabled={off}
                onPress={isPassword ? confirmPassword : (codeSent ? confirmCode : sendCode)}
            >
                {busy ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.buttonText}>
                        {isPassword || codeSent ? (confirmLabel || t('del_acc_confirm')) : t('del_acc_send_code')}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    hint: { color: '#A1A1AA', fontFamily: Typography.sans.regular, fontSize: 14, marginBottom: 12 },
    label: { color: '#fff', fontFamily: Typography.sans.medium, fontSize: 14, marginBottom: 8 },
    input: {
        backgroundColor: '#1E2124', color: '#fff', borderRadius: 12, paddingHorizontal: 16,
        paddingVertical: 14, fontSize: 16, marginBottom: 16, fontFamily: Typography.sans.regular,
    },
    button: { backgroundColor: '#C0392B', padding: 16, borderRadius: 50, alignItems: 'center' },
    buttonText: { color: '#fff', fontFamily: Typography.sans.bold, fontSize: 16 },
});

export default DeletionReauth;
