import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../config/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { Typography } from '../../constants/Typography';
import { safeSignOut } from '../../utils/authUtils';
import { daysRemaining } from '../../utils/deletionFlow';

// Shown to the owner of an organisation that is scheduled for deletion.
const RestoreOrganizationScreen = ({ navigation }) => {
    const { t } = useLanguage();
    const [org, setOrg] = useState(undefined);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        httpsCallable(functions, 'getDeletionStatus')()
            .then((res) => alive && setOrg(res.data?.organization || null))
            .catch(() => alive && setOrg(null));
        return () => { alive = false; };
    }, []);

    const restore = async () => {
        setBusy(true);
        try {
            await httpsCallable(functions, 'restoreOrganization')();
            Alert.alert(t('restore_org_title'), t('restore_org_done'));
            // Sessions were revoked on deletion, so sign in again.
            await safeSignOut(auth);
        } catch (e) {
            Alert.alert(t('restore_org_title'), e.message || t('del_acc_reauth_failed'));
        } finally { setBusy(false); }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.content}>
                {org === undefined ? <ActivityIndicator color="#fff" /> : (
                    <>
                        <Text style={styles.title}>{t('restore_org_title')}</Text>
                        <Text style={styles.body}>{t('restore_org_body')}</Text>
                        {org ? (
                            <Text style={styles.days}>{t('restore_org_days')}: {daysRemaining(org.purge_after)}</Text>
                        ) : null}
                        {org?.is_owner ? (
                            <TouchableOpacity style={[styles.button, busy && { opacity: 0.5 }]} onPress={restore} disabled={busy}>
                                <Text style={styles.buttonText}>{t('restore_org_button')}</Text>
                            </TouchableOpacity>
                        ) : null}
                    </>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#121416' },
    content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    title: { color: '#fff', fontFamily: Typography.serif.bold, fontSize: 28, marginBottom: 12 },
    body: { color: '#A1A1AA', fontFamily: Typography.sans.regular, fontSize: 14, lineHeight: 20 },
    days: { color: '#B99A4A', fontFamily: Typography.sans.semiBold, fontSize: 18, marginVertical: 20 },
    button: { backgroundColor: '#B99A4A', padding: 16, borderRadius: 50, alignItems: 'center' },
    buttonText: { color: '#fff', fontFamily: Typography.sans.bold, fontSize: 16 },
});

export default RestoreOrganizationScreen;
