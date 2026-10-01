import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import useTripFeatureAccess from '../hooks/useTripFeatureAccess';
import { Colors } from '../constants/Colors';

export default function PreTripVoiceAllowance({ tripId, orgId }) {
    const { access, remainingSeconds } = useTripFeatureAccess(tripId, orgId);
    if (!access || access.voiceAccess !== 'PRE_TRIP_LIMITED') return null;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = String(remainingSeconds % 60).padStart(2, '0');
    return (
        <View style={styles.container}>
            <Text style={styles.label}>
                {remainingSeconds > 0 ? `Pre-trip Voice · ${minutes}:${seconds} remaining` : 'Pre-trip Voice · 00:00 remaining'}
            </Text>
            <Text style={styles.detail}>
                {remainingSeconds > 0
                    ? 'Shared across all Voice sessions for this trip.'
                    : 'Pre-trip Voice has been used. Full Voice will become available 24 hours before your journey starts.'}
            </Text>
        </View>
    );
}
const styles = StyleSheet.create({
    container: { padding: 12, marginBottom: 14, borderRadius: 12, backgroundColor: Colors.dark.card, width: '100%' },
    label: { color: Colors.dark.primary, fontSize: 15, fontWeight: '600', textAlign: 'center' },
    detail: { color: Colors.dark.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: 'center' },
});
