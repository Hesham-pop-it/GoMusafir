import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Typography } from '../../constants/Typography';
import { useLanguage } from '../../context/LanguageContext';
import useMessagesData from '../../hooks/useMessagesData';
import { respondToRequest } from '../../services/messaging';
import { formatInboxTime, fill } from '../../utils/messagesInbox';
import { Avatar, CountBadge, THEME } from './parts';

const MessageRequestsScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useLanguage();
    const trip = route.params?.trip;
    const tripId = trip?.id || trip?.tripId;
    const orgId = trip?.org_id || trip?.orgId;
    const { split } = useMessagesData(orgId, tripId);
    const [busy, setBusy] = useState(null);

    const review = (row) => navigation.navigate('RequestReview', { trip, threadId: row.threadId, peerUid: row.peer, name: row.peer_name });

    const acceptDeclined = async (row) => {
        setBusy(row.threadId);
        try {
            await respondToRequest({ tripId, threadId: row.threadId, action: 'accept' });
            navigation.replace('TripChat', { trip, conversation: { kind: 'dm', id: row.threadId, title: row.peer_name, peerUid: row.peer } });
        } catch (e) {
            Alert.alert(t('msg_error_generic'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <View style={styles.container}>
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.title}>{t('msg_message_requests')}</Text>
                </View>
                <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                    <Text style={styles.intro}>{t('msg_requests_intro')}</Text>
                    {split.requests.map((row) => (
                        <TouchableOpacity key={row.threadId} style={styles.requestRow} onPress={() => review(row)} activeOpacity={0.7}>
                            <Avatar name={row.peer_name} size={52} />
                            <View style={{ flex: 1, marginLeft: 14 }}>
                                <View style={styles.line}>
                                    <Text style={styles.name} numberOfLines={1}>{row.peer_name}</Text>
                                    <Text style={styles.time}>{formatInboxTime(row.last_at, Date.now(), t('msg_yesterday'))}</Text>
                                </View>
                                <View style={styles.line}>
                                    <Text style={styles.previewLine} numberOfLines={1}>
                                        <Text style={styles.requestLabel}>{t('msg_request_label')} · </Text>
                                        {row.last_text}
                                    </Text>
                                    <CountBadge count={Math.max(1, row.unread || 0)} />
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))}
                    {split.declined.length > 0 && (
                        <>
                            <Text style={styles.section}>{t('msg_declined')}</Text>
                            <Text style={styles.declinedIntro}>{t('msg_declined_intro')}</Text>
                            {split.declined.map((row) => (
                                <TouchableOpacity key={row.threadId} style={styles.declinedRow} onPress={() => review(row)} activeOpacity={0.7}>
                                    <Avatar name={row.peer_name} size={52} />
                                    <View style={{ flex: 1, marginLeft: 14 }}>
                                        <Text style={styles.declinedName} numberOfLines={1}>{row.peer_name}</Text>
                                        <Text style={styles.declinedSub}>{t('msg_you_declined')} · {formatInboxTime(row.last_at, Date.now(), t('msg_yesterday'))}</Text>
                                    </View>
                                    <TouchableOpacity style={styles.acceptBtn} disabled={busy === row.threadId} onPress={() => acceptDeclined(row)}>
                                        <Text style={styles.acceptText}>{t('msg_accept')}</Text>
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            ))}
                        </>
                    )}
                    <View style={{ flex: 1 }} />
                    <View style={styles.footer}>
                        <Ionicons name="shield-outline" size={20} color={THEME.muted} style={{ marginRight: 14, marginTop: 2 }} />
                        <Text style={styles.footerText}>{fill(t('msg_requests_footer'), { trip: trip?.title || '' })}</Text>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: THEME.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
    back: { padding: 5, marginRight: 14 },
    title: { color: '#FFF', fontSize: 30, fontFamily: Typography.serif.medium },
    intro: { color: THEME.muted, fontSize: 15, lineHeight: 22, paddingHorizontal: 20, marginBottom: 16, fontFamily: Typography.sans.regular },
    requestRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#2E2920' },
    line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    name: { color: '#FFF', fontSize: 17, fontFamily: Typography.sans.semiBold, flexShrink: 1 },
    time: { color: THEME.muted, fontSize: 13, fontFamily: Typography.sans.regular },
    previewLine: { flex: 1, color: '#FFF', fontSize: 14, marginTop: 4, marginRight: 8, fontFamily: Typography.sans.semiBold },
    requestLabel: { color: THEME.goldText },
    section: { color: THEME.muted, fontSize: 15, fontFamily: Typography.sans.semiBold, paddingHorizontal: 20, marginTop: 24 },
    declinedIntro: { color: THEME.muted, fontSize: 15, lineHeight: 22, paddingHorizontal: 20, marginTop: 6, marginBottom: 12, fontFamily: Typography.sans.regular },
    declinedRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
    declinedName: { color: '#D4D4D8', fontSize: 17, fontFamily: Typography.sans.semiBold },
    declinedSub: { color: THEME.muted, fontSize: 14, marginTop: 2, fontFamily: Typography.sans.regular },
    acceptBtn: { borderWidth: 1, borderColor: THEME.gold, borderRadius: 22, paddingHorizontal: 22, paddingVertical: 10 },
    acceptText: { color: THEME.gold, fontSize: 15, fontFamily: Typography.sans.semiBold },
    footer: { flexDirection: 'row', margin: 16, padding: 18, borderRadius: 14, backgroundColor: THEME.card },
    footerText: { flex: 1, color: THEME.muted, fontSize: 14, lineHeight: 21, fontFamily: Typography.sans.regular },
});

export default MessageRequestsScreen;
