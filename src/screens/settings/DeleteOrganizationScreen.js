import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ref, get } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { auth, database, functions } from '../../config/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { Typography } from '../../constants/Typography';
import DeletionReauth from '../../components/DeletionReauth';
import { safeSignOut } from '../../utils/authUtils';
import { blockingJourneys, confirmNameMatches, deletionErrorReason, reauthMethod } from '../../utils/deletionFlow';

const DeleteOrganizationScreen = ({ navigation }) => {
    const { t } = useLanguage();
    const [orgName, setOrgName] = useState('');
    const [typed, setTyped] = useState('');
    const [journeys, setJourneys] = useState([]);
    const [done, setDone] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const uid = auth.currentUser.uid;
                const orgId = (await get(ref(database, `users/${uid}/staff_org_id`))).val();
                const name = orgId ? (await get(ref(database, `orgs/${orgId}/metadata/name`))).val() : '';
                if (alive) setOrgName(name || '');
            } catch (e) { console.warn('[Delete organisation] name lookup failed', e?.code); }
        })();
        return () => { alive = false; };
    }, []);

    const matches = confirmNameMatches(typed, orgName);

    const submit = async () => {
        try {
            await httpsCallable(functions, 'deleteOrganization')({ confirmName: typed.trim() });
            setDone(true);
            Alert.alert(t('del_org_title'), t('del_org_done'));
            // The server revoked every session of the organisation, including this one.
            await safeSignOut(auth);
        } catch (e) {
            const reason = deletionErrorReason(e);
            if (reason === 'active-journeys') { setJourneys(blockingJourneys(e)); return; }
            if (reason === 'name-mismatch') { Alert.alert(t('del_org_title'), t('del_org_name_mismatch')); return; }
            Alert.alert(t('del_org_title'), reason === 'reauth-required' ? t('del_acc_reauth_failed') : (e.message || t('del_acc_reauth_failed')));
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} disabled={done}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{t('del_org_title')}</Text>
                <Text style={styles.body}>{t('del_org_intro')}</Text>
                <Text style={styles.recovery}>{t('del_org_effects')}</Text>
                {journeys.length > 0 ? (
                    <View style={styles.blockBox}>
                        <Text style={styles.block}>{t('del_org_active_journeys')}</Text>
                        {journeys.map((j, i) => (
                            <Text key={j.tripId || i} style={styles.body}>{j.title || j.tripId}</Text>
                        ))}
                    </View>
                ) : null}
                <Text style={styles.label}>{t('del_org_type_name')}</Text>
                <Text style={styles.orgName}>{orgName}</Text>
                <TextInput
                    style={styles.input}
                    value={typed}
                    onChangeText={setTyped}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholderTextColor="#71717A"
                />
                {matches ? (
                    <DeletionReauth
                        method={reauthMethod(auth.currentUser, 'admin')}
                        onVerified={submit}
                        disabled={done}
                        confirmLabel={t('del_org_confirm')}
                    />
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
    body: { color: '#A1A1AA', fontFamily: Typography.sans.regular, fontSize: 14, lineHeight: 20 },
    recovery: { color: '#fff', fontFamily: Typography.sans.medium, fontSize: 14, lineHeight: 20, marginVertical: 20 },
    blockBox: { marginBottom: 20 },
    block: { color: '#E57373', fontFamily: Typography.sans.medium, fontSize: 15, lineHeight: 22, marginBottom: 6 },
    label: { color: '#fff', fontFamily: Typography.sans.medium, fontSize: 14, marginBottom: 6 },
    orgName: { color: '#B99A4A', fontFamily: Typography.sans.semiBold, fontSize: 16, marginBottom: 10 },
    input: {
        backgroundColor: '#1E2124', color: '#fff', borderRadius: 12, paddingHorizontal: 16,
        paddingVertical: 14, fontSize: 16, marginBottom: 20, fontFamily: Typography.sans.regular,
    },
});

export default DeleteOrganizationScreen;
