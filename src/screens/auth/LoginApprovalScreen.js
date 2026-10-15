import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ref, onValue } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { responsiveFontSize } from '../../utils/responsive';
import { Typography } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';
import { useLanguage } from '../../context/LanguageContext';
import { auth, database, functions } from '../../config/firebase';
import { approvalView, formatCountdown } from '../../utils/loginApproval';

const RESULT_ICON = {
    approved: { name: 'checkmark-circle', color: Colors.dark.success },
    denied: { name: 'close-circle', color: Colors.dark.error },
    expired: { name: 'time-outline', color: Colors.dark.textSecondary },
    missing: { name: 'help-circle-outline', color: Colors.dark.textSecondary },
};

const LoginApprovalScreen = () => {
    const navigation = useNavigation();
    const { id } = useRoute().params || {};
    const { t, isRTL } = useLanguage();
    const [approval, setApproval] = useState(undefined);
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let unsubscribeValue = null;
        // On a cold start the user may not be restored yet when this screen mounts.
        const unsubscribeAuth = onAuthStateChanged(auth, user => {
            if (unsubscribeValue) { unsubscribeValue(); unsubscribeValue = null; }
            if (!user || !id) { setApproval(null); return; }
            unsubscribeValue = onValue(ref(database, `login_approvals/${user.uid}/${id}`),
                snapshot => setApproval(snapshot.val()), () => setApproval(null));
        });
        return () => { unsubscribeAuth(); if (unsubscribeValue) unsubscribeValue(); };
    }, [id]);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const { state, secondsLeft } = approval === undefined ? { state: 'loading', secondsLeft: 0 } : approvalView(approval, now);

    const answer = async (payload) => {
        if (busy) return;
        setBusy(true);
        setFailed(false);
        try {
            await httpsCallable(functions, 'answerLoginApproval')({ id, ...payload });
        } catch (error) {
            console.log('[LoginApproval] Answer failed:', error?.message);
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    const close = () => {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('Home');
    };

    const align = { textAlign: isRTL ? 'right' : 'left' };
    const requestedAt = approval?.created_at ? new Date(approval.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    const renderResult = () => {
        const icon = RESULT_ICON[state];
        return (
            <View style={styles.resultWrap}>
                <Ionicons name={icon.name} size={72} color={icon.color} />
                <Text style={styles.resultTitle}>{t(`login_approval_${state}_title`)}</Text>
                <Text style={styles.resultMessage}>{t(`login_approval_${state}_message`)}</Text>
                <GradientBorderButton text={t('login_approval_done')} onPress={close} style={styles.doneButton} />
            </View>
        );
    };

    const renderPending = () => (
        <View>
            <Text style={[styles.title, align]}>{t('login_approval_title')}</Text>
            <Text style={[styles.subtitle, align]}>{t('login_approval_subtitle')}</Text>

            <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t('login_approval_browser')}</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>{approval?.client?.browser}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t('login_approval_requested')}</Text>
                    <Text style={styles.infoValue}>{requestedAt}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t('login_approval_time_left')}</Text>
                    <Text style={styles.infoValue}>{formatCountdown(secondsLeft)}</Text>
                </View>
            </View>

            <View style={styles.numbersRow}>
                {(approval?.numbers || []).map(n => (
                    <TouchableOpacity key={n} style={[styles.numberButton, busy && { opacity: 0.5 }]}
                        disabled={busy} onPress={() => answer({ number: n })}>
                        <Text style={styles.numberText}>{n}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {failed ? <Text style={styles.errorText}>{t('login_approval_error')}</Text> : null}

            <TouchableOpacity style={[styles.denyButton, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => answer({ deny: true })}>
                <Text style={styles.denyText}>{t('login_approval_deny')}</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <GlowBackground>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.content}>
                    {state === 'loading' ? (
                        <View style={styles.resultWrap}>
                            <ActivityIndicator color={Colors.dark.primary} />
                            <Text style={styles.resultMessage}>{t('login_approval_loading')}</Text>
                        </View>
                    ) : state === 'pending' ? renderPending() : renderResult()}
                </View>
            </SafeAreaView>
        </GlowBackground>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 40, justifyContent: 'center' },
    title: {
        fontSize: responsiveFontSize(32), color: '#FFF', fontFamily: 'CormorantGaramond_Bold', marginBottom: 12,
    },
    subtitle: {
        color: '#FFFBF3', fontSize: responsiveFontSize(14), lineHeight: responsiveFontSize(21),
        fontFamily: 'IBMPlexSans', marginBottom: 28,
    },
    infoCard: {
        backgroundColor: 'rgba(253, 253, 253, 0.1)', borderRadius: 12, borderWidth: 1, borderColor: '#23272A',
        paddingHorizontal: 16, paddingVertical: 8, marginBottom: 32,
    },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    infoLabel: { color: '#9BA1A6', fontSize: responsiveFontSize(14), fontFamily: 'IBMPlexSans' },
    infoValue: {
        color: '#FFF', fontSize: responsiveFontSize(14), fontFamily: Typography.sans.bold, flexShrink: 1, marginLeft: 16,
    },
    numbersRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
    numberButton: {
        flex: 1, marginHorizontal: 6, height: 88, borderRadius: 16, borderWidth: 1.5, borderColor: '#B99A4A',
        backgroundColor: 'rgba(185, 154, 74, 0.12)', alignItems: 'center', justifyContent: 'center',
    },
    numberText: { color: '#FFF', fontSize: responsiveFontSize(34), fontFamily: Typography.sans.bold },
    errorText: {
        color: Colors.dark.error, fontSize: responsiveFontSize(14), fontFamily: 'IBMPlexSans',
        textAlign: 'center', marginBottom: 16,
    },
    denyButton: {
        height: 56, borderRadius: 30, borderWidth: 1, borderColor: Colors.dark.error,
        alignItems: 'center', justifyContent: 'center',
    },
    denyText: { color: Colors.dark.error, fontSize: responsiveFontSize(16), fontFamily: Typography.sans.bold },
    resultWrap: { alignItems: 'center' },
    resultTitle: {
        color: '#FFF', fontSize: responsiveFontSize(32), fontFamily: 'CormorantGaramond_Bold', marginTop: 20, marginBottom: 8,
    },
    resultMessage: {
        color: '#FFFBF3', fontSize: responsiveFontSize(14), lineHeight: responsiveFontSize(21), fontFamily: 'IBMPlexSans',
        textAlign: 'center', marginBottom: 32,
    },
    doneButton: { alignSelf: 'stretch' },
});

export default LoginApprovalScreen;
