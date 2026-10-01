import React, { useEffect, useState } from 'react';
import { AppState, Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../constants/Typography';
import { RoomEvent, ConnectionState } from 'livekit-client';
import { ref, onValue } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { database, functions } from '../config/firebase';

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

    useEffect(() => onValue(ref(database, '.info/connected'), snapshot =>
        setDatabaseConnected(snapshot.val() === true)), []);

    useEffect(() => {
        setPresenceReady(false);
        if (!connected || !orgId || !tripId || !uid || !databaseConnected) return;
        return onValue(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/presence/${uid}`),
            snapshot => setPresenceReady(snapshot.val() === true), () => setPresenceReady(false));
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
        if (!connected || !tripId || !orgId || !uid) return;
        let disposed = false;
        let busy = false;
        let queued = false;
        let activitySeen = false;
        const report = httpsCallable(functions, 'reportVoiceActivity');
        // Serialize reports and retain brief activity across retries, so a fast
        // unmute/mute cannot disappear between network requests.
        const flush = async () => {
            if (disposed || busy || room.state !== ConnectionState.Connected) return;
            busy = true;
            queued = false;
            const activity = activitySeen;
            activitySeen = false;
            try {
                await report({ tripId, activity });
                if (activity) queued = true;
            } catch (e) {
                activitySeen = activitySeen || activity;
                console.warn('[Voice inactivity] Activity report failed:', e.code);
            } finally {
                busy = false;
                if (queued && !disposed) flush();
            }
        };
        const changed = () => {
            const participants = [room.localParticipant, ...room.remoteParticipants.values()];
            activitySeen = activitySeen || participants.some(p => p.isMicrophoneEnabled || p.isSpeaking);
            queued = true;
            flush();
        };
        const unmuted = () => { activitySeen = true; changed(); };
        const events = [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected,
            RoomEvent.TrackMuted, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished,
            RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished,
            RoomEvent.ActiveSpeakersChanged, RoomEvent.Reconnected];
        events.forEach(event => room.on(event, changed));
        room.on(RoomEvent.TrackUnmuted, unmuted);
        const subscription = AppState.addEventListener('change', state => {
            setForeground(state === 'active');
            if (state === 'active') changed();
        });
        // Recovery for dropped events/RPCs; the five-minute deadline is server-owned.
        const interval = setInterval(changed, 30000);
        changed();
        return () => {
            disposed = true;
            clearInterval(interval);
            subscription.remove();
            events.forEach(event => room.off(event, changed));
            room.off(RoomEvent.TrackUnmuted, unmuted);
        };
    }, [room, connected, tripId, orgId, uid]);

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
