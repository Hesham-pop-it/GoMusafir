import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ref, get } from 'firebase/database';
import { database, auth } from '../../config/firebase';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import { useLanguage } from '../../context/LanguageContext';
import { getMessageSettings, setMessageSettings, subscribeBlocks, unblock } from '../../services/messaging';

// Messages group of Settings (pilgrims): who can send me requests, and the people I blocked.
const MessageSettingsCard = ({ orgId, tripId }) => {
    const { t } = useLanguage();
    const uid = auth.currentUser?.uid;
    const [requests, setRequests] = useState('members');
    const [blocks, setBlocks] = useState({});
    const [names, setNames] = useState({});
    const [open, setOpen] = useState(null);
    const [busy, setBusy] = useState(null);

    useEffect(() => {
        if (!orgId || !tripId || !uid) return;
        let alive = true;
        getMessageSettings(orgId, tripId, uid).then((s) => alive && setRequests(s.requests === 'nobody' ? 'nobody' : 'members')).catch(() => {});
        const unsub = subscribeBlocks(orgId, tripId, uid, setBlocks);
        return () => { alive = false; unsub(); };
    }, [orgId, tripId, uid]);

    const blockedIds = Object.keys(blocks).filter((id) => blocks[id]);

    useEffect(() => {
        blockedIds.filter((id) => !names[id]).forEach(async (id) => {
            try {
                const [p, n] = await Promise.all([get(ref(database, `users/${id}/profile`)), get(ref(database, `users/${id}/full_name`))]);
                const profile = p.val() || {};
                const full = [profile.firstName || profile.first_name, profile.lastName || profile.last_name].filter(Boolean).join(' ') || n.val();
                setNames((prev) => ({ ...prev, [id]: full || t('msg_pilgrim') }));
            } catch (e) {
                setNames((prev) => ({ ...prev, [id]: t('msg_pilgrim') }));
            }
        });
    }, [blockedIds.join(',')]);

    const chooseRequests = async (value) => {
        const previous = requests;
        setRequests(value);
        setOpen(null);
        try {
            await setMessageSettings(orgId, tripId, uid, { requests: value });
        } catch (e) {
            setRequests(previous);
            Alert.alert(t('msg_error_generic'));
        }
    };

    const doUnblock = async (id) => {
        setBusy(id);
        try {
            await unblock({ tripId, uid: id });
        } catch (e) {
            Alert.alert(t('msg_error_generic'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            <Text style={styles.sectionTitle}>{t('msg_title')}</Text>
            <View style={styles.card}>
                <TouchableOpacity style={styles.row} onPress={() => setOpen(open === 'requests' ? null : 'requests')} activeOpacity={0.7}>
                    <Text style={styles.label}>{t('msg_settings_requests')}</Text>
                    <View style={styles.value}>
                        <Text style={styles.valueText}>{requests === 'nobody' ? t('msg_opt_nobody') : t('msg_settings_from_members')}</Text>
                        <Ionicons name={open === 'requests' ? 'chevron-down' : 'chevron-forward'} size={16} color="#B99A4A" />
                    </View>
                </TouchableOpacity>
                {open === 'requests' && ['members', 'nobody'].map((value) => (
                    <TouchableOpacity key={value} style={styles.option} onPress={() => chooseRequests(value)}>
                        <Text style={[styles.optionText, requests === value && { color: '#B99A4A' }]}>{value === 'nobody' ? t('msg_opt_nobody') : t('msg_opt_members')}</Text>
                    </TouchableOpacity>
                ))}
                <View style={styles.divider} />
                <TouchableOpacity style={styles.row} onPress={() => setOpen(open === 'blocked' ? null : 'blocked')} activeOpacity={0.7}>
                    <Text style={styles.label}>{t('msg_settings_blocked')}</Text>
                    <View style={styles.value}>
                        <Text style={styles.valueText}>{blockedIds.length ? String(blockedIds.length) : t('msg_settings_none')}</Text>
                        <Ionicons name={open === 'blocked' ? 'chevron-down' : 'chevron-forward'} size={16} color="#B99A4A" />
                    </View>
                </TouchableOpacity>
                {open === 'blocked' && blockedIds.map((id) => (
                    <View key={id} style={styles.option}>
                        <Text style={[styles.optionText, { flex: 1 }]} numberOfLines={1}>{names[id] || ''}</Text>
                        <TouchableOpacity onPress={() => doUnblock(id)} disabled={busy === id}>
                            <Text style={[styles.valueText, busy === id && { opacity: 0.5 }]}>{t('msg_settings_unblock')}</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
            <Text style={styles.footer}>{t('msg_settings_footer')}</Text>
        </>
    );
};

const styles = StyleSheet.create({
    sectionTitle: {
        fontSize: responsiveFontSize(20),
        color: '#FFF',
        marginBottom: 15,
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
        marginTop: 10,
    },
    card: { backgroundColor: '#23272A', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 6, marginBottom: 12 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
    label: { color: '#FFF', fontSize: responsiveFontSize(16), fontFamily: Typography.sans.semiBold, letterSpacing: 0.2 },
    value: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    valueText: { color: '#B99A4A', fontSize: responsiveFontSize(16), fontFamily: Typography.sans.semiBold, letterSpacing: 0.2 },
    option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    optionText: { color: '#FFF', fontSize: responsiveFontSize(15), fontFamily: Typography.sans.regular },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)' },
    footer: { color: '#9BA1A6', fontSize: responsiveFontSize(14), fontFamily: Typography.sans.regular, lineHeight: 21, marginBottom: 15 },
});

export default MessageSettingsCard;
