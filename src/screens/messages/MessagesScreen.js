import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import { Typography } from '../../constants/Typography';
import { useLanguage } from '../../context/LanguageContext';
import useMessagesData from '../../hooks/useMessagesData';
import useTripPeople from '../../hooks/useTripPeople';
import useVoiceLive from '../../hooks/useVoiceLive';
import { paths, subscribeLastMessages, subscribeTeamMeta, subscribePresence, subscribeReports } from '../../services/messaging';
import { inboxSort } from '../../utils/messagingRules';
import { buildStaffRows, filterStaffRows, sortReports, formatInboxTime, fill, peerShown } from '../../utils/messagesInbox';
import { teamConversation } from '../../utils/openConversation';
import { getChatStaffRole } from '../../utils/chatStaffRole';
import { Avatar, ShieldAvatar, CountBadge, Pill, THEME } from './parts';

const SENDER_COLORS = ['#1FA89A', '#3B82F6'];

const previewOf = (m) => {
    if (!m) return '';
    if (m.text) return m.text;
    return m.type === 'image' ? '📷' : m.type === 'location' ? '📍' : m.type === 'voice' ? '🎤' : m.type === 'video' ? '🎬' : '';
};
const firstName = (n) => String(n || '').split(' ')[0];

const MessagesScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useLanguage();
    const trip = route.params?.trip;
    const tripId = trip?.id || trip?.tripId;
    const orgId = trip?.org_id || trip?.orgId;

    const data = useMessagesData(orgId, tripId);
    const voiceLive = useVoiceLive(orgId, tripId);
    const { uid, isStaff, staff, split, inbox } = data;
    const { people } = useTripPeople(orgId, tripId, staff);
    const peerName = (row) => peerShown(row, people).name;
    const nameOf = (id) => people.find((p) => p.id === id)?.name || t('msg_reporter_unknown');

    const [groupLast, setGroupLast] = useState([]);
    const [staffLast, setStaffLast] = useState([]);
    const [ownMeta, setOwnMeta] = useState(null);
    const [presence, setPresence] = useState({});
    const [reports, setReports] = useState({});
    const [filter, setFilter] = useState(route.params?.filter || 'all');

    useEffect(() => {
        if (!orgId || !tripId) return;
        const p = paths(orgId, tripId);
        const unsubs = [subscribeLastMessages(p.chat, 2, setGroupLast), subscribePresence(orgId, tripId, setPresence)];
        return () => unsubs.forEach((u) => u());
    }, [orgId, tripId]);

    useEffect(() => {
        if (!orgId || !tripId || !uid) return;
        if (isStaff) {
            const unsubs = [
                subscribeLastMessages(paths(orgId, tripId).staffChat, 1, setStaffLast),
                subscribeReports(orgId, tripId, setReports),
            ];
            return () => unsubs.forEach((u) => u());
        }
        return subscribeTeamMeta(orgId, tripId, uid, setOwnMeta);
    }, [orgId, tripId, uid, isStaff]);

    const joinVoice = () => navigation.navigate('VoiceChat', { trip });
    const openGroup = () => navigation.navigate('TripChat', { trip });
    const openTeamThread = () => navigation.navigate('TripChat', { trip, conversation: teamConversation(uid, t('msg_journey_team')) });
    const openStaffChat = () => navigation.navigate('TripChat', { trip, conversation: { kind: 'staff', id: 'staff', title: t('msg_staff_chat') } });
    const openDm = (row) => navigation.navigate('TripChat', {
        trip,
        conversation: { kind: 'dm', id: row.threadId, title: peerName(row), avatar: peerShown(row, people).image, peerUid: row.peer, ...(row.kind === 'request_out' ? { pending: true } : {}) },
    });
    const openStaffRow = (r) => navigation.navigate('TripChat', { trip, conversation: { kind: 'team', id: r.pilgrimUid, title: r.meta.pilgrim_name || nameOf(r.pilgrimUid) } });

    const lastTs = groupLast.length ? groupLast[groupLast.length - 1].timestamp : 0;
    const memberCount = trip?.participants || people.length || 0;
    const yesterday = t('msg_yesterday');

    const GroupCard = () => (
        <TouchableOpacity style={styles.groupCard} onPress={openGroup} activeOpacity={0.8}>
            {trip?.image ? (
                <Image source={typeof trip.image === 'string' ? { uri: trip.image } : trip.image} style={styles.groupImage} />
            ) : <View style={[styles.groupImage, { backgroundColor: THEME.card }]} />}
            <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                    <Text style={styles.groupTitle} numberOfLines={1}>{trip?.title}</Text>
                    <Pill tone="gold" label={`${t('msg_group')} · ${memberCount}`} />
                    <Text style={styles.time}>{formatInboxTime(lastTs, Date.now(), yesterday)}</Text>
                </View>
                {voiceLive && (
                    <View style={styles.liveLine}>
                        <View style={[styles.liveDot, { marginRight: 6 }]} />
                        <Text style={styles.liveLineText}>{t('msg_voice_live')}</Text>
                    </View>
                )}
                <View style={styles.rowTop}>
                    <View style={{ flex: 1 }}>
                        {groupLast.length === 0 ? <Text style={styles.preview}> </Text> : groupLast.map((m, i) => (
                            <Text key={m.id} style={styles.groupLine} numberOfLines={1}>
                                {m.sender_id !== 'system' && (
                                    <Text style={{ color: SENDER_COLORS[i % 2], fontFamily: Typography.sans.semiBold }}>{firstName(m.sender_name)}: </Text>
                                )}
                                {previewOf(m)}
                            </Text>
                        ))}
                    </View>
                    {isStaff && <Ionicons name="pin" size={14} color={THEME.gold} style={{ marginRight: 8 }} />}
                    {data.groupUnread > 0 && <CountBadge count={data.groupUnread} />}
                </View>
            </View>
        </TouchableOpacity>
    );

    const Row = ({ avatar, title, pill, time, preview, previewBold, sub, badge, onPress }) => (
        <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
            {avatar}
            <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
                    {pill}
                    <View style={{ flex: 1 }} />
                    <Text style={styles.time}>{time}</Text>
                </View>
                <View style={styles.rowTop}>
                    <View style={{ flex: 1 }}>
                        {!!preview && <Text style={[styles.preview, previewBold && styles.previewBold]} numberOfLines={1}>{preview}</Text>}
                        {sub}
                    </View>
                    {badge > 0 && <CountBadge count={badge} />}
                </View>
            </View>
        </TouchableOpacity>
    );

    // Pilgrim chats: dms, pending requests I sent, and the Journey team, newest first.
    const pilgrimRows = useMemo(() => inboxSort([
        ...split.chats.map((r) => ({ ...r, _type: 'dm' })),
        { _type: 'team', last_at: ownMeta?.last_at || 0 },
    ]), [split.chats, ownMeta]);

    const teamPreview = ownMeta?.last_text
        ? `${ownMeta.last_sender_id === uid ? t('msg_you_prefix') : firstName(ownMeta.last_sender_name)}: ${ownMeta.last_text}`
        : t('msg_team_sub_empty');

    const staffRows = useMemo(() => buildStaffRows(data.teamMeta, data.teamRead, uid), [data.teamMeta, data.teamRead, uid]);
    const shownStaffRows = filterStaffRows(staffRows, filter);
    const reportList = sortReports(reports);
    const staffNames = Object.keys(staff).filter((id) => getChatStaffRole(staff, id)).map((id) => (id === uid ? t('msg_you_lower') : firstName(nameOf(id))));

    const requests = split.requests;
    const requestsText = requests.length === 0 ? '' : requests.length === 1
        ? fill(t('msg_req_one'), { name: peerName(requests[0]) })
        : requests.length === 2
            ? fill(t('msg_req_two'), { name: peerName(requests[0]) })
            : fill(t('msg_req_many'), { name: peerName(requests[0]), n: requests.length - 1 });

    return (
        <View style={styles.container}>
            <SafeAreaView edges={['top']} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{t('msg_title')}</Text>
                            <Text style={styles.subtitle} numberOfLines={2}>
                                {isStaff
                                    ? `${t('msg_team_inbox_sub')}${staffNames.length ? `: ${staffNames.join(', ')}` : ''}`
                                    : `${trip?.title || ''} · ${memberCount} ${t('msg_members')}`}
                            </Text>
                        </View>
                        {!isStaff && (
                            <TouchableOpacity style={styles.plus} onPress={() => navigation.navigate('NewMessage', { trip })}>
                                <Ionicons name="add" size={28} color="#FFF" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {voiceLive && (
                        <View style={styles.liveBar}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveTitle}>{t('msg_voice_live')}</Text>
                            <TouchableOpacity style={styles.joinButton} onPress={joinVoice} activeOpacity={0.8}>
                                <Ionicons name="mic-outline" size={18} color="#0E1A12" />
                                <Text style={styles.joinText}>{t('msg_voice_join')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {isStaff ? (
                        <>
                            <View style={styles.chips}>
                                {[['all', t('msg_filter_all')], ['unread', `${t('msg_filter_unread')}${data.total ? ` ${data.total}` : ''}`], ['reports', `${t('msg_filter_reports')}${reportList.length ? ` ${reportList.length}` : ''}`]].map(([key, label]) => (
                                    <TouchableOpacity key={key} style={[styles.chip, filter === key && styles.chipActive]} onPress={() => setFilter(key)}>
                                        <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>{label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {filter !== 'unread' && reportList.map((r) => (
                                <TouchableOpacity
                                    key={r.id}
                                    style={styles.alertCard}
                                    activeOpacity={0.8}
                                    onPress={() => navigation.navigate('TripChat', { trip, conversation: { kind: 'team', id: r.reporter, title: nameOf(r.reporter) } })}
                                >
                                    <Ionicons name="ban-outline" size={20} color={THEME.red} style={{ marginRight: 14 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.alertTitle}>{fill(t('msg_report_alert'), { name: nameOf(r.reporter) })}</Text>
                                        <Text style={styles.preview}>{t('msg_report_follow')} · {formatInboxTime(r.at, Date.now(), yesterday)}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                            {filter !== 'reports' && (filter === 'all' || data.groupUnread > 0) && <GroupCard />}
                            {filter === 'all' && (
                                <Row
                                    avatar={<ShieldAvatar />}
                                    title={t('msg_staff_chat')}
                                    pill={<View style={{ marginLeft: 8 }}><Pill label={`${t('msg_team_badge')} · ${data.staffCount}`} /></View>}
                                    time={formatInboxTime(staffLast[0]?.timestamp, Date.now(), yesterday)}
                                    preview={staffLast[0] ? `${staffLast[0].sender_id === uid ? t('msg_you_prefix') : firstName(staffLast[0].sender_name)}: ${previewOf(staffLast[0])}` : ''}
                                    onPress={openStaffChat}
                                />
                            )}
                            {shownStaffRows.map((r) => {
                                const m = r.meta;
                                const byMe = m.last_sender_id === uid;
                                const fromStaff = m.last_sender_id !== r.pilgrimUid;
                                const roleLabel = getChatStaffRole({ [m.replied_by_uid]: m.replied_role }, m.replied_by_uid);
                                return (
                                    <Row
                                        key={r.pilgrimUid}
                                        avatar={<Avatar name={m.pilgrim_name} />}
                                        title={m.pilgrim_name || nameOf(r.pilgrimUid)}
                                        time={formatInboxTime(m.last_at, Date.now(), yesterday)}
                                        preview={fromStaff ? `${byMe ? t('msg_you_prefix') : firstName(m.last_sender_name)}: ${m.last_text || ''}` : (m.last_text || '')}
                                        previewBold={r.unread > 0}
                                        badge={r.unread}
                                        sub={m.needs_reply ? (
                                            <View style={styles.stateRow}>
                                                <Ionicons name="time-outline" size={16} color={THEME.goldText} />
                                                <Text style={styles.needsReply}>{t('msg_needs_reply')}</Text>
                                            </View>
                                        ) : (
                                            <View style={styles.stateRow}>
                                                <Ionicons name="checkmark" size={16} color={THEME.muted} />
                                                <Text style={styles.preview}>{fill(t('msg_replied_by'), { name: m.replied_by_uid === uid ? t('msg_you_lower') : (m.replied_by || '') })}</Text>
                                                {!!roleLabel && <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{roleLabel.toUpperCase()}</Text></View>}
                                            </View>
                                        )}
                                        onPress={() => openStaffRow(r)}
                                    />
                                );
                            })}
                        </>
                    ) : (
                        <>
                            <GroupCard />
                            {requests.length > 0 && (
                                <TouchableOpacity style={styles.requestsCard} onPress={() => navigation.navigate('MessageRequests', { trip })} activeOpacity={0.8}>
                                    <View style={styles.requestsIcon}>
                                        <Ionicons name="chatbubble-ellipses-outline" size={22} color="#1A1E21" />
                                    </View>
                                    <View style={{ flex: 1, marginHorizontal: 14 }}>
                                        <Text style={styles.rowTitle}>{t('msg_message_requests')}</Text>
                                        <Text style={styles.preview} numberOfLines={2}>{requestsText}</Text>
                                    </View>
                                    <CountBadge count={requests.length} />
                                </TouchableOpacity>
                            )}
                            <Text style={styles.sectionLabel}>{t('msg_chats')}</Text>
                            {pilgrimRows.map((r) => r._type === 'team' ? (
                                <Row
                                    key="team"
                                    avatar={<ShieldAvatar />}
                                    title={t('msg_journey_team')}
                                    pill={<View style={{ marginLeft: 8 }}><Pill label={`${t('msg_team_badge')} · ${data.staffCount}`} /></View>}
                                    time={formatInboxTime(ownMeta?.last_at, Date.now(), yesterday)}
                                    preview={teamPreview}
                                    onPress={openTeamThread}
                                />
                            ) : (
                                <Row
                                    key={r.threadId}
                                    avatar={<Avatar name={peerName(r)} uri={peerShown(r, people).image} online={r.kind === 'dm' && presence[r.peer] === true} />}
                                    title={peerName(r)}
                                    time={formatInboxTime(r.last_at, Date.now(), yesterday)}
                                    preview={r.kind === 'request_out' ? undefined : r.last_text}
                                    previewBold={r.unread > 0}
                                    badge={r.unread || 0}
                                    sub={r.kind === 'request_out' ? (
                                        <View style={styles.stateRow}>
                                            <Ionicons name="time-outline" size={16} color={THEME.muted} />
                                            <Text style={styles.preview}>{fill(t('msg_waiting_for'), { name: firstName(peerName(r)) })}</Text>
                                        </View>
                                    ) : null}
                                    onPress={() => openDm(r)}
                                />
                            ))}
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
            <TripBottomTabBar activeRoute="Messages" tripData={trip} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: THEME.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 14 },
    title: { color: '#FFF', fontSize: 34, fontFamily: Typography.serif.medium },
    subtitle: { color: THEME.muted, fontSize: 14, marginTop: 2, fontFamily: Typography.sans.regular },
    plus: { width: 48, height: 48, borderRadius: 24, backgroundColor: THEME.card, alignItems: 'center', justifyContent: 'center' },
    chips: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 14, gap: 10 },
    chip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, backgroundColor: THEME.card },
    chipActive: { backgroundColor: THEME.gold },
    chipText: { color: THEME.muted, fontSize: 15, fontFamily: Typography.sans.semiBold },
    chipTextActive: { color: '#1A1E21' },
    alertCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, backgroundColor: THEME.card },
    alertTitle: { color: '#FFF', fontSize: 16, fontFamily: Typography.sans.semiBold, marginBottom: 2 },
    groupCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 16, backgroundColor: '#2F2A22', borderWidth: 1.5, borderColor: THEME.gold },
    groupImage: { width: 52, height: 52, borderRadius: 26, marginRight: 14 },
    groupTitle: { color: '#FFF', fontSize: 16, fontFamily: Typography.sans.semiBold, flexShrink: 1, marginRight: 8 },
    groupLine: { color: '#FFF', fontSize: 14, fontFamily: Typography.sans.regular, marginTop: 2 },
    liveBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 14, padding: 14, borderRadius: 16, backgroundColor: '#12281B', borderWidth: 1, borderColor: '#2E6B45' },
    liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759', marginRight: 12 },
    liveTitle: { flex: 1, color: '#FFF', fontSize: 16, fontFamily: Typography.sans.semiBold },
    joinButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#34C759', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10 },
    joinText: { color: '#0E1A12', fontSize: 16, fontFamily: Typography.sans.bold },
    liveLine: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
    liveLineText: { color: '#34C759', fontSize: 14, fontFamily: Typography.sans.semiBold },
    requestsCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 18, padding: 16, borderRadius: 16, backgroundColor: '#2E2920' },
    requestsIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: THEME.gold, alignItems: 'center', justifyContent: 'center' },
    sectionLabel: { color: THEME.muted, fontSize: 15, fontFamily: Typography.sans.semiBold, paddingHorizontal: 20, marginBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2A2E32' },
    rowTop: { flexDirection: 'row', alignItems: 'center' },
    rowTitle: { color: '#FFF', fontSize: 17, fontFamily: Typography.sans.semiBold, flexShrink: 1 },
    time: { color: THEME.muted, fontSize: 13, fontFamily: Typography.sans.regular, marginLeft: 8 },
    preview: { color: THEME.muted, fontSize: 14, fontFamily: Typography.sans.regular, marginTop: 3 },
    previewBold: { color: '#FFF', fontFamily: Typography.sans.semiBold },
    stateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    needsReply: { color: THEME.goldText, fontSize: 14, fontFamily: Typography.sans.semiBold },
    roleBadge: { backgroundColor: '#3A3223', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
    roleBadgeText: { color: THEME.goldText, fontSize: 10, letterSpacing: 0.5, fontFamily: Typography.sans.bold },
});

export default MessagesScreen;
