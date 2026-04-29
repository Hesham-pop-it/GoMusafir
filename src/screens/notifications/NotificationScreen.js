import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    StatusBar,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { ref, onValue, get } from 'firebase/database';
import { database, auth } from '../../config/firebase';

const NotificationScreen = ({ navigation }) => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth.currentUser) return;

        const uid = auth.currentUser.uid;
        let unsubscribeNotifications = null;

        const setupListener = async () => {
            try {
                // 1. Get current trip info
                const userSnap = await get(ref(database, `users/${uid}`));
                const userData = userSnap.val();
                const tripId = userData?.current_trip;
                const orgId = userData?.staff_org_id || userData?.joined_trips?.[tripId]?.orgId;

                if (!tripId || !orgId) {
                    setLoading(false);
                    return;
                }

                // 2. Listen to notifications
                const notifRef = ref(database, `trips_active/${orgId}/${tripId}/notifications/${uid}`);
                unsubscribeNotifications = onValue(notifRef, (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        const list = Object.entries(data).map(([id, val]) => ({
                            id,
                            ...val,
                            title: getTitle(val.type, val.name),
                            description: getDescription(val),
                            seen: val.read === true,
                        })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                        setNotifications(list);
                    } else {
                        setNotifications([]);
                    }
                    setLoading(false);
                });
            } catch (error) {
                console.log("Notif setup error:", error);
                setLoading(false);
            }
        };

        setupListener();

        return () => {
            if (unsubscribeNotifications) unsubscribeNotifications();
        };
    }, []);

    const getTitle = (type, name) => {
        switch (type) {
            case 'location_request': return 'Location Request';
            case 'emergency': return 'HELP REQUESTED!';
            case 'trip_started': return 'Trip Started';
            case 'trip_ended': return 'Trip Ended';
            case 'voice_started': return 'Voice Channel Active';
            default: return 'New Update';
        }
    };

    const getDescription = (item) => {
        switch (item.type) {
            case 'location_request': return `${item.name || 'A participant'} wants to see your live location.`;
            case 'emergency': return `${item.name || 'Someone'} needs immediate assistance!`;
            case 'trip_started': return 'The journey has officially begun. Stay safe!';
            case 'trip_ended': return 'The trip has concluded. We hope you had a great journey!';
            case 'voice_started': return `${item.name || 'Organizer'} started a voice channel.`;
            default: return item.text || 'You have a new notification.';
        }
    };

    const rendernotificationItem = ({ item }) => {
        let iconName = 'bell-outline';
        let iconColor = '#FFF';

        if (item.type === 'emergency') { iconName = 'alert-octagon'; iconColor = '#FF3B30'; }
        else if (item.type === 'location_request') { iconName = 'map-marker-radius'; iconColor = '#34C759'; }
        else if (item.type === 'trip_started') { iconName = 'flag-variant'; iconColor = '#B99A4A'; }
        else if (item.type === 'voice_started') { iconName = 'microphone'; iconColor = '#5856D6'; }

        return (
            <TouchableOpacity style={[styles.card, !item.seen && styles.cardUnseen]}>
                <View style={styles.iconWrapper}>
                    <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                </View>
                <View style={styles.contentWrapper}>
                    <Text style={[styles.cardTitle, !item.seen && { fontWeight: 'bold' }]}>{item.title}</Text>
                    <Text style={styles.cardDescription}>{item.description}</Text>
                    {item.timestamp && (
                        <Text style={styles.timeText}>
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                        keyExtractor={item => item.id}
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
