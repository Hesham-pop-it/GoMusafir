import { getVisibleSnapshot, onVisibleValue } from '../../services/visibilityData';
import React, { useState, useEffect } from 'react';
import { ref, get, onValue } from 'firebase/database';
import { database, auth } from '../../config/firebase';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    Dimensions,
    Linking,
    Platform
} from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../../constants/Typography';
import { extractNotificationTimestamp } from '../../utils/notificationNavigation';

const { width } = Dimensions.get('window');



const ALERT_DATA = [
    {
        id: '1',
        title: 'Emergency Alert',
        message: 'needs immediate assistance! Lost near Askari 4.',
        sender: 'Sophia Bennett',
        senderImage: 'https://randomuser.me/api/portraits/women/32.jpg',
        time: '18:00 - 12/12/2025',
        type: 'emergency',
        latitude: 21.4225,
        longitude: 39.8262
    },
    {
        id: '2',
        title: 'Emergency Alert',
        message: 'needs immediate assistance! Medical concern near gate 4.',
        sender: 'Liam Harper',
        senderImage: 'https://randomuser.me/api/portraits/men/33.jpg',
        time: '19:15 - 12/12/2025',
        type: 'emergency',
        latitude: 21.4235,
        longitude: 39.8272
    }
];

const AlertHistoryScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const passedAlerts = route.params?.alerts;
    const tripId = route.params?.tripId;
    const orgId = route.params?.orgId;

    const [liveAlerts, setLiveAlerts] = useState(passedAlerts || []);

    // Real-time synchronization of emergency alerts from RTDB
    useEffect(() => {
        const myUid = auth.currentUser?.uid;
        if (!myUid) return;

        let unsubTrip = null;
        let unsubUser = null;

        if (tripId && orgId) {
            const tripNotifRef = ref(database, `trips_active/${orgId}/${tripId}/notifications/${myUid}`);
            unsubTrip = onVisibleValue(tripNotifRef, tripId, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val() || {};
                    const list = Object.entries(data)
                        .map(([id, val]) => ({ id, ...(val || {}) }))
                        .filter(n => n.type === 'emergency');
                    
                    setLiveAlerts(prev => {
                        const existingMap = new Map();
                        [...list, ...prev].forEach(item => {
                            if (item.id) existingMap.set(item.id, item);
                        });
                        return Array.from(existingMap.values());
                    });
                }
            });
        }

        const userNotifRef = ref(database, `users/${myUid}/notifications`);
        unsubUser = onVisibleValue(userNotifRef, null, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val() || {};
                const list = Object.entries(data)
                    .map(([id, val]) => ({ id, ...(val || {}) }))
                    .filter(n => n.type === 'emergency' && (!tripId || n.tripId === tripId));

                setLiveAlerts(prev => {
                    const existingMap = new Map();
                    [...list, ...prev].forEach(item => {
                        if (item.id) existingMap.set(item.id, item);
                    });
                    return Array.from(existingMap.values());
                });
            }
        });

        return () => {
            if (unsubTrip) unsubTrip();
            if (unsubUser) unsubUser();
        };
    }, [tripId, orgId]);

    // Use liveAlerts if available, otherwise fallback to passedAlerts or ALERT_DATA. Filter only emergency alerts.
    const rawAlerts = liveAlerts.length > 0 ? liveAlerts : (passedAlerts !== undefined ? passedAlerts : ALERT_DATA);
    const alertsToDisplay = [...rawAlerts]
        .filter(item => item.type === 'emergency')
        .sort((a, b) => {
            const timeA = extractNotificationTimestamp(a, a.id);
            const timeB = extractNotificationTimestamp(b, b.id);
            if (timeB !== timeA) return timeB - timeA;
            return String(b.id || '').localeCompare(String(a.id || ''));
        });

    const [profileImages, setProfileImages] = useState({});

    useEffect(() => {
        // Find all unique senderUids in the alerts list
        const uids = Array.from(new Set(
            alertsToDisplay
                .map(item => item.senderUid)
                .filter(uid => typeof uid === 'string' && uid.trim() !== '')
        ));

        if (uids.length === 0) return;

        const fetchProfiles = async () => {
            const promises = uids.map(async (uid) => {
                try {
                    const snap = await getVisibleSnapshot(ref(database, `users/${uid}/profile`), tripId);
                    if (snap.exists()) {
                        const profile = snap.val();
                        return { uid, avatar: profile.photoURL };
                    }
                } catch (e) {
                    console.log("Error fetching profile in AlertHistory:", e);
                }
                return { uid, avatar: null };
            });

            const results = await Promise.all(promises);
            const map = {};
            results.forEach(res => {
                if (res && res.avatar) {
                    map[res.uid] = res.avatar;
                }
            });
            setProfileImages(prev => ({ ...prev, ...map }));
        };

        fetchProfiles();
    }, [alertsToDisplay]);

    const renderEmptyState = () => (
        <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={60} color="#636D77" />
            <Text style={styles.emptyText}>No alerts found</Text>
            <Text style={styles.emptySubtext}>You have no alert history for this trip.</Text>
        </View>
    );

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} - ${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    };

    const renderAlertItem = ({ item }) => {

        let title = '';
        if (item.title && item.message && item.title !== 'Alert!') {
            title = `${item.title}: ${item.message}`;
        } else {
            title = item.message || item.title || '';
        }
        const sender = item.sender || item.name || 'System';
        
        const rawImage = profileImages[item.senderUid] || item.senderImage;
        const senderImage = (rawImage && rawImage.trim() !== '' && !rawImage.includes('d=mp') && !rawImage.includes('gravatar.com'))
            ? rawImage 
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(sender)}&background=B99A4A&color=fff`;

        const time = item.time || formatTime(item.timestamp);

        return (
            <View style={styles.alertCard}>
                <View style={styles.iconContainer}>
                    <Svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <Path d="M10 0C15.5228 0 20 4.47715 20 10C20 15.5228 15.5228 20 10 20C4.47715 20 0 15.5228 0 10C0 4.47715 4.47715 0 10 0ZM10 1.66699C5.39763 1.66699 1.66699 5.39763 1.66699 10C1.66699 14.6024 5.39763 18.333 10 18.333C14.6024 18.333 18.333 14.6024 18.333 10C18.333 5.39763 14.6024 1.66699 10 1.66699ZM10.833 15.417H9.16699V8.75H10.833V15.417ZM10.833 5.41699V7.08301H9.16699V5.41699H10.833Z" fill="#B99A4A" />
                    </Svg>
                </View>
                <View style={styles.contentContainer}>
                    <Text style={styles.alertTitle}>{title}</Text>
                    <View style={styles.senderContainer}>
                        <Image source={{ uri: senderImage }} style={styles.avatar} />
                        <Text style={styles.senderName}>{sender}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <Text style={styles.timeText}>{time}</Text>
                        {(() => {
                            const lat = item.latitude ?? item.lat;
                            const lng = item.longitude ?? item.lng;
                            if (!lat || !lng) return null;
                            return (
                                <TouchableOpacity
                                    style={{
                                        backgroundColor: '#FF3B30',
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 12,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 4
                                    }}
                                    onPress={() => {
                                        const url = Platform.select({
                                            ios: `maps:0,0?q=${lat},${lng}`,
                                            android: `geo:0,0?q=${lat},${lng}`
                                        });
                                        Linking.openURL(url);
                                    }}
                                >
                                    <Ionicons name="location-outline" size={14} color="#FFF" />
                                    <Text style={{ color: '#FFF', fontSize: 11, fontFamily: Typography.sans.bold }}>Location</Text>
                                </TouchableOpacity>
                            );
                        })()}
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#1A1E21' }}>
            <LinearGradient
                colors={['#332F2B', '#1A1E21']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120 }}
            />
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Alert History</Text>
                    <View style={{ width: 40 }} />
                </View>

                <FlatList
                    data={alertsToDisplay}
                    renderItem={renderAlertItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={alertsToDisplay.length === 0 ? [styles.listContent, { flex: 1 }] : styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={renderEmptyState}
                />
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
        textAlign: 'center',
    },
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
    },
    alertCard: {
        backgroundColor: '#23272A',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#23272A',
        alignItems: 'center',
    },
    iconContainer: {
        marginRight: 15,
        marginTop: 2,
    },
    contentContainer: {
        flex: 1,
    },
    alertTitle: {
        color: '#FFF',
        fontSize: 14,
        lineHeight: 22,
        marginBottom: 12,
        fontFamily: Typography.sans.regular
    },
    senderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    avatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        marginRight: 8,
    },
    senderName: {
        color: '#ffffff',
        fontSize: 12,
        fontFamily: Typography.sans.semiBold,
        opacity: 0.6
    },
    timeText: {
        color: '#ffffff',
        fontSize: 12,
        fontFamily: Typography.sans.semiBold,
        opacity: 0.6
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
        marginTop: 100,
    },
    emptyText: {
        color: '#FFF',
        fontSize: 20,
        fontFamily: Typography.sans.bold,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtext: {
        color: '#A1A1AA',
        fontSize: 14,
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 20,
    },
});

export default AlertHistoryScreen;
