import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../../constants/Typography';
import { initialsOf } from '../../utils/messagesInbox';
import RemoteImage from '../../components/RemoteImage';

export const THEME = {
    bg: '#1A1E21',
    card: '#23272A',
    gold: '#B99A4A',
    goldText: '#F0D080',
    muted: '#A1A1AA',
    team: '#2F4A73',
    teamRing: '#8DA9D6',
    red: '#E5677F',
    green: '#34C759',
};

// Person avatar: photo when there is a real one, initials otherwise, optional online dot.
export const Avatar = ({ name, uri, size = 46, online = false }) => {
    const showPhoto = uri && !String(uri).includes('ui-avatars.com');
    return (
        <View style={{ width: size, height: size }}>
            {showPhoto ? (
                <RemoteImage source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
            ) : (
                <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2 }]}>
                    <Text style={[styles.initialsText, { fontSize: size * 0.34 }]}>{initialsOf(name)}</Text>
                </View>
            )}
            {online && <View style={styles.onlineDot} />}
        </View>
    );
};

// Journey team and staff chat avatar.
export const ShieldAvatar = ({ size = 46 }) => (
    <View style={[styles.shield, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons name="shield-outline" size={size * 0.45} color="#FFF" />
    </View>
);

export const CountBadge = ({ count }) => (
    <View style={styles.count}>
        <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
    </View>
);

export const Pill = ({ label, tone = 'team' }) => (
    <View style={[styles.pill, tone === 'gold' && { backgroundColor: THEME.gold }]}>
        <Text style={[styles.pillText, tone === 'gold' && { color: '#1A1E21' }]}>{label}</Text>
    </View>
);

const styles = StyleSheet.create({
    initials: { backgroundColor: '#2A2E32', alignItems: 'center', justifyContent: 'center' },
    initialsText: { color: THEME.muted, fontFamily: Typography.sans.semiBold },
    onlineDot: {
        position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6,
        backgroundColor: THEME.green, borderWidth: 2, borderColor: THEME.bg,
    },
    shield: { backgroundColor: THEME.team, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: THEME.teamRing },
    count: {
        minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
        backgroundColor: THEME.gold, alignItems: 'center', justifyContent: 'center',
    },
    countText: { color: '#1A1E21', fontSize: 12, fontFamily: Typography.sans.bold },
    pill: { backgroundColor: THEME.team, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    pillText: { color: '#FFF', fontSize: 11, letterSpacing: 0.5, fontFamily: Typography.sans.bold },
});
