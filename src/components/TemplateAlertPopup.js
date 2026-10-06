import { onVisibleValue } from '../services/visibilityData';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    AppState,
    StyleSheet,
    View,
    Text,
    Image,
    Platform,
    Animated,
    PanResponder,
    TouchableOpacity,
    Vibration,
    Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ref, onValue, get, update, query, limitToLast } from 'firebase/database';
import { auth, database } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Colors } from '../constants/Colors';
import { Typography } from '../constants/Typography';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import CompatModal from './CompatModal';
import GradientBorderButton from './GradientBorderButton';
import { navigationRef } from '../navigation/RootNavigator';
import { navigateToNotificationTarget, extractNotificationTimestamp } from '../utils/notificationNavigation';

import { playNotificationSound, stopNotificationSound } from '../services/notificationAudio';
import { subscribeForegroundNotifications, claimNotification, resetNotificationPresentation } from '../services/notificationPresentation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function TemplateAlertPopup() {
    const insets = useSafeAreaInsets();

    // Modal Alert State (for critical 'alert' and 'emergency' notifications)
    const [modalAlert, setModalAlert] = useState(null);

    // Floating Banner State (for all in-app notifications and chat messages)
    const [bannerNotif, setBannerNotif] = useState(null);

    const [user, setUser] = useState(null);

    // Track seen notification/message IDs to prevent duplicate popups
    const seenIdsRef = useRef(new Set());
    // Explicitly track dismissed alert IDs so acknowledged alerts cannot re-trigger in this session
    const dismissedAlertIdsRef = useRef(new Set());
    // Record mount time to avoid popping up old historical messages
    const mountTimeRef = useRef(Date.now());

    const bannerNotifRef = useRef(bannerNotif);
    bannerNotifRef.current = bannerNotif;

    const userRef = useRef(user);
    userRef.current = user;

    // Banner animation value (0 = hidden above screen, 1 = fully visible)
    const bannerAnim = useRef(new Animated.Value(0)).current;
    const dismissTimerRef = useRef(null);

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
            setUser(u);
            if (!u) {
                setModalAlert(null);
                setBannerNotif(null);
                resetNotificationPresentation();
                stopNotificationSound();
                seenIdsRef.current.clear();
                dismissedAlertIdsRef.current.clear();
                mountTimeRef.current = Date.now();
            }
        });
        return () => unsubscribeAuth();
    }, []);

    // Dismiss Floating Banner with animation
    const hideBanner = useCallback(() => {
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }

        const currentBanner = bannerNotifRef.current;
        const currentUser = userRef.current;

        if (currentBanner && !currentBanner._pushOnly && currentUser) {
            const { id, tripId, orgId, isUserGlobal } = currentBanner;
            if (id) {
                dismissedAlertIdsRef.current.add(id);
                seenIdsRef.current.add(id);
                seenIdsRef.current.add(`global_${id}`);
                if (tripId) seenIdsRef.current.add(`trip_${tripId}_${id}`);

                try {
                    // Only update the exact source of this notification.
                    // Never update trips_active with a user-global ID or a chat ID.
                    if (isUserGlobal) {
                        update(ref(database, `users/${currentUser.uid}/notifications/${id}`), { read: true, seen: true }).catch(() => { });
                    } else if (currentBanner.type !== 'chat_message' && tripId && orgId) {
                        update(ref(database, `trips_active/${orgId}/${tripId}/notifications/${currentUser.uid}/${id}`), { read: true, seen: true }).catch(() => { });
                    }
                } catch (e) { }
            }
        }

        Animated.timing(bannerAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setBannerNotif(null);
        });
    }, [bannerAnim]);

    // Show Floating Banner with animation
    const showBanner = useCallback((notif) => {
        if (!notif || !notif.id) return;
        // Don't show if already dismissed in this session
        if (dismissedAlertIdsRef.current.has(notif.id)) return;

        if (!claimNotification(notif, notif._source || 'database')) return;
        if (AppState.currentState !== 'active') return;
        playNotificationSound(notif);
        if (notif.type === 'voice_inactivity') return;
        const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : null;
        if (['chat', 'chat_message'].includes(notif.type) && route?.name === 'TripChat' &&
            (route.params?.tripId || route.params?.trip?.id) === notif.tripId) return;

        // Haptic / vibration feedback
        try {
            if (Platform.OS === 'ios' || Platform.OS === 'android') {
                Vibration.vibrate(50);
            }
        } catch (e) { }

        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }

        setBannerNotif(notif);
        bannerAnim.setValue(0);

        Animated.spring(bannerAnim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 8,
            tension: 50,
        }).start();

        // Auto-hide after 5.5 seconds (or 8 seconds for emergency)
        const duration = notif?.type === 'emergency' ? 8000 : 5500;
        dismissTimerRef.current = setTimeout(() => {
            hideBanner();
        }, duration);
    }, [bannerAnim, hideBanner]);

    useEffect(() => {
        const unsubscribe = subscribeForegroundNotifications(notif => {
            if (auth.currentUser) showBanner(notif);
        });
        const stateSubscription = AppState.addEventListener('change', state => {
            if (state !== 'active') {
                stopNotificationSound();
                if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
                setBannerNotif(null);
                setModalAlert(null);
                bannerAnim.setValue(0);
            } else {
                // Do not replay notifications received while the OS owned delivery.
                mountTimeRef.current = Date.now();
            }
        });
        return () => { unsubscribe(); stateSubscription.remove(); stopNotificationSound();
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); };
    }, [showBanner, bannerAnim]);

    // PanResponder for swiping up to dismiss the banner
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return gestureState.dy < -6;
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy < -10) {
                    hideBanner();
                }
            },
        })
    ).current;

    // Handle tapping on the floating banner to navigate
    const handleBannerPress = async () => {
        if (!bannerNotif) return;
        const currentNotif = { ...bannerNotif };
        hideBanner();

        await navigateToNotificationTarget(currentNotif);
    };

    // Modal Alert Dismissal (Acknowledge Button)
    const handleDismissModal = useCallback(async () => {
        if (!modalAlert) return;
        const currentAlert = { ...modalAlert };
        const currentUser = userRef.current || user;

        // 1. Immediately dismiss modal from UI
        setModalAlert(null);

        // 2. Add ID to dismissed set so it can never re-trigger in this session
        if (currentAlert.id) {
            dismissedAlertIdsRef.current.add(currentAlert.id);
            seenIdsRef.current.add(currentAlert.id);
            seenIdsRef.current.add(`global_${currentAlert.id}`);
            if (currentAlert.tripId) {
                seenIdsRef.current.add(`trip_${currentAlert.tripId}_${currentAlert.id}`);
            }
        }

        // 3. If banner is displaying this same alert, dismiss banner as well
        if (bannerNotifRef.current?.id === currentAlert.id) {
            hideBanner();
        }

        // 4. Mark notification as read and seen in Realtime Database
        if (currentUser?.uid && currentAlert.id) {
            const uid = currentUser.uid;
            const notifId = currentAlert.id;
            const tId = currentAlert.tripId;
            const oId = currentAlert.orgId;
            const isGlobal = currentAlert.isUserGlobal;

            try {
                if (isGlobal) {
                    await update(ref(database, `users/${uid}/notifications/${notifId}`), { read: true, seen: true });
                } else if (oId && tId) {
                    await update(ref(database, `trips_active/${oId}/${tId}/notifications/${uid}/${notifId}`), { read: true, seen: true });
                }
            } catch (e) {
                console.log('[TemplateAlertPopup] Failed to mark alert as read:', e);
            }
        }
    }, [modalAlert, user, hideBanner]);

    const handleViewEmergencyDetails = useCallback(async () => {
        if (!modalAlert) return;
        const currentAlert = { ...modalAlert };
        await handleDismissModal();
        await navigateToNotificationTarget(currentAlert);
    }, [modalAlert, handleDismissModal]);

    // Main Listeners Setup
    useEffect(() => {
        if (!user) return;

        const uid = user.uid;
        mountTimeRef.current = Date.now();

        // 1. Global User-level Notifications Listener
        let isGlobalInitialLoad = true;
        const userNotifRef = ref(database, `users/${uid}/notifications`);
        const unsubUserNotifs = onVisibleValue(userNotifRef, null, (snap) => {
            if (!snap.exists()) {
                isGlobalInitialLoad = false;
                return;
            }

            const data = snap.val() || {};
            const keys = Object.keys(data);

            // On initial load, mark all existing historical notifications as seen
            if (isGlobalInitialLoad) {
                isGlobalInitialLoad = false;
                keys.forEach((k) => {
                    seenIdsRef.current.add(`global_${k}`);
                    seenIdsRef.current.add(k);
                });
                return;
            }

            let newestGlobalNotif = null;

            // Check for newly arriving notifications in real time
            for (const [notifId, item] of Object.entries(data)) {
                if (!item || typeof item !== 'object') continue;
                const uniqueKey = `global_${notifId}`;

                const isAlreadySeen = seenIdsRef.current.has(uniqueKey) || seenIdsRef.current.has(notifId) || dismissedAlertIdsRef.current.has(notifId);
                const isFromMe = item.senderUid && item.senderUid === uid;
                const isRead = item.read === true || item.seen === true;

                // Always mark every present key as seen so it cannot re-trigger on subsequent RTDB events
                seenIdsRef.current.add(uniqueKey);
                seenIdsRef.current.add(notifId);

                if (isAlreadySeen || isFromMe || isRead) continue;

                const itemTimestamp = extractNotificationTimestamp(item, notifId);
                const isRealTime = itemTimestamp >= mountTimeRef.current - 1000;
                if (!isRealTime) continue;

                const formattedNotif = {
                    id: notifId,
                    isUserGlobal: true,
                    tripId: item.tripId || null,
                    orgId: item.orgId || null,
                    type: item.type || 'notification',
                    title: item.title || (item.type === 'emergency' ? 'Emergency Alert' : 'Notification'),
                    message: item.message || '',
                    name: item.name || (item.type === 'emergency' ? 'Participant' : 'GoMusafir'),
                    senderUid: item.senderUid,
                    senderImage: item.senderImage,
                    latitude: item.latitude || item.lat,
                    longitude: item.longitude || item.lng,
                    lat: item.lat || item.latitude,
                    lng: item.lng || item.longitude,
                    timestamp: itemTimestamp || Date.now(),
                };

                if (!newestGlobalNotif || formattedNotif.timestamp > newestGlobalNotif.timestamp) {
                    newestGlobalNotif = formattedNotif;
                }
            }

            if (newestGlobalNotif) {
                showBanner(newestGlobalNotif);
            }
        }, (err) => {
            console.log("[TemplateAlertPopup] userNotifs error:", err?.message);
        });

        // 2. Trip-level Notifications & Chat Listeners Management
        const tripListenersMap = new Map(); // key: tripId, val: { unsubNotif, unsubChat, orgId }

        const userRefPath = ref(database, `users/${uid}`);
        const unsubUserData = onVisibleValue(userRefPath, null, async (snapshot) => {
            if (!snapshot.exists()) return;

            const userData = snapshot.val() || {};
            const joinedTrips = userData.joined_trips || {};

            const activeTrips = new Map(); // tripId -> orgId

            // Check current_trip
            if (userData.current_trip) {
                const cTrip = userData.current_trip;
                let cOrg = userData.staff_org_id || joinedTrips[cTrip]?.org_id || joinedTrips[cTrip]?.orgId;
                if (!cOrg) {
                    try {
                        const orgSnap = await get(ref(database, `trips_orgs/${cTrip}`));
                        if (orgSnap.exists()) cOrg = orgSnap.val();
                    } catch (e) { }
                }
                if (cOrg) {
                    activeTrips.set(cTrip, cOrg);
                }
            }

            // Check joined trips
            for (const tId of Object.keys(joinedTrips)) {
                if (activeTrips.has(tId)) continue;
                let oId = joinedTrips[tId]?.org_id || joinedTrips[tId]?.orgId;
                if (!oId) {
                    try {
                        const orgSnap = await get(ref(database, `trips_orgs/${tId}`));
                        if (orgSnap.exists()) oId = orgSnap.val();
                    } catch (e) { }
                }
                if (oId) {
                    activeTrips.set(tId, oId);
                }
            }

            // Remove listeners for trips that are no longer active
            for (const [tId, listenerObj] of tripListenersMap.entries()) {
                if (!activeTrips.has(tId)) {
                    listenerObj.unsubNotif?.();
                    listenerObj.unsubChat?.();
                    tripListenersMap.delete(tId);
                }
            }

            // Add listeners for newly added active trips
            for (const [tripId, orgId] of activeTrips.entries()) {
                if (tripListenersMap.has(tripId)) continue;

                let isTripNotifInitialLoad = true;
                let isTripChatInitialLoad = true;

                // Trip-level Notifications
                const notifRef = ref(database, `trips_active/${orgId}/${tripId}/notifications/${uid}`);
                const unsubNotif = onVisibleValue(notifRef, tripId, (notifSnapshot) => {
                    if (!notifSnapshot.exists()) {
                        isTripNotifInitialLoad = false;
                        return;
                    }

                    const notifsData = notifSnapshot.val() || {};
                    const notifIds = Object.keys(notifsData);

                    // On initial load, mark all existing historical notifications as seen
                    if (isTripNotifInitialLoad) {
                        isTripNotifInitialLoad = false;
                        notifIds.forEach((id) => {
                            seenIdsRef.current.add(id);
                            seenIdsRef.current.add(`trip_${tripId}_${id}`);
                        });
                        return;
                    }

                    let newestTripNotif = null;

                    // Check for newly added unread notifications in real time
                    for (const [notifId, notif] of Object.entries(notifsData)) {
                        if (!notif || typeof notif !== 'object') continue;
                        const tripScopedKey = `trip_${tripId}_${notifId}`;

                        const isAlreadySeen = seenIdsRef.current.has(notifId) || seenIdsRef.current.has(tripScopedKey) || dismissedAlertIdsRef.current.has(notifId);
                        const isFromMe = notif.senderUid && notif.senderUid === uid;
                        const isRead = notif.read === true || notif.seen === true;

                        // Mark every item present as seen in this session
                        seenIdsRef.current.add(notifId);
                        seenIdsRef.current.add(tripScopedKey);

                        if (isAlreadySeen || isFromMe || isRead) continue;

                        const itemTimestamp = extractNotificationTimestamp(notif, notifId);
                        const isRealTime = itemTimestamp >= mountTimeRef.current - 1000;
                        if (!isRealTime) continue;

                        const formattedNotif = {
                            id: notifId,
                            tripId,
                            orgId,
                            type: notif.type || 'notification',
                            title: notif.title || (
                                notif.type === 'location_request' ? 'Location Request' :
                                    notif.type === 'emergency' ? 'Emergency Alert' :
                                        notif.type === 'alert' ? 'Trip Update' :
                                            notif.type === 'chat_message' ? 'Trip Chat' :
                                                notif.type === 'voice_started' ? 'Voice Chat Started' :
                                                    notif.type === 'voice_ended' ? 'Voice Chat Ended' :
                                                        notif.type === 'voice_mute_all' ? 'Organizer Muted Everyone' :
                                                            notif.type === 'voice_unmute_all' ? 'Mute All Disabled' :
                                                                notif.type === 'voice_muted' ? 'Microphone Muted' :
                                                                    notif.type === 'voice_unmuted' ? 'Microphone Unmuted' :
                                                                        notif.type === 'voice_recording_started' ? 'Recording Started' :
                                                                            notif.type === 'voice_recording_stopped' ? 'Recording Stopped' :
                                                                                notif.type?.startsWith('voice') ? 'Voice Chat' :
                                                                                    'Trip Notification'
                            ),
                            message: notif.message || '',
                            name: notif.name || 'Organizer',
                            senderUid: notif.senderUid,
                            senderImage: notif.senderImage,
                            latitude: notif.latitude || notif.lat,
                            longitude: notif.longitude || notif.lng,
                            lat: notif.lat || notif.latitude,
                            lng: notif.lng || notif.longitude,
                            timestamp: itemTimestamp || Date.now(),
                        };

                        // If this is a chat message, check if user is already actively viewing that TripChat screen
                        if (formattedNotif.type === 'chat_message') {
                            const currentRoute = navigationRef.isReady() ? navigationRef.getCurrentRoute() : null;
                            if (currentRoute?.name === 'TripChat' && currentRoute?.params?.tripId === tripId) {
                                continue;
                            }
                        }

                        if (!newestTripNotif || formattedNotif.timestamp > newestTripNotif.timestamp) {
                            newestTripNotif = formattedNotif;
                        }
                    }

                    if (newestTripNotif) {
                        // If critical emergency, show the central modal as well

                        // Show top banner popup
                        showBanner(newestTripNotif);
                    }
                }, (err) => {
                    console.log("[TemplateAlertPopup] trip notif error:", err?.message);
                });

                // Direct Trip Chat Listener (ensures instant in-app popups even if cloud functions are delayed)
                const chatRef = query(ref(database, `trips_active/${orgId}/${tripId}/chat`), limitToLast(5));
                const unsubChat = onVisibleValue(chatRef, tripId, (chatSnapshot) => {
                    if (!chatSnapshot.exists()) {
                        isTripChatInitialLoad = false;
                        return;
                    }

                    const chatData = chatSnapshot.val() || {};
                    const msgIds = Object.keys(chatData);

                    if (isTripChatInitialLoad) {
                        isTripChatInitialLoad = false;
                        msgIds.forEach((id) => seenIdsRef.current.add(`chat_${id}`));
                        return;
                    }

                    let newestChatMsg = null;

                    for (const [msgId, msg] of Object.entries(chatData)) {
                        if (!msg || typeof msg !== 'object') continue;
                        const uniqueKey = `chat_${msgId}`;
                        const isAlreadySeen = seenIdsRef.current.has(uniqueKey);
                        seenIdsRef.current.add(uniqueKey);

                        const isFromMe = (msg.sender_id && msg.sender_id === uid) || (msg.senderUid && msg.senderUid === uid);
                        if (isAlreadySeen || isFromMe) continue;

                        const msgTimestamp = extractNotificationTimestamp(msg, msgId);
                        const isRealTime = msgTimestamp >= mountTimeRef.current - 1000;
                        if (!isRealTime) continue;

                        const currentRoute = navigationRef.isReady() ? navigationRef.getCurrentRoute() : null;
                        if (currentRoute?.name === 'TripChat' && currentRoute?.params?.tripId === tripId) {
                            // Suppress popup if user is actively in the chat screen
                            continue;
                        }

                        let previewText = msg.text || '';
                        if (msg.type === 'image') previewText = 'Sent a photo 📷';
                        else if (msg.type === 'voice') previewText = 'Sent a voice message 🎤';
                        else if (msg.type === 'location') previewText = 'Shared a location 📍';

                        const formattedChat = {
                            id: msgId,
                            tripId,
                            orgId,
                            type: 'chat_message',
                            title: msg.sender_name || 'New Message',
                            message: previewText,
                            name: msg.sender_name || 'Someone',
                            senderUid: msg.sender_id || msg.senderUid,
                            timestamp: msgTimestamp || Date.now(),
                        };

                        if (!newestChatMsg || formattedChat.timestamp > newestChatMsg.timestamp) {
                            newestChatMsg = formattedChat;
                        }
                    }

                    if (newestChatMsg) {
                        showBanner(newestChatMsg);
                    }
                }, (err) => {
                    console.log("[TemplateAlertPopup] chat listener error:", err?.message);
                });

                tripListenersMap.set(tripId, { unsubNotif, unsubChat, orgId });
            }
        }, (err) => {
            console.log("[TemplateAlertPopup] user listener error:", err?.message);
        });

        return () => {
            unsubUserNotifs();
            unsubUserData();
            for (const [, listenerObj] of tripListenersMap.entries()) {
                listenerObj.unsubNotif?.();
                listenerObj.unsubChat?.();
            }
            tripListenersMap.clear();
        };
    }, [user, showBanner]);

    // Format badge text and icon according to notification type
    const getNotificationVisuals = (notif) => {
        if (!notif) return { icon: 'notifications', color: '#B99A4A', tag: 'Update' };
        switch (notif.type) {
            case 'chat_message':
            case 'chat':
                return { icon: 'chatbubble-ellipses', color: '#34C759', tag: 'Trip Chat' };
            case 'emergency':
                return { icon: 'warning', color: '#FF3B30', tag: 'Emergency' };
            case 'location_request':
                return { icon: 'location', color: '#0A84FF', tag: 'Location' };
            case 'voice_started':
            case 'voice_channel_update':
                return { icon: 'mic', color: '#5856D6', tag: 'Voice Chat' };
            case 'voice_ended':
                return { icon: 'mic-off', color: '#942F31', tag: 'Voice Chat' };
            case 'voice_mute_all':
            case 'voice_muted':
                return { icon: 'volume-mute', color: '#FF9500', tag: 'Voice Chat' };
            case 'voice_unmute_all':
            case 'voice_unmuted':
                return { icon: 'volume-high', color: '#34C759', tag: 'Voice Chat' };
            case 'voice_recording_started':
            case 'voice_recording_stopped':
                return { icon: 'radio-button-on', color: '#FF3B30', tag: 'Voice Chat' };
            case 'alert':
                return { icon: 'notifications', color: '#B99A4A', tag: 'Trip Alert' };
            case 'seat_update':
                return { icon: 'people', color: '#B99A4A', tag: 'Seat Update' };
            case 'NEW_SIGN_IN':
            case 'new_sign_in':
            case 'sign_in':
            case 'new_signin':
                return { icon: 'shield-checkmark', color: '#FF9500', tag: 'Security' };
            default:
                if (notif.type?.startsWith('voice')) {
                    return { icon: 'mic', color: '#5856D6', tag: 'Voice Chat' };
                }
                return { icon: 'notifications', color: '#B99A4A', tag: 'GoMusafir' };
        }
    };

    const visuals = getNotificationVisuals(bannerNotif);

    // Banner translate and opacity interpolation
    const bannerTranslateY = bannerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-140, 0],
    });

    const bannerOpacity = bannerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    });

    return (
        <View style={styles.rootLayer} pointerEvents="box-none">
            {/* ── TOP FLOATING NOTIFICATION POP-UP BANNER ─────────────────── */}
            {bannerNotif && (
                <Animated.View
                    style={[
                        styles.bannerWrapper,
                        {
                            top: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20) + 4,
                            transform: [{ translateY: bannerTranslateY }],
                            opacity: bannerOpacity,
                        },
                    ]}
                    {...panResponder.panHandlers}
                >
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={handleBannerPress}
                        style={[
                            styles.bannerContainer,
                            { borderColor: visuals.color || '#B99A4A' }
                        ]}
                    >
                        {/* Left Icon Pill */}
                        <View style={[styles.bannerIconContainer, { backgroundColor: `${visuals.color}20`, borderColor: `${visuals.color}40` }]}>
                            <Ionicons name={visuals.icon} size={20} color={visuals.color} />
                        </View>

                        {/* Content */}
                        <View style={styles.bannerContent}>
                            <View style={styles.bannerHeaderRow}>
                                <Text style={styles.bannerSender} numberOfLines={1}>
                                    {bannerNotif.name || bannerNotif.title || 'GoMusafir'}
                                </Text>
                                <View style={[styles.badgeTag, { backgroundColor: `${visuals.color}20`, borderColor: `${visuals.color}50` }]}>
                                    <Text style={[styles.badgeTagText, { color: visuals.color }]}>
                                        {visuals.tag}
                                    </Text>
                                </View>
                            </View>

                            <Text style={styles.bannerMessage} numberOfLines={2}>
                                {bannerNotif.message || 'You have a new update.'}
                            </Text>
                        </View>

                        {/* Dismiss Button */}
                        <TouchableOpacity
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            onPress={hideBanner}
                            style={styles.bannerCloseBtn}
                        >
                            <Ionicons name="close" size={16} color="#8E9297" />
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Animated.View>
            )}

            {/* ── CRITICAL EMERGENCY SOS MODAL ───────────────────────── */}
            {modalAlert && modalAlert.type === 'emergency' && (
                <CompatModal
                    isVisible={!!modalAlert && modalAlert.type === 'emergency'}
                    onBackdropPress={handleDismissModal}
                    backdropOpacity={0.85}
                    style={styles.modalStyle}
                    animationIn="fadeIn"
                    animationOut="fadeOut"
                    useNativeDriver={true}
                    hideModalContentWhileAnimating={true}
                >
                    <View style={[styles.modalCardContainer, styles.modalCardContainerEmergency]}>
                        {/* Header Section */}
                        <LinearGradient
                            colors={['#2E181A', '#181B1E']}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={styles.modalHeaderSection}
                        >
                            {/* Close Icon Top-Right */}
                            <TouchableOpacity
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                onPress={handleDismissModal}
                                style={styles.modalTopCloseBtn}
                            >
                                <Ionicons name="close" size={20} color="#8E9297" />
                            </TouchableOpacity>

                            {/* Centered Glowing Icon Badge */}
                            <View style={[styles.modalIconBadge, styles.modalIconBadgeEmergency]}>
                                <Ionicons name="warning" size={30} color="#FFF" />
                            </View>

                            {/* Title & Tag */}
                            <Text style={styles.modalHeaderTitle}>SOS ALERT TRIGGERED</Text>
                            <Text style={[styles.modalHeaderSubtitle, { color: '#FF453A' }]}>
                                IMMEDIATE ATTENTION REQUIRED
                            </Text>
                        </LinearGradient>

                        <View style={styles.modalContentContainer}>
                            {/* Participant / Sender Row */}
                            <View style={styles.modalSenderRow}>
                                <Image
                                    source={{
                                        uri: modalAlert.senderImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(modalAlert.name || 'P')}&background=FF3B30&color=fff`
                                    }}
                                    style={[styles.modalAvatar, { borderColor: '#FF3B30' }]}
                                />
                                <View style={styles.modalSenderInfo}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Text style={styles.modalSenderName} numberOfLines={1}>
                                            {modalAlert.name || 'Participant'}
                                        </Text>
                                        <View style={[styles.senderBadgeTag, styles.senderBadgeTagEmergency]}>
                                            <Text style={[styles.senderBadgeText, { color: '#FF453A' }]}>SOS</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.modalSenderSubtext}>Triggered emergency alert</Text>
                                </View>
                            </View>

                            {/* Message Box */}
                            <View style={styles.modalMessageBox}>
                                <Text style={styles.modalMessageText}>
                                    {modalAlert.message || 'needs immediate assistance!'}
                                </Text>
                            </View>

                            {/* GPS Location Indicator (if coordinates available) */}
                            {(modalAlert.latitude || modalAlert.lat) && (
                                <View style={styles.gpsIndicatorRow}>
                                    <Ionicons name="location-sharp" size={14} color="#FF3B30" />
                                    <Text style={styles.gpsIndicatorText}>Live GPS location coordinates attached</Text>
                                </View>
                            )}

                            {/* Action Buttons */}
                            <View style={{ width: '100%', gap: 10, marginTop: 14 }}>
                                <TouchableOpacity
                                    activeOpacity={0.88}
                                    onPress={handleViewEmergencyDetails}
                                    style={styles.emergencyPrimaryBtn}
                                >
                                    <LinearGradient
                                        colors={['#B91C1C', '#8E1B1E']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.emergencyPrimaryGradient}
                                    >
                                        <Ionicons name="location" size={18} color="#FFF" style={{ marginRight: 6 }} />
                                        <Text style={styles.emergencyPrimaryText}>
                                            View Location & Details
                                        </Text>
                                    </LinearGradient>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={handleDismissModal}
                                    style={styles.secondaryDismissBtn}
                                >
                                    <Text style={styles.secondaryDismissText}>
                                        Acknowledge & Close
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </CompatModal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    rootLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        elevation: 99999,
    },

    /* ── Floating Top Banner Styles ────────────────────────────────────────── */
    bannerWrapper: {
        position: 'absolute',
        left: 14,
        right: 14,
        zIndex: 99999,
        alignItems: 'center',
    },
    bannerContainer: {
        width: '100%',
        backgroundColor: '#1E2124',
        borderRadius: 22,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: 1.2,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.55,
                shadowRadius: 12,
            },
            android: {
                elevation: 16,
            },
        }),
    },
    bannerIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 1,
    },
    bannerContent: {
        flex: 1,
        justifyContent: 'center',
        marginRight: 8,
    },
    bannerHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 3,
    },
    bannerSender: {
        fontFamily: Typography.sans.bold,
        fontSize: 14,
        color: '#FFFFFF',
        flexShrink: 1,
        marginRight: 6,
    },
    badgeTag: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
        borderWidth: 1,
    },
    badgeTagText: {
        fontFamily: Typography.sans.semiBold,
        fontSize: 9.5,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    bannerMessage: {
        fontFamily: Typography.sans.regular,
        fontSize: 13,
        color: '#C4C8CC',
        lineHeight: 18,
    },
    bannerCloseBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    /* ── Critical Alert / Emergency Modal Styles ──────────────────────────── */
    modalStyle: {
        margin: 0,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    modalCardContainer: {
        width: '100%',
        maxWidth: 380,
        backgroundColor: '#181B1E',
        borderRadius: 28,
        borderWidth: 1.2,
        borderColor: '#B99A4A',
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.65,
                shadowRadius: 16,
            },
            android: {
                elevation: 20,
            },
        }),
    },
    modalCardContainerEmergency: {
        borderColor: 'rgba(255, 59, 48, 0.6)',
    },
    modalHeaderSection: {
        alignItems: 'center',
        paddingTop: 24,
        paddingBottom: 16,
        paddingHorizontal: 20,
        position: 'relative',
    },
    modalTopCloseBtn: {
        position: 'absolute',
        top: 14,
        right: 14,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    modalIconBadge: {
        width: 58,
        height: 58,
        borderRadius: 29,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 2,
    },
    modalIconBadgeEmergency: {
        backgroundColor: '#942F31',
        borderColor: 'rgba(255, 59, 48, 0.5)',
        ...Platform.select({
            ios: {
                shadowColor: '#FF3B30',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 10,
            },
            android: {
                elevation: 8,
            },
        }),
    },
    modalIconBadgeNormal: {
        backgroundColor: 'rgba(185, 154, 74, 0.15)',
        borderColor: '#B99A4A',
    },
    modalHeaderTitle: {
        fontFamily: Typography.serif.bold,
        fontSize: 21,
        color: '#FFFFFF',
        letterSpacing: 1.1,
        textAlign: 'center',
        marginBottom: 4,
    },
    modalHeaderSubtitle: {
        fontFamily: Typography.sans.semiBold,
        fontSize: 11,
        color: '#B99A4A',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    modalContentContainer: {
        paddingHorizontal: 20,
        paddingBottom: 22,
        alignItems: 'center',
    },
    modalSenderRow: {
        width: '100%',
        backgroundColor: '#202428',
        borderRadius: 18,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
    },
    modalAvatar: {
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 1.5,
        marginRight: 12,
    },
    modalSenderInfo: {
        flex: 1,
    },
    modalSenderName: {
        fontFamily: Typography.sans.bold,
        fontSize: 15,
        color: '#FFFFFF',
        flex: 1,
        marginRight: 8,
    },
    senderBadgeTag: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
    },
    senderBadgeTagEmergency: {
        backgroundColor: 'rgba(255, 59, 48, 0.15)',
        borderColor: 'rgba(255, 59, 48, 0.4)',
    },
    senderBadgeTagNormal: {
        backgroundColor: 'rgba(185, 154, 74, 0.15)',
        borderColor: 'rgba(185, 154, 74, 0.4)',
    },
    senderBadgeText: {
        fontFamily: Typography.sans.bold,
        fontSize: 9.5,
        letterSpacing: 0.5,
    },
    modalSenderSubtext: {
        fontFamily: Typography.sans.regular,
        fontSize: 12,
        color: '#9BA1A6',
        marginTop: 2,
    },
    modalMessageBox: {
        width: '100%',
        backgroundColor: '#23272A',
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(185, 154, 74, 0.18)',
    },
    modalMessageText: {
        fontFamily: Typography.sans.regular,
        fontSize: 15,
        color: '#E4E4E7',
        lineHeight: 22,
        textAlign: 'center',
    },
    gpsIndicatorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        gap: 6,
    },
    gpsIndicatorText: {
        fontFamily: Typography.sans.medium,
        fontSize: 11.5,
        color: '#9BA1A6',
    },
    emergencyPrimaryBtn: {
        width: '100%',
        borderRadius: 28,
        overflow: 'hidden',
    },
    emergencyPrimaryGradient: {
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    emergencyPrimaryText: {
        color: '#FFFFFF',
        fontSize: 15.5,
        fontFamily: Typography.sans.bold,
        letterSpacing: 0.3,
    },
    secondaryDismissBtn: {
        paddingVertical: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryDismissText: {
        color: '#8E9297',
        fontSize: 13.5,
        fontFamily: Typography.sans.medium,
    },
    modalDismissButton: {
        width: '100%',
    },
});
