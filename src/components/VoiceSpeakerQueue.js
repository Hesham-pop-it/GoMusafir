import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoice } from '../context/VoiceContext';
import { auth } from '../config/firebase';

export default function VoiceSpeakerQueue({ profiles = {} }) {
    const { speakerState, wantsToSpeak, isMuted, isAdmin, setIsMuted, sendMuteCommand } = useVoice();
    const entries = Object.entries(speakerState?.entries || {});
    const queue = entries.filter(([, entry]) => entry.status === 'queued').sort((a, b) => a[1].order - b[1].order);
    const occupied = entries.filter(([, entry]) => entry.status !== 'queued').length;
    const uid = auth.currentUser?.uid;
    return <View style={styles.container}>
        <View style={styles.heading}>
            <Text style={styles.title}>{occupied}/4 microphones</Text>
            {!isAdmin && wantsToSpeak && isMuted && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel speaking request"
                onPress={() => setIsMuted(true)} style={styles.cancel}>
                <Text style={styles.status}>Cancel request</Text><Ionicons name="close" size={18} color="#FFF" />
            </TouchableOpacity>}
        </View>
        {queue.length > 0 && <Text style={styles.label}>Waiting to speak ({queue.length})</Text>}
        {queue.map(([id], index) => <View key={id} style={styles.row}>
            <Text style={styles.position}>{index + 1}</Text>
            <Text style={styles.name} numberOfLines={1}>{id === uid ? 'You' : profiles[id]?.name || 'Participant'}</Text>
            {isAdmin && <>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Move request to front"
                    onPress={() => sendMuteCommand(id, false)} style={styles.icon}>
                    <Ionicons name="arrow-up" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove speaking request"
                    onPress={() => sendMuteCommand(id, true)} style={styles.icon}>
                    <Ionicons name="close" size={20} color="#D66A77" />
                </TouchableOpacity>
            </>}
        </View>)}
        {wantsToSpeak && isMuted && !queue.some(([id]) => id === uid) && <Text style={styles.label}>{isAdmin ? 'Unmuting microphone...' : 'Requesting microphone...'}</Text>}
    </View>;
}

const styles = StyleSheet.create({
    container: { width: '100%', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#3F4346' },
    heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    title: { color: '#FFF', fontSize: 14, fontWeight: '600' },
    label: { color: '#BCC3C8', fontSize: 13, marginTop: 8 },
    status: { color: '#FFF', fontSize: 13 },
    cancel: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
    row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 },
    position: { width: 24, color: '#BCC3C8', fontSize: 14 },
    name: { flex: 1, color: '#FFF', fontSize: 14 },
    icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
