import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Typography } from '../../constants/Typography';
import { useLanguage } from '../../context/LanguageContext';
import useMessagesData from '../../hooks/useMessagesData';
import useTripPeople from '../../hooks/useTripPeople';
import { detailButtonFor, threadIdFor } from '../../utils/messagingRules';
import { openConversation, teamConversation } from '../../utils/openConversation';
import { getChatStaffRole } from '../../utils/chatStaffRole';
import { fill } from '../../utils/messagesInbox';
import { Avatar, ShieldAvatar, THEME } from './parts';

const NewMessageScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useLanguage();
    const trip = route.params?.trip;
    const tripId = trip?.id || trip?.tripId;
    const orgId = trip?.org_id || trip?.orgId;
    const [search, setSearch] = useState('');

    const { uid, staff, isStaff, inbox, staffCount } = useMessagesData(orgId, tripId);
    const { people } = useTripPeople(orgId, tripId, staff);

    const q = search.trim().toLowerCase();
    // Only people whose name the viewer may see are listed.
    const visible = people
        .filter((p) => p.id !== uid && p.nameVisible)
        .filter((p) => !q || p.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));

    const subtitleFor = (p) => {
        const button = detailButtonFor({
            viewerIsStaff: isStaff, targetIsStaff: p.isStaff, isSelf: false,
            inboxRow: inbox[threadIdFor(uid, p.id)], nameVisible: p.nameVisible,
        });
        switch (button) {
            case 'team': return t('msg_goes_to_team');
            case 'open_chat': return t('msg_already_chatting');
            case 'waiting': return t('msg_request_sent_sub');
            case 'accept': return t('msg_request_received_sub');
            default: return t('msg_pilgrim');
        }
    };

    const open = (p) => {
        openConversation(navigation, trip, { viewerUid: uid, viewerIsStaff: isStaff, target: p, inbox });
    };

    return (
        <View style={styles.container}>
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.title}>{t('msg_new_message')}</Text>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 30 }}>
                    <TextInput
                        style={styles.search}
                        placeholder={t('msg_search')}
                        placeholderTextColor={THEME.muted}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {!isStaff && (
                        <>
                            <Text style={styles.section}>{t('msg_journey_team')}</Text>
                            <TouchableOpacity
                                style={styles.row}
                                onPress={() => navigation.navigate('TripChat', { trip, conversation: teamConversation(uid, t('msg_journey_team')) })}
                            >
                                <ShieldAvatar />
                                <View style={styles.rowText}>
                                    <Text style={styles.name}>{t('msg_journey_team')}</Text>
                                    <Text style={styles.sub}>{fill(t('msg_team_sub'), { n: staffCount })}</Text>
                                </View>
                            </TouchableOpacity>
                        </>
                    )}
                    <Text style={styles.section}>{`${t('msg_participants')} · ${visible.length}`}</Text>
                    {visible.map((p) => (
                        <TouchableOpacity key={p.id} style={styles.row} onPress={() => open(p)}>
                            <Avatar name={p.name} uri={p.image} />
                            <View style={styles.rowText}>
                                <View style={styles.nameRow}>
                                    <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                                    {p.isStaff && !!getChatStaffRole(staff, p.id) && (
                                        <View style={styles.role}><Text style={styles.roleText}>{getChatStaffRole(staff, p.id).toUpperCase()}</Text></View>
                                    )}
                                </View>
                                <Text style={styles.sub}>{subtitleFor(p)}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                    <Text style={styles.footer}>{t('msg_new_footer')}</Text>
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
    search: { marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 24, backgroundColor: THEME.card, color: '#FFF', fontSize: 16, fontFamily: Typography.sans.regular },
    section: { color: THEME.muted, fontSize: 15, fontFamily: Typography.sans.semiBold, paddingHorizontal: 20, marginTop: 18, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    rowText: { flex: 1, marginLeft: 14 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { color: '#FFF', fontSize: 17, fontFamily: Typography.sans.semiBold, flexShrink: 1 },
    sub: { color: THEME.muted, fontSize: 14, marginTop: 2, fontFamily: Typography.sans.regular },
    role: { backgroundColor: '#3A3223', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
    roleText: { color: THEME.goldText, fontSize: 10, letterSpacing: 0.5, fontFamily: Typography.sans.bold },
    footer: { color: THEME.muted, fontSize: 14, lineHeight: 21, paddingHorizontal: 20, marginTop: 36, fontFamily: Typography.sans.regular },
});

export default NewMessageScreen;
