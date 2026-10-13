import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { auth } from '../../config/firebase';
import { Typography } from '../../constants/Typography';
import { useLanguage } from '../../context/LanguageContext';
import { subscribeInbox, respondToRequest } from '../../services/messaging';
import { teamConversation } from '../../utils/openConversation';
import { fill } from '../../utils/messagesInbox';
import { Avatar, THEME } from './parts';

const RequestReviewScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useLanguage();
    const { trip, threadId, peerUid, name: paramName, avatar } = route.params || {};
    const tripId = trip?.id || trip?.tripId;
    const orgId = trip?.org_id || trip?.orgId;
    const uid = auth.currentUser?.uid;
    const [row, setRow] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!orgId || !tripId || !uid) return;
        return subscribeInbox(orgId, tripId, uid, (inbox) => setRow(inbox[threadId] || null));
    }, [orgId, tripId, uid, threadId]);

    const name = row?.peer_name || paramName || '';
    const first = name.split(' ')[0];
    const declined = row?.kind === 'declined';

    const run = async (action, after) => {
        setBusy(true);
        try {
            await respondToRequest({ tripId, threadId, action });
            after();
        } catch (e) {
            setBusy(false);
            Alert.alert(t('msg_error_generic'));
        }
    };

    const accept = () => run('accept', () => navigation.replace('TripChat', { trip, conversation: { kind: 'dm', id: threadId, title: name, avatar, peerUid } }));
    const decline = () => run('decline', () => navigation.goBack());
    const block = () => Alert.alert(fill(t('msg_block_title'), { name }), t('msg_block_body'), [
        { text: t('msg_cancel'), style: 'cancel' },
        { text: t('msg_block_report'), style: 'destructive', onPress: () => run('block', () => navigation.goBack()) },
    ]);

    return (
        <View style={styles.container}>
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.title}>{t('msg_request_label')}</Text>
                </View>
                <View style={styles.body}>
                    <View style={styles.card}>
                        <Avatar name={name} uri={avatar} size={92} />
                        <Text style={styles.name}>{name}</Text>
                        <Text style={styles.trip}>{trip?.title}</Text>
                        <Text style={styles.wants}>{t('msg_review_wants')}</Text>
                        <View style={styles.bubble}><Text style={styles.bubbleText}>{row?.last_text || ''}</Text></View>
                        <View style={styles.buttons}>
                            <TouchableOpacity style={[styles.btn, styles.accept]} onPress={accept} disabled={busy}>
                                {busy ? <ActivityIndicator color="#1A1E21" /> : <Text style={styles.acceptText}>{t('msg_accept')}</Text>}
                            </TouchableOpacity>
                            {!declined && (
                                <TouchableOpacity style={[styles.btn, styles.decline]} onPress={decline} disabled={busy}>
                                    <Text style={styles.declineText}>{t('msg_decline')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <TouchableOpacity style={styles.blockRow} onPress={block} disabled={busy}>
                            <Ionicons name="ban-outline" size={18} color={THEME.red} />
                            <Text style={styles.blockText}>{t('msg_block_report')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.footer}>
                    <Text style={styles.footerText}>{fill(t('msg_decline_note'), { name: first })}</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('TripChat', { trip, conversation: teamConversation(uid, t('msg_journey_team')) })}>
                        <Text style={styles.link}>{t('msg_ask_team')}</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: THEME.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, backgroundColor: '#23272A' },
    back: { padding: 5, marginRight: 14 },
    title: { color: '#FFF', fontSize: 20, fontFamily: Typography.sans.bold },
    body: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
    card: { alignItems: 'center', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#2F3438' },
    name: { color: '#FFF', fontSize: 22, fontFamily: Typography.sans.semiBold, marginTop: 14 },
    trip: { color: THEME.muted, fontSize: 15, marginTop: 6, fontFamily: Typography.sans.regular },
    wants: { color: THEME.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 6, marginBottom: 16, fontFamily: Typography.sans.regular },
    bubble: { alignSelf: 'stretch', backgroundColor: THEME.card, borderRadius: 14, padding: 16 },
    bubbleText: { color: '#FFF', fontSize: 16, lineHeight: 24, fontFamily: Typography.sans.regular },
    buttons: { flexDirection: 'row', gap: 12, marginTop: 16, alignSelf: 'stretch' },
    btn: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    accept: { backgroundColor: THEME.gold },
    acceptText: { color: '#1A1E21', fontSize: 17, fontFamily: Typography.sans.bold },
    decline: { borderWidth: 1, borderColor: '#6B7075' },
    declineText: { color: '#FFF', fontSize: 17, fontFamily: Typography.sans.bold },
    blockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 4 },
    blockText: { color: THEME.red, fontSize: 16, fontFamily: Typography.sans.regular },
    footer: { alignItems: 'center', paddingHorizontal: 40, paddingBottom: 24 },
    footerText: { color: THEME.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', fontFamily: Typography.sans.regular },
    link: { color: THEME.goldText, fontSize: 15, textDecorationLine: 'underline', marginTop: 10, fontFamily: Typography.sans.regular },
});

export default RequestReviewScreen;
