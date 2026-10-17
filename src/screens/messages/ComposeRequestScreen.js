import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { auth } from '../../config/firebase';
import { Typography } from '../../constants/Typography';
import { useLanguage } from '../../context/LanguageContext';
import { sendRequest, getThread, threadIdFor } from '../../services/messaging';
import { teamConversation } from '../../utils/openConversation';
import { fill } from '../../utils/messagesInbox';
import { Avatar, THEME } from './parts';

const ComposeRequestScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useLanguage();
    const { trip, targetUid, name = '', avatar } = route.params || {};
    const tripId = trip?.id || trip?.tripId;
    const orgId = trip?.org_id || trip?.orgId;
    const uid = auth.currentUser?.uid;
    const first = name.split(' ')[0];
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const canSend = text.trim().length > 0 && !sending;

    const openThread = async (threadId, pending) => {
        // A pending request I received is reviewed, never opened as a locked chat.
        let thread = null;
        try { thread = await getThread(orgId, tripId, threadId); } catch (e) { /* fall through to the chat */ }
        if (thread?.status === 'pending' && thread.requester !== uid) {
            navigation.replace('RequestReview', { trip, threadId, peerUid: targetUid, name, avatar });
            return;
        }
        navigation.replace('TripChat', { trip, conversation: { kind: 'dm', id: threadId, title: name, avatar, peerUid: targetUid, ...(pending ? { pending: true } : {}) } });
    };

    const send = async () => {
        if (!canSend) return;
        setSending(true);
        try {
            const { threadId } = await sendRequest({ tripId, targetUid, text: text.trim() });
            await openThread(threadId || threadIdFor(uid, targetUid), true);
        } catch (e) {
            setSending(false);
            const code = String(e?.code || '');
            if (code.endsWith('already-exists') && e?.details?.threadId) {
                await openThread(e.details.threadId, false);
            } else if (code.endsWith('failed-precondition')) {
                Alert.alert(t('msg_not_eligible'));
            } else {
                Alert.alert(t('msg_error_generic'));
            }
        }
    };

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#332F2B', '#1A1E21']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
                            <Ionicons name="arrow-back" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <Avatar name={name} uri={avatar} size={40} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
                            <Text style={styles.headerSub}>{t('msg_not_connected')}</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </LinearGradient>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <View style={styles.center}>
                    <View style={styles.icon}>
                        <Ionicons name="chatbubble-ellipses-outline" size={26} color={THEME.gold} />
                    </View>
                    <Text style={styles.heading}>{t('msg_first_is_request')}</Text>
                    <Text style={styles.body}>{fill(t('msg_first_body'), { name: first })}</Text>
                    <Text style={styles.body}>
                        {t('msg_need_urgent')}{' '}
                        <Text
                            style={styles.link}
                            onPress={() => navigation.replace('TripChat', { trip, conversation: teamConversation(uid, t('msg_journey_team')) })}
                        >
                            {t('msg_message_team')}
                        </Text>
                    </Text>
                </View>
                <SafeAreaView edges={['bottom']} style={styles.inputWrap}>
                    <View style={styles.inputBar}>
                        <TextInput
                            style={styles.input}
                            value={text}
                            onChangeText={setText}
                            maxLength={500}
                            multiline
                            placeholder=""
                            placeholderTextColor="#666"
                        />
                        <TouchableOpacity style={[styles.send, !canSend && { opacity: 0.5 }]} onPress={send} disabled={!canSend}>
                            {sending ? <ActivityIndicator size="small" color="#1A1E21" /> : <Ionicons name="paper-plane-outline" size={22} color="#1A1E21" />}
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: THEME.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15 },
    back: { padding: 5, marginRight: 12 },
    headerTitle: { color: '#FFF', fontSize: 20, fontFamily: Typography.sans.semiBold },
    headerSub: { color: THEME.muted, fontSize: 14, fontFamily: Typography.sans.regular },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
    icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#2E2920', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    heading: { color: '#FFF', fontSize: 22, fontFamily: Typography.sans.bold, textAlign: 'center', marginBottom: 12 },
    body: { color: THEME.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 12, fontFamily: Typography.sans.regular },
    link: { color: THEME.goldText, textDecorationLine: 'underline' },
    inputWrap: { backgroundColor: '#1E2225' },
    inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
    input: { flex: 1, maxHeight: 120, minHeight: 46, borderRadius: 23, backgroundColor: '#2C2F33', color: '#FFF', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, fontSize: 16, fontFamily: Typography.sans.regular },
    send: { width: 46, height: 46, borderRadius: 23, backgroundColor: THEME.gold, alignItems: 'center', justifyContent: 'center' },
});

export default ComposeRequestScreen;
