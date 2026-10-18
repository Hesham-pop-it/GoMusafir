import React, { useEffect, useState } from 'react';
import { AppState, Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../constants/Typography';
import { RoomEvent, ConnectionState } from 'livekit-client';
import { ref, onValue } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { database, functions } from '../config/firebase';
import { createActivityReporter } from '../utils/voiceActivityReporter';
import { watchOwnVoicePresence } from '../utils/voiceChannelFields';

const HOST_ROLES = ['admin', 'manager', 'co-host'];

// Mounted beside the app's navigation so a connected host sees the question on
// any screen. A controlled Modal can be dismissed remotely after another answer.
export default function VoiceInactivityMonitor({ room, connected, tripId, orgId, uid }) {
    const [role, setRole] = useState(null);
    const [prompt, setPrompt] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [foreground, setForeground] = useState(AppState.currentState === 'active');
    const [presenceReady, setPresenceReady] = useState(false);
    const [databaseConnected, setDatabaseConnected] = useState(false);
    const [roomSid, setRoomSid] = useState(null);
    const [channelReady, setChannelReady] = useState(false);

    useEffect(() => {
        setChannelReady(false);
        if (!connected || !orgId || !tripId || !databaseConnected) return;
        return onValue(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/isChannelStarted`),
            snapshot => setChannelReady(snapshot.val() === true), () => setChannelReady(false));
    }, [connected, orgId, tripId, databaseConnected]);

    useEffect(() => onValue(ref(database, '.info/connected'), snapshot =>
        setDatabaseConnected(snapshot.val() === true)), []);

    useEffect(() => {
        setPresenceReady(false);
        if (!connected || !orgId || !tripId || !uid || !databaseConnected) return;
        return watchOwnVoicePresence(database, orgId, tripId, uid, setPresenceReady);
    }, [connected, orgId, tripId, uid, databaseConnected]);

    useEffect(() => {
        let disposed = false;
        let generation = 0;
        const changed = async () => {
            const current = ++generation;
            setRoomSid(null);
            if (!connected || room.state !== ConnectionState.Connected) return;
            try {
                const sid = await room.getSid();
                if (!disposed && current === generation) setRoomSid(sid);
            } catch (_) { /* Reconnection will retry with the current room. */ }
        };
        room.on(RoomEvent.ConnectionStateChanged, changed);
        changed();
        return () => { disposed = true; room.off(RoomEvent.ConnectionStateChanged, changed); };
    }, [room, connected, tripId, orgId]);

    useEffect(() => {
        setRole(null);
        if (!connected || !orgId || !uid) return;
        return onValue(ref(database, `orgs/${orgId}/staff/${uid}`),
            snapshot => setRole(snapshot.val()), () => setRole(null));
    }, [connected, orgId, uid]);

    useEffect(() => {
        setPrompt(null);
        setError('');
        if (!connected || !tripId || !orgId || !presenceReady || !databaseConnected || !roomSid || !HOST_ROLES.includes(role)) return;
        return onValue(ref(database, `voice_inactivity/${orgId}/${tripId}`), snapshot => {
            const state = snapshot.val();
            setPrompt(state?.status === 'pending' && state.roomSid === roomSid ? state : null);
            setError('');
        }, () => setPrompt(null));
    }, [connected, tripId, orgId, role, presenceReady, databaseConnected, roomSid]);

    useEffect(() => {
        if (!connected || !tripId || !orgId || !uid || !presenceReady || !databaseConnected || !roomSid || !channelReady) return;
        const report = httpsCallable(functions, 'reportVoiceActivity');
        // Only people who can speak report: organizers and anyone granted a microphone.
        const reporter = createActivityReporter({
            room, send: activity => report({ tripId, activity }),
            canReport: () => HOST_ROLES.includes(role) || room.localParticipant.permissions?.canPublish === true,
            isConnected: () => room.state === ConnectionState.Connected,
        });
        const { changed, lowered, unmuted, reconnected } = reporter;
        const raising = [RoomEvent.ParticipantConnected, RoomEvent.TrackPublished, RoomEvent.LocalTrackPublished,
            RoomEvent.ActiveSpeakersChanged, RoomEvent.ParticipantPermissionsChanged];
        const lowering = [RoomEvent.ParticipantDisconnected, RoomEvent.TrackMuted, RoomEvent.TrackUnpublished,
            RoomEvent.LocalTrackUnpublished];
        raising.forEach(event => room.on(event, changed));
        lowering.forEach(event => room.on(event, lowered));
        room.on(RoomEvent.TrackUnmuted, unmuted);
        room.on(RoomEvent.Reconnected, reconnected);
        const subscription = AppState.addEventListener('change', state => {
            setForeground(state === 'active');
            if (state === 'active') changed();
        });
        // Recovery for a failed report only; an unchanged room sends nothing.
        const interval = setInterval(changed, 30000);
        changed();
        return () => {
            reporter.dispose();
            clearInterval(interval);
            subscription.remove();
            raising.forEach(event => room.off(event, changed));
            lowering.forEach(event => room.off(event, lowered));
            room.off(RoomEvent.TrackUnmuted, unmuted);
            room.off(RoomEvent.Reconnected, reconnected);
        };
    }, [room, connected, tripId, orgId, uid, role, presenceReady, databaseConnected, roomSid, channelReady]);

    const respond = async keepActive => {
        if (!prompt || submitting) return;
        setSubmitting(true);
        setError('');
        try {
            await httpsCallable(functions, 'respondToVoiceInactivity')({ tripId, promptId: prompt.id, keepActive });
            setPrompt(current => current?.id === prompt.id ? null : current);
        } catch (e) {
            setError('Could not send your response. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return <Modal transparent animationType="fade" visible={Boolean(connected && foreground && presenceReady && databaseConnected && HOST_ROLES.includes(role) && prompt && prompt.roomSid === roomSid)}
        onRequestClose={() => {}}>
        <View style={styles.backdrop}>
            <View style={styles.card} accessibilityViewIsModal>
                <Text style={styles.title}>Keep Voice Chat open?</Text>
                <Text style={styles.body}>No one has spoken for 5 minutes.</Text>
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <View style={styles.actions}>
                    {[{ label: 'End', keepActive: false }, { label: 'Keep Open', keepActive: true }].map(action => (
                        <Pressable key={action.label} accessibilityRole="button"
                            accessibilityState={{ disabled: submitting, busy: submitting }}
                            disabled={submitting} onPress={() => respond(action.keepActive)}
                            style={[styles.button, submitting && styles.disabledButton]}>
                            {({ pressed }) => (
                                <LinearGradient colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonBorder}>
                                    <View style={[styles.buttonInner, pressed && styles.buttonPressed]}>
                                        <Text style={styles.buttonText}>{action.label}</Text>
                                    </View>
                                </LinearGradient>
                            )}
                        </Pressable>
                    ))}
                </View>
            </View>
        </View>
    </Modal>;
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 440, backgroundColor: '#23272A', borderRadius: 24, padding: 28 },
    title: { color: '#FFF', fontSize: 20, fontFamily: Typography.sans.semiBold, textAlign: 'center', marginBottom: 12 },
    body: { color: '#DDD', fontSize: 16, fontFamily: Typography.sans.regular, lineHeight: 24, textAlign: 'center' },
    error: { color: '#ff9999', marginTop: 12, textAlign: 'center' },
    actions: { flexDirection: 'row', marginTop: 28, gap: 16 },
    button: { flex: 1 },
    disabledButton: { opacity: 0.5 },
    buttonBorder: { borderRadius: 30, padding: 1.5 },
    buttonInner: { minHeight: 58, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 28.5, backgroundColor: '#23272A', justifyContent: 'center', alignItems: 'center' },
    buttonPressed: { backgroundColor: '#B99A4A' },
    buttonText: { color: '#FFF', fontSize: 16, fontFamily: Typography.sans.semiBold, textAlign: 'center' },
});
