import { startLiveLocationTracking, syncCurrentUserLocationNow } from '../../services/locationTrackingService';
import { getVisibleSnapshot, onVisibleValue, respondToLocationRequest } from '../../services/visibilityData';
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    StatusBar,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { ref, onValue, get } from 'firebase/database';
import { database, auth } from '../../config/firebase';
import { isStaffMember, checkPIIVisibility, getParticipantDisplayName, getParticipantDisplayPhoto } from '../../utils/visibilityHelper';
import { navigateToNotificationTarget, extractNotificationTimestamp, formatNotificationTime } from '../../utils/notificationNavigation';

const NotificationScreen = ({ navigation, route }) => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const activeUnsubscribes = [];

        const setupListener = async () => {
            try {
                const userSnap = await getVisibleSnapshot(ref(database, `users/${uid}`), null);
                const userData = userSnap.val() || {};

                // Collect all trip/org pairs for this user
                const tripOrgPairs = [];
                const seenTrips = new Set();

                // 1. Current trip
                const currentTripId = route?.params?.tripId || userData.current_trip;
                if (currentTripId) {
                    let currentOrgId = route?.params?.orgId || userData.staff_org_id || userData.joined_trips?.[currentTripId]?.org_id || userData.joined_trips?.[currentTripId]?.orgId;
                    if (!currentOrgId) {
                        const orgSnap = await get(ref(database, `trips_orgs/${currentTripId}`));
                        if (orgSnap.exists()) currentOrgId = orgSnap.val();
                    }
                    if (currentOrgId) {
                        tripOrgPairs.push({ tripId: currentTripId, orgId: currentOrgId });
                        seenTrips.add(currentTripId);
                    }
                }

                // 2. All joined trips
                const joinedTrips = userData.joined_trips || {};
                for (const tId of Object.keys(joinedTrips)) {
                    if (seenTrips.has(tId)) continue;
                    let oId = joinedTrips[tId]?.org_id || joinedTrips[tId]?.orgId;
                    if (!oId) {
                        const orgSnap = await get(ref(database, `trips_orgs/${tId}`));
                        if (orgSnap.exists()) oId = orgSnap.val();
                    }
                    if (oId) {
                        tripOrgPairs.push({ tripId: tId, orgId: oId });
                        seenTrips.add(tId);
                    }
                }

                // 3. All organization trips (for Staff/Admin/Manager)
                const staffOrgId = userData.staff_org_id;
                if (staffOrgId) {
                    try {
                        const orgTripsSnap = await get(ref(database, `orgs/${staffOrgId}/trips`));
                        if (orgTripsSnap.exists()) {
                            const orgTrips = orgTripsSnap.val() || {};
                            for (const tId of Object.keys(orgTrips)) {
                                if (seenTrips.has(tId)) continue;
                                tripOrgPairs.push({ tripId: tId, orgId: staffOrgId });
                                seenTrips.add(tId);
                            }
                        }
                    } catch (e) {
                        console.log("Error fetching org trips for notifs:", e);
                    }
                }

                // Fetch if current user is admin for each org in tripOrgPairs
                const orgAdminMap = {};
                for (const { orgId: oId } of tripOrgPairs) {
                    if (orgAdminMap[oId] !== undefined) continue;
                    try {
                        const staffSnap = await get(ref(database, `orgs/${oId}/staff/${uid}`));
                        const role = staffSnap.val();
                        orgAdminMap[oId] = ['admin', 'co-host', 'manager'].includes(role);
                    } catch (e) {
                        orgAdminMap[oId] = false;
                    }
                }

                const allNotifsMap = {};

                const updateCombinedList = async () => {
                    // Deduplicate notifications across user_global and trip channels
                    const seenIds = new Set();
                    const combinedRaw = [];

                    for (const [source, dict] of Object.entries(allNotifsMap)) {
                        if (!dict || typeof dict !== 'object') continue;
                        for (const [id, val] of Object.entries(dict)) {
                            if (!val || typeof val !== 'object') continue;
                            if (seenIds.has(id)) continue;
                            seenIds.add(id);
                            combinedRaw.push([id, val, source]);
                        }
                    }

                    if (combinedRaw.length === 0) {
                        setNotifications([]);
                        setLoading(false);
                        return;
                    }

                    const list = await Promise.all(combinedRaw.map(async ([id, val, source]) => {
                        let resolvedName = val.name;
                        const targetUid = val.senderUid || val.sender_id || val.senderId || val.fromUid;
                        const tId = val.tripId || (source !== 'user_global' ? source : currentTripId);
                        const oId = val.orgId || (currentTripId ? (userData.joined_trips?.[currentTripId]?.org_id || userData.joined_trips?.[currentTripId]?.orgId || userData.staff_org_id) : null);

                        if (targetUid && tId && oId) {
                            const isCurrentUser = targetUid === uid;
                            if (isCurrentUser) {
                                resolvedName = 'You';
                            } else {
                                try {
                                    // Fetch global visibility config for the specific trip
                                    const globalVisSnap = await get(ref(database, `orgs/${oId}/trips/${tId}/visibility_config`));
                                    const globalVis = globalVisSnap.val() || {};

                                    // Fetch target user's personal visibility config
                                    const userVisSnap = await getVisibleSnapshot(ref(database, `users/${targetUid}/participant_visibility/${tId}`), tId);
                                    const userVis = userVisSnap.val() || {};

                                    const targetRoleSnap = await get(ref(database, `orgs/${oId}/staff/${targetUid}`));
                                    const targetRole = targetRoleSnap.val();
                                    const isTargetStaff = isStaffMember(targetUid, { [targetUid]: targetRole }, null, targetRole);

                                    const isViewerStaff = Boolean(orgAdminMap[oId]);

                                    const profSnap = await getVisibleSnapshot(ref(database, `users/${targetUid}/profile`), tId);
                                    const prof = profSnap.val() || {};

                                    resolvedName = getParticipantDisplayName({
                                        profile: prof,
                                        fullName: val.name,
                                        targetUid,
                                        viewerUid: uid,
                                        isViewerStaff,
                                        isTargetStaff,
                                        globalConfig: globalVis,
                                        personalVisibility: userVis
                                    });
                                } catch (e) {
                                    console.log("Notif page PII check error:", e);
                                }
                            }
                        }

                        const resolvedTimestamp = extractNotificationTimestamp(val, id);

                        const itemWithResolved = {
                            ...val,
                            timestamp: resolvedTimestamp,
                            name: resolvedName || val.name,
                            tripId: tId,
                            orgId: oId,
                            senderUid: targetUid,
                            isUserGlobal: source === 'user_global'
                        };
                        return {
                            id,
                            uniqueKey: `${source}_${id}`,
                            ...itemWithResolved,
                            title: getTitle(itemWithResolved),
                            description: getDescription(itemWithResolved),
                            seen: val.read === true || val.seen === true,
                        };
                    }));

                    list.sort((a, b) => {
                        const timeA = Number(a.timestamp) || 0;
                        const timeB = Number(b.timestamp) || 0;
                        if (timeB !== timeA) {
                            return timeB - timeA;
                        }
                        return String(b.id || '').localeCompare(String(a.id || ''));
                    });
                    setNotifications(list);
                    setLoading(false);
                };

                // Listen to user-level push notifications (system, account, push alerts)
                const userGlobalRef = ref(database, `users/${uid}/notifications`);
                const unsubUserGlobal = onVisibleValue(userGlobalRef, null, (snapshot) => {
                    if (snapshot.exists()) {
                        allNotifsMap['user_global'] = snapshot.val();
                    } else {
                        delete allNotifsMap['user_global'];
                    }
                    updateCombinedList();
                });
                activeUnsubscribes.push(unsubUserGlobal);

                // Listen to each trip's notifications path
                tripOrgPairs.forEach(({ tripId: tId, orgId: oId }) => {
                    const notifRef = ref(database, `trips_active/${oId}/${tId}/notifications/${uid}`);
                    const unsub = onVisibleValue(notifRef, tId, (snapshot) => {
                        if (snapshot.exists()) {
                            allNotifsMap[tId] = snapshot.val();
                        } else {
                            delete allNotifsMap[tId];
                        }
                        updateCombinedList();
                    });
                    activeUnsubscribes.push(unsub);
                });

                if (tripOrgPairs.length === 0) {
                    setLoading(false);
                }

            } catch (error) {
                console.log("Notif setup error:", error);
                setLoading(false);
            }
        };

        setupListener();

        return () => {
            activeUnsubscribes.forEach(unsub => unsub());
        };
    }, [route?.params?.tripId, route?.params?.orgId]);

    const getTitle = (item) => {
        if (item.title) return item.title;
        switch (item.type) {
            case 'location_request': return 'Location Request';
            case 'emergency': return 'HELP REQUESTED!';
            case 'trip_started': return 'Trip Started';
            case 'trip_ended': return 'Trip Ended';
            case 'voice_started': return 'Voice Chat Started';
            case 'voice_ended': return 'Voice Chat Ended';
            case 'voice_mute_all': return 'Organizer Muted Everyone';
            case 'voice_unmute_all': return 'Mute All Disabled';
            case 'voice_muted': return 'Microphone Muted';
            case 'voice_unmuted': return 'Microphone Unmuted';
            case 'voice_recording_started': return 'Recording Started';
            case 'voice_recording_stopped': return 'Recording Stopped';
            case 'voice_channel_update': return 'Voice Chat Update';
            case 'seat_update': return 'Seat Update';
            case 'NEW_SIGN_IN':
            case 'new_sign_in':
            case 'sign_in':
            case 'new_signin':
                return 'New Sign-In';
            case 'alert': return 'Alert';
            case 'broadcast': return item.name ? `Announcement from ${item.name}` : 'Announcement';
            default: return item.name ? `Notification from ${item.name}` : 'New Update';
        }
    };

    const getDescription = (item) => {
        if (item.message) {
            if (item.type === 'emergency') {
                return `${item.name || 'Someone'} ${item.message}`;
            }
            return item.message;
        }
        if (item.text) return item.text;
        if (item.body) return item.body;
        if (item.description) return item.description;

        switch (item.type) {
            case 'location_request': return `${item.name || 'A participant'} wants to see your live location.`;
            case 'emergency': return `${item.name || 'Someone'} needs immediate assistance!`;
            case 'trip_started': return 'The journey has officially begun. Stay safe!';
            case 'trip_ended': return 'The trip has concluded. We hope you had a great journey!';
            case 'voice_started': return `${item.name || 'Organizer'} started a voice channel.`;
            case 'voice_ended': return 'The voice channel has ended.';
            case 'voice_mute_all': return 'You have been muted by the organizer.';
            case 'voice_unmute_all': return 'You can now unmute your microphone.';
            case 'voice_muted': return 'You were muted by the organizer.';
            case 'voice_unmuted': return 'You were unmuted by the organizer.';
            case 'voice_recording_started': return 'This audio channel is now being recorded.';
            case 'voice_recording_stopped': return 'The recording has ended.';
            case 'voice_channel_update': return 'Voice chat status was updated.';
            case 'seat_update': return 'Seats capacity or allocation was updated.';
            case 'NEW_SIGN_IN':
            case 'new_sign_in':
            case 'sign_in':
            case 'new_signin':
                return 'We noticed a new sign-in to your GoMusāfir account. Tap to log out.';
            default: return 'You have a new notification.';
        }
    };

    const handleNotificationPress = async (item) => {
        // Optimistically mark as seen in local state
        setNotifications(prev =>
            prev.map(n => ((n.uniqueKey === item.uniqueKey || n.id === item.id) ? { ...n, seen: true, read: true } : n))
        );
        await navigateToNotificationTarget(item, navigation);
    };

    const handleLocationResponse = async (item, accept) => {
        try {
            await respondToLocationRequest(item.tripId, item.id, accept);
            if (accept) {
                await startLiveLocationTracking(item.orgId, item.tripId);
                await syncCurrentUserLocationNow();
            }
            setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, status: accept ? 'accepted' : 'declined' } : n));
        } catch (error) {
            Alert.alert('Location request', error.message || 'Could not respond. Please retry.');
        }
    };

    const rendernotificationItem = ({ item }) => {
        let iconName = 'bell-outline';
        let iconColor = '#FFF';

        if (item.type === 'emergency') { iconName = 'alert-octagon'; iconColor = '#FF3B30'; }
        else if (item.type === 'location_request') { iconName = 'map-marker-radius'; iconColor = '#34C759'; }
        else if (item.type === 'trip_started') { iconName = 'flag-variant'; iconColor = '#B99A4A'; }
        else if (item.type === 'voice_started' || item.type === 'voice_channel_update') { iconName = 'microphone'; iconColor = '#5856D6'; }
        else if (item.type === 'voice_ended') { iconName = 'microphone-off'; iconColor = '#942F31'; }
        else if (item.type === 'voice_mute_all' || item.type === 'voice_muted') { iconName = 'volume-mute'; iconColor = '#FF9500'; }
        else if (item.type === 'voice_unmute_all' || item.type === 'voice_unmuted') { iconName = 'volume-high'; iconColor = '#34C759'; }
        else if (item.type === 'voice_recording_started' || item.type === 'voice_recording_stopped') { iconName = 'record-circle-outline'; iconColor = '#FF3B30'; }
        else if (item.type === 'alert' || item.type === 'broadcast') { iconName = 'bullhorn-outline'; iconColor = '#D4AF37'; }
        else if (item.type === 'seat_update') { iconName = 'car-seat'; iconColor = '#B99A4A'; }
        else if (item.type === 'NEW_SIGN_IN' || item.type === 'new_sign_in' || item.type === 'sign_in' || item.type === 'new_signin') { iconName = 'shield-alert-outline'; iconColor = '#FF9500'; }

        return (
            <TouchableOpacity 
                style={[styles.card, !item.seen && styles.cardUnseen]}
                onPress={() => handleNotificationPress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.iconWrapper}>
                    <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                </View>
                <View style={styles.contentWrapper}>
                    <Text style={[styles.cardTitle, !item.seen && { fontWeight: 'bold' }]}>{item.title}</Text>
                    <Text style={styles.cardDescription}>{item.description}</Text>
                    {item.type === 'location_request' && item.status === 'pending' && item.expiresAt > Date.now() && (
                        <View style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
                            <TouchableOpacity accessibilityRole="button" onPress={() => handleLocationResponse(item, true)}>
                                <Text style={{ color: '#B99A4A' }}>Share for 15 minutes</Text>
                            </TouchableOpacity>
                            <TouchableOpacity accessibilityRole="button" onPress={() => handleLocationResponse(item, false)}>
                                <Text style={{ color: '#FFF' }}>Decline</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {Boolean(item.timestamp) && (
                        <Text style={styles.timeText}>
                            {formatNotificationTime(item.timestamp)}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
                <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} translucent />

                {/* Header */}
                <View style={styles.headerContainer}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Notifications</Text>
                </View>

                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color="#B99A4A" />
                    </View>
                ) : (
                    <FlatList
                        data={notifications}
                        renderItem={rendernotificationItem}
                        keyExtractor={(item, index) => item.uniqueKey || item.id || `notif-${index}`}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="bell-off-outline" size={60} color="rgba(255,255,255,0.2)" />
                                <Text style={styles.emptyText}>No notifications yet</Text>
                            </View>
                        }
                    />
                )}
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 15,
    },
    headerTitle: {
        fontSize: 20,
        color: '#FFF',
        fontFamily: Typography.sans.bold,
        marginLeft: 15,
    },
    backButton: {
        padding: 4,
    },
    listContent: {
        padding: 16,
        paddingBottom: 40,
    },
    card: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    cardUnseen: {
        backgroundColor: 'rgba(185, 154, 74, 0.1)',
        borderColor: 'rgba(185, 154, 74, 0.3)',
    },
    iconWrapper: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    contentWrapper: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 15,
        fontFamily: Typography.sans.bold,
        color: '#fff',
        marginBottom: 4,
    },
    cardDescription: {
        fontSize: 13,
        color: '#A1A1AA',
        lineHeight: 18,
        fontFamily: Typography.sans.regular,
        marginBottom: 6,
    },
    timeText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: Typography.sans.regular,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 100,
    },
    emptyText: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: Typography.sans.medium,
        marginTop: 12,
    },
});

export default NotificationScreen;
