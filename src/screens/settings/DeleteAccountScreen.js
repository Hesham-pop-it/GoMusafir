import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../config/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { Typography } from '../../constants/Typography';
import DeletionReauth from '../../components/DeletionReauth';
import { completeAccountDeletion } from '../../utils/accountDeletion';
import { deletionErrorReason, reauthMethod } from '../../utils/deletionFlow';

const Section = ({ title, body }) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
    </View>
);

const DeleteAccountScreen = ({ navigation }) => {
    const { t } = useLanguage();
    const [method, setMethod] = useState(null);
    const [ownsOrg, setOwnsOrg] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        let alive = true;
        auth.currentUser?.getIdTokenResult().then((res) => {
            if (alive) setMethod(reauthMethod(auth.currentUser, res.claims?.role));
        }).catch(() => alive && setMethod('email-code'));
        return () => { alive = false; };
    }, []);

    const submit = async () => {
        try {
            await httpsCallable(functions, 'deleteMyAccount')();
            setDone(true);
            await completeAccountDeletion(auth, navigation);
        } catch (e) {
            const reason = deletionErrorReason(e);
            if (reason === 'owns-organization') { setOwnsOrg(true); return; }
            Alert.alert(t('del_acc_title'), reason === 'reauth-required' ? t('del_acc_reauth_failed') : (e.message || t('del_acc_reauth_failed')));
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} disabled={done}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{t('del_acc_title')}</Text>
                <Text style={styles.body}>{t('del_acc_intro')}</Text>
                <Section title={t('del_acc_deleted_title')} body={t('del_acc_deleted_body')} />
                <Section title={t('del_acc_anon_title')} body={t('del_acc_anon_body')} />
                <Section title={t('del_acc_kept_title')} body={t('del_acc_kept_body')} />
                <Text style={styles.recovery}>{t('del_acc_recovery')}</Text>
                {ownsOrg ? (
                    <Text style={styles.block}>{t('del_acc_owner_block')}</Text>
                ) : method ? (
                    <DeletionReauth method={method} onVerified={submit} disabled={done} />
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#121416' },
    back: { padding: 16 },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    title: { color: '#fff', fontFamily: Typography.serif.bold, fontSize: 30, marginBottom: 8 },
    section: { marginTop: 20 },
    sectionTitle: { color: '#fff', fontFamily: Typography.sans.semiBold, fontSize: 16, marginBottom: 4 },
    body: { color: '#A1A1AA', fontFamily: Typography.sans.regular, fontSize: 14, lineHeight: 20 },
    recovery: { color: '#fff', fontFamily: Typography.sans.medium, fontSize: 14, lineHeight: 20, marginVertical: 24 },
    block: { color: '#E57373', fontFamily: Typography.sans.medium, fontSize: 15, lineHeight: 22 },
});

export default DeleteAccountScreen;
