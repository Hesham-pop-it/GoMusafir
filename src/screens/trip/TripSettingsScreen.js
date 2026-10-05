import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    FlatList,
    StatusBar,
    PanResponder,
    Animated,
    ActivityIndicator,
    Alert,
    Linking,
    Platform
} from 'react-native';
import Modal from '../../components/CompatModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import TripDateSettings from '../../components/TripDateSettings';
import { seatUsage } from '../../utils/tripSeatMath';
import { Typography } from '../../constants/Typography';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';
import { responsiveFontSize } from '../../utils/responsive';
import { auth, database } from '../../config/firebase';
import { signOut } from 'firebase/auth';
import { unregisterForPushNotificationsAsync } from '../../services/notificationService';
import { stopLiveLocationTracking } from '../../services/locationTrackingService';
import { ref, onValue, update, get, set, push } from 'firebase/database';
import { safeSignOut } from '../../utils/authUtils';
import { completeAccountDeletion } from '../../utils/accountDeletion';


const { width } = Dimensions.get('window');

const calculateActualIAPPrice = (seatCount) => {
    let total = 0;
    let tempSeats = seatCount;

    const num10 = Math.floor(tempSeats / 10);
    total += num10 * 99.99;
    tempSeats %= 10;

    const num5 = Math.floor(tempSeats / 5);
    total += num5 * 49.99;
    tempSeats %= 5;

    total += tempSeats * 9.99;
    return total;
};

const PLANS = [
    { id: 'seat_only', label: 'Journey Seat', fallbackPrice: 9.99 },
];

const TripSettingsScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const insets = useSafeAreaInsets();
    const { trip, invitationCode: directCode, isAdmin: passedIsAdmin, tripId: paramTripId, orgId: paramOrgId } = route.params || {};
    const tripId = paramTripId || trip?.id || trip?.tripId || trip?.trip_id;
    const orgId = paramOrgId || trip?.orgId || trip?.org_id;
    const invitationCode = directCode || trip?.invitationCode;
    const isAdmin = passedIsAdmin !== undefined ? passedIsAdmin : (trip?.isAdmin !== undefined ? trip.isAdmin : !invitationCode);
    const [userRole, setUserRole] = useState(isAdmin ? 'admin' : 'participant');

    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [isDeletingTrip, setIsDeletingTrip] = useState(false);
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);
    const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [seatModalVisible, setSeatModalVisible] = useState(false);
    const [requestSentVisible, setRequestSentVisible] = useState(false);
    const [seatCount, setSeatCount] = useState(1);
    const [expandedField, setExpandedField] = useState(null);

    // Dynamic Seat Statistics State
    const [resolvedOrgId, setResolvedOrgId] = useState(orgId);
    const [resolvedTripId, setResolvedTripId] = useState(tripId);
    const [currentTrip, setCurrentTrip] = useState(null);
    const [totalSeats, setTotalSeats] = useState(15); // Default fallback
    const [filledSeats, setFilledSeats] = useState(0);
    const [staffData, setStaffData] = useState({});
    const [seatTopupStep, setSeatTopupStep] = useState(1); // 1: Count, 2: Plan, 3: Success
    const [selectedPlan, setSelectedPlan] = useState('seat_only');
    const [isProcessingTopup, setIsProcessingTopup] = useState(false);
    const [pricingPlans, setPricingPlans] = useState(null);
    const [topupError, setTopupError] = useState(null);
    const [topupToken, setTopupToken] = useState(null);
    const [prepaidSeats, setPrepaidSeats] = useState(0);
    const [isScrolled, setIsScrolled] = useState(false);

    let topupSeatsRequired = seatCount;
    let seatPeriods = 1;
    try {
        const usage = seatUsage(currentTrip.start_date, currentTrip.end_date, totalSeats + seatCount);
        seatPeriods = usage.seatPeriods;
        topupSeatsRequired = Math.max(0, usage.requiredSeats - (currentTrip.seats_allocated ?? totalSeats));
    } catch (_) {}

    const [visibilitySettings, setVisibilitySettings] = useState({
        name: 'Show to organizer',
        lastname: 'Show to organizer',
        email: 'Show to organizer',
        phone: 'Show to organizer',
        photo: 'Show to organizer',
        location: 'Show to organizer',
    });

    const [globalVisibilityConfig, setGlobalVisibilityConfig] = useState({});

    useEffect(() => {
        const user = auth.currentUser;
        const currentTripId = resolvedTripId || trip?.id || trip?.tripId || trip?.trip_id;
        if (!user || !currentTripId) return;

        const visibilityRef = ref(database, `users/${user.uid}/participant_visibility/${currentTripId}`);
        const unsubscribe = onValue(visibilityRef, (snapshot) => {
            if (snapshot.exists()) {
                setVisibilitySettings(prev => ({ ...prev, ...snapshot.val() }));
            }
        });

        return () => unsubscribe();
    }, [resolvedTripId, trip?.id, trip?.tripId, trip?.trip_id]);

    // 1. Robust ID Resolution for Sync Path
    useEffect(() => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const resolveIds = async () => {
            try {
                const user = auth.currentUser;
                if (!user) return;

                const tokenResult = await user.getIdTokenResult();
                const role = tokenResult.claims.role || 'participant';
                setUserRole(role);

                let activeTripId = tripId || trip?.tripId || trip?.trip_id;
                let activeOrgId = orgId || trip?.org_id;

                // If orgId is missing, resolve it from user's joined trips
                if (activeTripId && !activeOrgId) {
                    try {
                        const joinedRef = ref(database, `users/${uid}/joined_trips/${activeTripId}`);
                        const snapshot = await get(joinedRef);
                        if (snapshot.exists()) {
                            activeOrgId = snapshot.val().orgId || snapshot.val().org_id;
                            console.log("[TripSettings] Resolved orgId:", activeOrgId);
                        }
                    } catch (err) {
                        console.warn("[TripSettings] ID Resolution Error:", err);
                    }
                }

                if (activeOrgId) setResolvedOrgId(activeOrgId);
                if (activeTripId) setResolvedTripId(activeTripId);
            } catch (error) {
                console.warn("[TripSettings] Error in resolveIds:", error);
            }
        };

        resolveIds();
    }, [tripId, orgId, trip]);

    // 1.1 Staff Data Sync for Seat Calculation
    useEffect(() => {
        if (!resolvedTripId || !resolvedOrgId) return;

        const staffRef = ref(database, `orgs/${resolvedOrgId}/staff`);
        const unsubscribeStaff = onValue(staffRef, (snapshot) => {
            setStaffData(snapshot.val() || {});
        });

        return () => unsubscribeStaff();
    }, [resolvedTripId, resolvedOrgId]);

    // 2. Real-time Seat Statistics Synchronization
    useEffect(() => {
        if (!resolvedTripId) return;

        // A. Listen for Total Seats (Capacity)
        // If resolvedOrgId is available, we use the full path, otherwise fallback to finding the org
        const tripPath = resolvedOrgId
            ? `orgs/${resolvedOrgId}/trips/${resolvedTripId}`
            : null;

        let unsubscribeTrip = null;
        if (tripPath) {
            const tripRef = ref(database, tripPath);
            unsubscribeTrip = onValue(tripRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    // Field guess: total_seats, capacity, participants_limit
                    const capacity = data.total_seats || data.capacity || data.participants_limit || 15;
                    setTotalSeats(Number(capacity));
                    setCurrentTrip(data);
                }
            });
        }

        // B. Listen for Filled Seats (Participant Count)
        const participantsRef = ref(database, `trips_participants/${resolvedTripId}`);
        let unsubscribeParticipants;
        if (resolvedOrgId) {
            unsubscribeParticipants = onValue(participantsRef, (snapshot) => {
                const staffList = staffData;
                const uids = snapshot.exists()
                    ? (Array.isArray(snapshot.val()) ? snapshot.val().filter(v => v !== null) : Object.keys(snapshot.val()))
                    : [];
                const filtered = uids.filter(uid => {
                    const role = staffList[uid];
                    return !role || role === 'admin' || role === 'co-host' || role === 'manager';
                });
                const teamMemberUids = Object.keys(staffList).filter(uid => {
                    const role = staffList[uid];
                    return role === 'admin' || role === 'co-host' || role === 'manager';
                });
                const combined = Array.from(new Set([...filtered, ...teamMemberUids]));
                setFilledSeats(combined.length);
            });
        } else {
            unsubscribeParticipants = onValue(participantsRef, (snapshot) => {
                if (snapshot.exists()) {
                    const val = snapshot.val() || {};
                    let count = 0;
                    if (Array.isArray(val)) {
                        count = val.filter(v => v !== null).length;
                    } else {
                        count = Object.keys(val).length;
                    }
                    setFilledSeats(count);
                } else {
                    setFilledSeats(0);
                }
            });
        }

        return () => {
            if (unsubscribeTrip) unsubscribeTrip();
            if (unsubscribeParticipants) unsubscribeParticipants();
        };
    }, [resolvedOrgId, resolvedTripId, staffData]);

    // 3. Global Visibility Configuration Sync
    useEffect(() => {
        if (!resolvedOrgId || !resolvedTripId) return;

        const configRef = ref(database, `orgs/${resolvedOrgId}/trips/${resolvedTripId}/visibility_config`);
        const unsubscribe = onValue(configRef, (snapshot) => {
            if (snapshot.exists()) {
                setGlobalVisibilityConfig(snapshot.val());
            }
        });

        return () => unsubscribe();
    }, [resolvedOrgId, resolvedTripId]);

    // 4. Fetch Pricing and Prepaid Seats for Seat Top-up
    useEffect(() => {
        if (seatModalVisible) {
            // Fetch current prepaid seats
            if (resolvedOrgId) {
                const prepaidRef = ref(database, `orgs/${resolvedOrgId}/prepaid_seats`);
                get(prepaidRef).then((snapshot) => {
                    if (snapshot.exists()) {
                        setPrepaidSeats(snapshot.val() || 0);
                    } else {
                        setPrepaidSeats(0);
                    }
                }).catch((err) => {
                    console.error("Failed to fetch prepaid seats:", err);
                });
            }

            if (!pricingPlans) {
                const fetchPricing = async () => {
                    try {
                        const { functions, database } = require('../../config/firebase');
                        const { httpsCallable } = require('firebase/functions');
                        const { ref, get } = require('firebase/database');
                        
                        // 1. Detect user country for regional pricing
                        let countryCode = 'DEFAULT';
                        const user = auth.currentUser;
                        if (user) {
                            const countrySnap = await get(ref(database, `users/${user.uid}/country`));
                            if (countrySnap.exists()) {
                                const cData = countrySnap.val();
                                countryCode = typeof cData === 'object' ? (cData.code || 'DEFAULT') : (cData || 'DEFAULT');
                            }
                        }

                        const getRegionalPricing = httpsCallable(functions, 'getRegionalPricing');
                        const result = await getRegionalPricing({ countryCode });
                        setPricingPlans(result.data.plans);
                    } catch (err) {
                        console.warn("Failed to fetch pricing:", err);
                    }
                };
                fetchPricing();
            }
        }
    }, [seatModalVisible]);

    const topupTokenRef = React.useRef(null);
    const purchasesRef = React.useRef([]);
    const currentPurchaseIndexRef = React.useRef(0);
    const successfulSeatsRef = React.useRef(0);

    useEffect(() => {
        topupTokenRef.current = topupToken;
    }, [topupToken]);

    useEffect(() => {
        if (seatModalVisible) {
            setSeatCount(1);
            setSeatTopupStep(1);
            setSelectedPlan('seat_only');
            setTopupToken(null);
            setTopupError(null);
            setIsProcessingTopup(false);

            purchasesRef.current = [];
            currentPurchaseIndexRef.current = 0;
            successfulSeatsRef.current = 0;
        }
    }, [seatModalVisible]);

    useEffect(() => {
        if (seatModalVisible && Platform.OS === 'ios') {
            console.log("[TripSettingsScreen] Modal visible, establishing IAP connection...");
            const { connectIAP, disconnectIAP } = require('../../services/iapService');
            connectIAP(
                async (purchase, data) => {
                    console.log("[TripSettingsScreen] connectIAP success callback triggered, purchase:", purchase);
                    try {
                        const { functions } = require('../../config/firebase');
                        const { httpsCallable } = require('firebase/functions');
                        const verifyAndPaySeatTopup = httpsCallable(functions, 'verifyAndPaySeatTopup');

                        const currentPurchase = purchasesRef.current[currentPurchaseIndexRef.current];
                        if (currentPurchase) {
                            successfulSeatsRef.current += currentPurchase.seatCount;
                        }

                        currentPurchaseIndexRef.current += 1;

                        if (currentPurchaseIndexRef.current < purchasesRef.current.length) {
                            const nextPurchase = purchasesRef.current[currentPurchaseIndexRef.current];
                            console.log(`[TripSettingsScreen] Next purchase in sequence: ${nextPurchase.productId} x ${nextPurchase.qty}`);
                            const { purchaseSeatProduct } = require('../../services/iapService');
                            await purchaseSeatProduct(nextPurchase.productId, nextPurchase.qty);
                        } else {
                            if (topupTokenRef.current) {
                                console.log("[TripSettingsScreen] Calling verifyAndPaySeatTopup with token...");
                                await verifyAndPaySeatTopup({
                                    token: topupTokenRef.current,
                                    planId: selectedPlan
                                });
                                console.log("[TripSettingsScreen] verifyAndPaySeatTopup success!");
                                const addedSeats = seatCount;
                                if (auth.currentUser) {
                                    const notifPayload = {
                                        type: 'seat_update',
                                        title: 'Seat Update',
                                        message: `Seat capacity for "${trip?.title || 'your trip'}" increased by ${addedSeats} seats.`,
                                        tripId: resolvedTripId || trip?.id,
                                        orgId: resolvedOrgId,
                                        timestamp: Date.now(),
                                        read: false,
                                        seen: false,
                                        diff: addedSeats
                                    };
                                    push(ref(database, `users/${auth.currentUser.uid}/notifications`), notifPayload).catch(() => {});
                                    if (resolvedOrgId && (resolvedTripId || trip?.id)) {
                                        push(ref(database, `trips_active/${resolvedOrgId}/${resolvedTripId || trip?.id}/notifications/${auth.currentUser.uid}`), notifPayload).catch(() => {});
                                    }
                                }
                                Alert.alert("Success", "Seats increased successfully!");
                            } else {
                                console.warn("[TripSettingsScreen] Purchase success, but no topupToken found!");
                                if (auth.currentUser) {
                                    const notifPayload = {
                                        type: 'seat_update',
                                        title: 'Prepaid Seats Added',
                                        message: `${successfulSeatsRef.current || seatCount} seat(s) purchased and added to your organisation balance.`,
                                        orgId: resolvedOrgId,
                                        timestamp: Date.now(),
                                        read: false,
                                        seen: false,
                                        diff: successfulSeatsRef.current || seatCount
                                    };
                                    push(ref(database, `users/${auth.currentUser.uid}/notifications`), notifPayload).catch(() => {});
                                }
                                Alert.alert("Success", "Purchase successful! Prepaid seats added.");
                            }
                            setIsProcessingTopup(false);
                            setSeatModalVisible(false);
                        }
                    } catch (err) {
                        console.error("[TripSettingsScreen] verifyAndPaySeatTopup failed:", err);
                        Alert.alert("Partial Success", "Purchase succeeded but updating the trip failed. Please contact support.");
                        setIsProcessingTopup(false);
                        setSeatModalVisible(false);
                    }
                },
                (err) => {
                    console.warn("[TripSettingsScreen] connectIAP error callback triggered:", err);
                    setIsProcessingTopup(false);
                    setSeatModalVisible(false);

                    const isCancel = err.message?.toLowerCase().includes('cancel') || err.code === 'E_USER_CANCELLED';
                    if (successfulSeatsRef.current > 0) {
                        Alert.alert(
                            "Purchase Failed",
                            `Successfully purchased ${successfulSeatsRef.current} seats, but failed to complete the remaining seats: ${isCancel ? 'User cancelled' : (err.message || 'User cancelled')}.`
                        );
                    } else {
                        Alert.alert("Purchase Failed", err.message || "Could not complete In-App Purchase.");
                    }
                }
            );
            return () => {
                console.log("[TripSettingsScreen] Cleaning up IAP connection...");
                disconnectIAP();
            };
        }
    }, [seatModalVisible]);


    const adminVisibilityOptions = [
        'Show to organizer',
        'Show to everyone',
        'Do not show',
        'Custom choice'
    ];

    const participantVisibilityOptions = [
        'Show to organizer',
        'Show to everyone',
        'Do not show'
    ];

    const toggleExpand = (field) => {
        setExpandedField(expandedField === field ? null : field);
    };

    const handleSelectVisibility = async (field, option) => {
        const user = auth.currentUser;
        if (!user || (!resolvedTripId && !trip?.id)) return;
        const currentTripId = resolvedTripId || trip?.id;
        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';

        if (isStaff) {
            // Admin updates the GLOBAL config for the trip
            try {
                if (resolvedOrgId) {
                    await update(ref(database, `orgs/${resolvedOrgId}/trips/${currentTripId}/visibility_config`), {
                        [field]: option
                    });
                }
            } catch (error) {
                console.warn("Failed to update global visibility config:", error);
            }
        } else {
            // Participant updates their personal visibility setting
            // Only if global config says "Custom choice"
            if (globalVisibilityConfig[field] === 'Custom choice') {
                setVisibilitySettings(prev => ({ ...prev, [field]: option }));
                try {
                    await update(ref(database, `users/${user.uid}/participant_visibility/${currentTripId}`), {
                        [field]: option
                    });
                } catch (error) {
                    console.warn("Failed to update personal visibility setting:", error);
                }
            }
        }
        setExpandedField(null);
    };


    const handleDeleteTrip = async () => {
        if (isDeletingTrip) return;
        setIsDeletingTrip(true);
        try {
            const { functions } = require('../../config/firebase');
            const { httpsCallable } = require('firebase/functions');
            const deleteTrip = httpsCallable(functions, 'deleteTrip');

            await deleteTrip({ tripId: resolvedTripId });

            setIsDeletingTrip(false);
            setDeleteModalVisible(false);
            Alert.alert("Success", "Journey has been successfully deleted.", [
                {
                    text: "OK",
                    onPress: () => {
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Home' }],
                        });
                    }
                }
            ]);
        } catch (error) {
            console.error("Delete Trip Error:", error);
            setIsDeletingTrip(false);
            Alert.alert("Error", "Failed to delete the journey. " + error.message);
        }
    };

    const handleRequestSeatToken = async () => {
        if (!resolvedTripId || isProcessingTopup) return;

        setIsProcessingTopup(true);
        setTopupError(null);

        try {
            const { functions, database } = require('../../config/firebase');
            const { httpsCallable } = require('firebase/functions');
            const { ref, get } = require('firebase/database');
            const generateSeatTopupToken = httpsCallable(functions, 'generateSeatTopupToken');

            console.log("[TripSettingsScreen] Calling generateSeatTopupToken for seats:", seatCount);
            const result = await generateSeatTopupToken({
                tripId: resolvedTripId,
                seatsToIncr: seatCount
            });

            const token = result.data.token;
            console.log("[TripSettingsScreen] generateSeatTopupToken success, token:", token);
            setTopupToken(token);

            // Fetch current prepaid seats
            let prepaidSeats = 0;
            if (resolvedOrgId) {
                const orgSnap = await get(ref(database, `orgs/${resolvedOrgId}/prepaid_seats`));
                prepaidSeats = orgSnap.val() || 0;
            }

            if (prepaidSeats >= topupSeatsRequired) {
                // Instantly topup without IAP or prompt!
                const verifyAndPaySeatTopup = httpsCallable(functions, 'verifyAndPaySeatTopup');
                console.log("[TripSettingsScreen] Prepaid balance covers all seats. Calling verifyAndPaySeatTopup instantly...");
                await verifyAndPaySeatTopup({
                    token: token,
                    planId: selectedPlan
                });
                console.log("[TripSettingsScreen] verifyAndPaySeatTopup success (instant prepaid)!");
                if (auth.currentUser) {
                    const notifPayload = {
                        type: 'seat_update',
                        title: 'Seat Update',
                        message: `Seat capacity for "${trip?.title || 'your trip'}" increased by ${seatCount} seats.`,
                        tripId: resolvedTripId || trip?.id,
                        orgId: resolvedOrgId,
                        timestamp: Date.now(),
                        read: false,
                        seen: false,
                        diff: seatCount
                    };
                    push(ref(database, `users/${auth.currentUser.uid}/notifications`), notifPayload).catch(() => {});
                    if (resolvedOrgId && (resolvedTripId || trip?.id)) {
                        push(ref(database, `trips_active/${resolvedOrgId}/${resolvedTripId || trip?.id}/notifications/${auth.currentUser.uid}`), notifPayload).catch(() => {});
                    }
                }
                Alert.alert("Success", "Seats increased successfully!");
                setSeatModalVisible(false);
                setIsProcessingTopup(false);
                return;
            }

            if (Platform.OS === 'ios') {
                const unpaidSeats = topupSeatsRequired - prepaidSeats;

                // Decompose unpaidSeats into product purchases
                const purchases = [];
                let tempSeats = unpaidSeats;

                const num10 = Math.floor(tempSeats / 10);
                for (let i = 0; i < num10; i++) {
                    purchases.push({ productId: 'com.gomusafir.plan.seat.10', qty: 1, seatCount: 10 });
                }
                tempSeats %= 10;

                const num5 = Math.floor(tempSeats / 5);
                for (let i = 0; i < num5; i++) {
                    purchases.push({ productId: 'com.gomusafir.plan.seat.5', qty: 1, seatCount: 5 });
                }
                tempSeats %= 5;

                if (tempSeats > 0) {
                    purchases.push({ productId: 'com.gomusafir.plan.seat_only', qty: tempSeats, seatCount: tempSeats });
                }

                purchasesRef.current = purchases;
                currentPurchaseIndexRef.current = 0;
                successfulSeatsRef.current = 0;

                if (purchases.length > 0) {
                    try {
                        const { purchaseSeatProduct } = require('../../services/iapService');
                        const firstPurchase = purchases[0];
                        console.log("[TripSettingsScreen] Triggering first IAP purchase for product ID:", firstPurchase.productId, "quantity:", firstPurchase.qty);
                        await purchaseSeatProduct(firstPurchase.productId, firstPurchase.qty);
                        console.log("[TripSettingsScreen] purchaseSeatProduct call complete.");
                    } catch (iapErr) {
                        console.warn("[TripSettingsScreen] purchaseSeatProduct threw error:", iapErr);
                        setIsProcessingTopup(false);
                    }
                } else {
                    console.warn("[TripSettingsScreen] purchases array is empty!");
                    setIsProcessingTopup(false);
                }
            } else {
                setSeatModalVisible(false);
                setTimeout(() => {
                    setRequestSentVisible(true);
                }, 600);
            }
        } catch (err) {
            console.error("[TripSettingsScreen] generateSeatTopupToken failed:", err);
            setTopupError("Failed to generate payment link. Please try again.");
            setIsProcessingTopup(false);
        } finally {
            if (Platform.OS !== 'ios') {
                setIsProcessingTopup(false);
            }
        }
    };

    const handleLogout = async () => {
        setLogoutModalVisible(false);
        
        // 1. Clear active device ID
        try {
            const user = auth.currentUser;
            if (user) {
                const deviceRef = ref(database, `users/${user.uid}/active_device_id`);
                await set(deviceRef, null);
            }
        } catch (err) {
            console.warn("Failed to clear active device ID:", err);
        }

        // 2. Safe Sign out (clears RTDB presence, stops location/notifications, then signs out)
        try {
            await safeSignOut(auth, { tripId, orgId });
            // The onAuthStateChanged listener in App.js will handle redirecting to Welcome
        } catch (error) {
            console.warn("Logout failed:", error);
            Alert.alert("Error", "Failed to log out. Please try again.");
        }
    };

    const handleDeleteAccount = async () => {
        setIsDeletingAccount(true);
        try {
            const { functions } = require('../../config/firebase');
            const { httpsCallable } = require('firebase/functions');
            const deleteMyAccount = httpsCallable(functions, 'deleteMyAccount');
            await deleteMyAccount();
            setDeleteAccountModalVisible(false);
            await completeAccountDeletion(auth, navigation);
        } catch (error) {
            setDeleteAccountModalVisible(false);
            if (error.code === 'auth/requires-recent-login' || error.message?.includes('re-authenticate')) {
                Alert.alert(
                    "Security Verification",
                    "For your security, please log out and log back in to verify your identity before proceeding.",
                    [{ text: "OK" }]
                );
            } else {
                Alert.alert("Error", error.message || "Failed to delete account");
            }
        } finally {
            setIsDeletingAccount(false);
        }
    };


    const { height: screenHeight } = Dimensions.get('window');

    // Swipe down to close logic for modals - Interactive Draggable version
    const createDraggableResponder = (setter, animatedValue) => PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
            const { dy, dx } = gestureState;
            return dy > 5 && dy > Math.abs(dx);
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
            const { dy, dx } = gestureState;
            return dy > 20 && dy > Math.abs(dx);
        },
        onPanResponderMove: (_, gestureState) => {
            if (gestureState.dy > 0) {
                animatedValue.setValue(gestureState.dy);
            }
        },
        onPanResponderRelease: (_, gestureState) => {
            if (gestureState.dy > 120 || (gestureState.dy > 50 && gestureState.vy > 0.5)) {
                Animated.timing(animatedValue, {
                    toValue: screenHeight,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => {
                    setter(false);
                    animatedValue.setValue(0);
                });
            } else {
                Animated.spring(animatedValue, {
                    toValue: 0,
                    friction: 8,
                    useNativeDriver: true,
                }).start();
            }
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => true,
    });

    const panYDelete = React.useRef(new Animated.Value(0)).current;
    const panYLogout = React.useRef(new Animated.Value(0)).current;
    const panYDeleteAccount = React.useRef(new Animated.Value(0)).current;
    const panYSeat = React.useRef(new Animated.Value(0)).current;
    const panYRequest = React.useRef(new Animated.Value(0)).current;

    const deleteSwipe = createDraggableResponder(setDeleteModalVisible, panYDelete);
    const logoutSwipe = createDraggableResponder(setLogoutModalVisible, panYLogout);
    const deleteAccountSwipe = createDraggableResponder(setDeleteAccountModalVisible, panYDeleteAccount);
    const seatSwipe = createDraggableResponder(setSeatModalVisible, panYSeat);
    const requestSentSwipe = createDraggableResponder(setRequestSentVisible, panYRequest);



    const VisibilityItem = ({ label, field }) => {
        const isExpanded = expandedField === field;

        // Logic to determine what to show
        let currentValue = '';
        let isLocked = false;
        let options = [];

        if (userRole === 'admin' || userRole === 'co-host' || userRole === 'manager') {
            currentValue = globalVisibilityConfig[field] || 'Show to organizer';
            options = adminVisibilityOptions;
        } else {
            const adminSetting = globalVisibilityConfig[field] || 'Show to organizer';
            if (adminSetting === 'Custom choice') {
                currentValue = visibilitySettings[field] || 'Show to organizer';
                options = participantVisibilityOptions;
            } else {
                currentValue = adminSetting;
                isLocked = true;
            }
        }

        return (
            <View style={styles.visibilityItemContainer}>
                <View style={styles.visibilityRow}>
                    <Text style={styles.visibilityLabel}>{label}</Text>
                    <View style={styles.rightColumn}>
                        <TouchableOpacity
                            style={[styles.visibilityValueContainer, isLocked && { opacity: 0.5 }]}
                            onPress={() => !isLocked && toggleExpand(field)}
                            activeOpacity={isLocked ? 1 : 0.7}
                        >
                            <Text style={styles.visibilityValue}>{currentValue}</Text>
                            {!isLocked && (
                                <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={16} color="#B99A4A" />
                            )}
                            {isLocked && (
                                <Ionicons name="lock-closed" size={14} color="rgba(185, 154, 74, 0.5)" style={{ marginLeft: 4 }} />
                            )}
                        </TouchableOpacity>
                        {isExpanded && !isLocked && (
                            <View style={styles.expandedOptions}>
                                {options.map((option, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        style={styles.optionItem}
                                        onPress={() => handleSelectVisibility(field, option)}
                                    >
                                        <Text style={[
                                            styles.optionText,
                                            currentValue === option && { color: '#B99A4A' }
                                        ]}>
                                            {option}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
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
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            <View style={styles.container}>
                {/* Fixed Background Header Layer (Z-Index: isScrolled ? 5 : 15) - Box-none allows touch-through */}
                <View style={[styles.header, { position: 'absolute', top: 30, left: 0, right: 0, zIndex: isScrolled ? 5 : 15 }]} pointerEvents="box-none">
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>Setting</Text>

                    <View style={{ width: 40 }} />
                </View>

                <ScrollView
                    style={{ flex: 1, zIndex: 10, marginTop: 0 }}
                    contentContainerStyle={[styles.scrollContent, { flexGrow: 1, paddingTop: 0 }]}
                    showsVerticalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={(event) => {
                        const offsetY = event.nativeEvent.contentOffset.y;
                        if (offsetY > 10 && !isScrolled) {
                            setIsScrolled(true);
                        } else if (offsetY <= 10 && isScrolled) {
                            setIsScrolled(false);
                        }
                    }}
                >
                    <View style={{ height: 75 + insets.top + 20 }} pointerEvents="none" />
                    <View>
                        {/* Journey Seat Statistics */}
                        <Text style={styles.statsSectionTitle}>Journey Seat Statistics</Text>

                        <View style={styles.totalSeatsOutlineCard}>
                            <Text style={styles.statsLabel}>Total seats</Text>
                            <Text style={styles.statsValue}>{totalSeats}</Text>
                        </View>

                        <View style={styles.seatsGrid}>
                            <LinearGradient
                                colors={['#9C781C', 'rgba(50, 53, 55, 0.6)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.gradientCard, styles.halfCard]}
                            >
                                <Text style={styles.statsLabel}>Filled seats</Text>
                                <Text style={styles.statsValueText}>{filledSeats}</Text>
                            </LinearGradient>

                            <LinearGradient
                                colors={['#205A4B', '#1C2426']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.gradientCard, styles.halfCard]}
                            >
                                <Text style={styles.statsLabel}>Seats left</Text>
                                <Text style={styles.statsValueText}>{Math.max(0, totalSeats - filledSeats)}</Text>
                            </LinearGradient>
                        </View>

                        {(userRole === 'admin' || userRole === 'co-host') && (
                            <TouchableOpacity
                                style={styles.increaseBtnWrapper}
                                onPress={() => setSeatModalVisible(true)}
                            >
                                <LinearGradient
                                    colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                    locations={[0, 0.76]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.increaseGradientBorder}
                                >
                                    <View style={styles.increaseBtnInner}>
                                        <Text style={styles.increaseBtnText}>Increase seat capacity</Text>
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>
                        )}

                        {['admin', 'co-host', 'manager'].includes(userRole) && (
                            <TripDateSettings orgId={resolvedOrgId} tripId={resolvedTripId} participantCount={filledSeats} />
                        )}

                        {/* Visibility Settings */}
                        <Text style={styles.sectionTitle}>Data visibility</Text>
                        <View style={styles.visibilityCard}>
                            <VisibilityItem label="Name" field="name" />
                            <VisibilityItem label="Lastname" field="lastname" />
                            <VisibilityItem label="Email address" field="email" />
                            <VisibilityItem label="Phone number" field="phone" />
                            <VisibilityItem label="Profile photo" field="photo" />
                            <VisibilityItem label="Location" field="location" />
                        </View>

                        {userRole === 'admin' ? null : (
                            <TouchableOpacity
                                style={styles.helpCard}
                                onPress={() => navigation.navigate('HelpSupport', { isAdmin })}
                            >
                                <Text style={styles.helpText}>Help & Support</Text>
                                <Ionicons name="chevron-forward" size={20} color="#9BA1A6" />
                            </TouchableOpacity>
                        )}
                        

                        {/* Action Button (Delete for Admin / Logout & Delete for Participant) */}
                        {userRole !== 'manager' && (
                            (userRole === 'admin' || userRole === 'co-host') ? (
                                <TouchableOpacity
                                    style={styles.deleteButton}
                                    onPress={() => setDeleteModalVisible(true)}
                                >
                                    <Text style={styles.deleteButtonText}>Delete Journey</Text>
                                </TouchableOpacity>
                            ) : (
                                <>
                                    <View style={{ marginTop: 20 }}>
                                        <GradientBorderButton
                                            text="Sign Out"
                                            onPress={() => setLogoutModalVisible(true)}
                                            innerBg={Colors.dark.background}
                                        />
                                    </View>

                                    <TouchableOpacity
                                        style={styles.deleteButton}
                                        onPress={() => setDeleteAccountModalVisible(true)}
                                    >
                                        <Text style={styles.deleteButtonText}>Delete Account</Text>
                                    </TouchableOpacity>
                                </>
                            )
                        )}

                        <View style={{ height: 100 }} />
                    </View>
                </ScrollView>

                {/* Delete Confirmation Modal */}
                <Modal
                    isVisible={deleteModalVisible}
                    onBackdropPress={() => { if (!isDeletingTrip) setDeleteModalVisible(false); }}
                    onSwipeComplete={() => { if (!isDeletingTrip) setDeleteModalVisible(false); }}
                    swipeDirection={isDeletingTrip ? undefined : "down"}
                    backdropOpacity={0.7}
                    style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
                    useNativeDriver={true}
                    hideModalContentWhileAnimating={true}
                >
                    <Animated.View
                        style={[
                            styles.deleteModalContent,
                            { transform: [{ translateY: panYDelete }] }
                        ]}
                        {...deleteSwipe.panHandlers}
                    >
                        <View style={styles.modalHandle} />
                        <Text style={styles.deleteWarningText}>
                            After continuing, there will be no refund for this trip. Your seats will be cancelled, and all related data will be permanently deleted.
                        </Text>
                        <Text style={styles.deleteQuestionText}>
                            Are you sure you want to delete this trip?
                        </Text>

                        <TouchableOpacity
                            style={[styles.deleteConfirmButton, isDeletingTrip && { opacity: 0.7 }]}
                            onPress={handleDeleteTrip}
                            disabled={isDeletingTrip}
                        >
                            {isDeletingTrip ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.deleteConfirmButtonText}>Delete Trip</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.cancelButtonWrapper, isDeletingTrip && { opacity: 0.4 }]}
                            onPress={() => setDeleteModalVisible(false)}
                            disabled={isDeletingTrip}
                        >
                            <LinearGradient
                                colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                locations={[0, 0.76]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.cancelGradientBorder}
                            >
                                <View style={styles.cancelButtonInner}>
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                </Modal>

                {/* Logout Confirmation Modal */}
                <Modal
                    isVisible={logoutModalVisible}
                    onBackdropPress={() => setLogoutModalVisible(false)}
                    onSwipeComplete={() => setLogoutModalVisible(false)}
                    swipeDirection="down"
                    backdropOpacity={0.7}
                    style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
                    useNativeDriver={true}
                    hideModalContentWhileAnimating={true}
                >
                    <Animated.View
                        style={[
                            styles.deleteModalContent,
                            { transform: [{ translateY: panYLogout }] }
                        ]}
                        {...logoutSwipe.panHandlers}
                    >
                        <View style={styles.modalHandle} />
                        <Text style={[styles.deleteQuestionText, { marginBottom: 30, paddingHorizontal: 30 }]}>
                            Are you sure you want to log out?
                        </Text>

                        <TouchableOpacity
                            style={styles.deleteConfirmButton}
                            onPress={handleLogout}
                        >
                            <Text style={styles.deleteConfirmButtonText}>Log Out</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.cancelButtonWrapper}
                            onPress={() => setLogoutModalVisible(false)}
                        >
                            <LinearGradient
                                colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                locations={[0, 0.76]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.cancelGradientBorder}
                            >
                                <View style={styles.cancelButtonInner}>
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                </Modal>

                {/* Delete Account Confirmation Modal */}
                <Modal
                    isVisible={deleteAccountModalVisible}
                    onBackdropPress={() => setDeleteAccountModalVisible(false)}
                    onSwipeComplete={() => setDeleteAccountModalVisible(false)}
                    swipeDirection="down"
                    backdropOpacity={0.7}
                    style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
                    useNativeDriver={true}
                    hideModalContentWhileAnimating={true}
                >
                    <Animated.View
                        style={[
                            styles.deleteModalContent,
                            { transform: [{ translateY: panYDeleteAccount }] }
                        ]}
                        {...deleteAccountSwipe.panHandlers}
                    >
                        <View style={styles.modalHandle} />
                        <Text style={styles.deleteWarningText}>
                            Your account and all related data will be permanently deleted. This action cannot be undone.
                        </Text>
                        <Text style={[styles.deleteQuestionText, { marginBottom: 30, paddingHorizontal: 30 }]}>
                            Are you sure you want to delete your account?
                        </Text>

                        <TouchableOpacity
                            style={[styles.deleteConfirmButton, isDeletingAccount && { opacity: 0.5 }]}
                            onPress={handleDeleteAccount}
                            disabled={isDeletingAccount}
                        >
                            {isDeletingAccount ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.deleteConfirmButtonText}>Delete Account</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.cancelButtonWrapper}
                            onPress={() => setDeleteAccountModalVisible(false)}
                        >
                            <LinearGradient
                                colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                locations={[0, 0.76]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.cancelGradientBorder}
                            >
                                <View style={styles.cancelButtonInner}>
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                </Modal>

                {/* Increase Seats Modal */}
                <Modal
                    isVisible={seatModalVisible}
                    onBackdropPress={() => setSeatModalVisible(false)}
                    onSwipeComplete={() => setSeatModalVisible(false)}
                    swipeDirection="down"
                    backdropOpacity={0.7}
                    style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
                    useNativeDriver={true}
                    hideModalContentWhileAnimating={true}
                >
                    <Animated.View
                        style={[
                            styles.seatModalContent,
                            { transform: [{ translateY: panYSeat }] }
                        ]}
                        {...seatSwipe.panHandlers}
                    >
                        <View style={styles.modalHandle} />

                        {seatTopupStep === 1 && (
                            <>
                                <Text style={styles.seatModalTitle}>Add Pilgrims to Your Journey</Text>

                                <View style={styles.counterRow}>
                                    <TouchableOpacity
                                        style={styles.counterBtn}
                                        onPress={() => setSeatCount(Math.max(1, seatCount - 1))}
                                    >
                                        <Ionicons name="remove" size={14} color="#fff" />
                                    </TouchableOpacity>
                                    <View style={styles.countCircle}>
                                        <Text style={styles.countText}>{seatCount}</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.counterBtn}
                                        onPress={() => setSeatCount(seatCount + 1)}
                                    >
                                        <Ionicons name="add" size={14} color="#fff" />
                                    </TouchableOpacity>
                                </View>

                                {Platform.OS !== 'ios' && !pricingPlans ? (
                                    <ActivityIndicator color="#B99A4A" size="small" style={{ marginVertical: 15 }} />
                                ) : (
                                    <View style={{ width: '100%', marginVertical: 10 }}>
                                        <Text style={{ color: '#FFF', textAlign: 'center', marginVertical: 12 }}>
                                            {seatCount} additional participants · {seatPeriods} seat periods · {topupSeatsRequired} seats required
                                        </Text>
                                        {PLANS.map((plan) => {
                                            const isSelected = selectedPlan === plan.id;
                                            let priceText = '';

                                            if (Platform.OS === 'ios') {
                                                const unpaidSeats = Math.max(0, topupSeatsRequired - prepaidSeats);
                                                const price = calculateActualIAPPrice(unpaidSeats);
                                                priceText = `€${price.toFixed(2)} ${unpaidSeats > 1 ? 'total' : 'per pilgrim'}`;
                                                if (prepaidSeats > 0 && unpaidSeats === 0) {
                                                    priceText = `€0.00 (Prepaid Balance)`;
                                                }
                                            } else {
                                                const { symbol, price } = pricingPlans[plan.id];
                                                priceText = `${symbol}${(price * topupSeatsRequired).toFixed(2)} total`;
                                            }

                                            return (
                                                <TouchableOpacity
                                                    key={plan.id}
                                                    style={[
                                                        styles.planCard,
                                                        isSelected && styles.planCardSelected
                                                    ]}
                                                    onPress={() => setSelectedPlan(plan.id)}
                                                >
                                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                            <Text style={styles.planName}>{plan.label}</Text>
                                                            {plan.popular && (
                                                                <Text style={{
                                                                    fontSize: 9,
                                                                    color: '#B99A4A',
                                                                    backgroundColor: 'rgba(185, 154, 74, 0.15)',
                                                                    paddingHorizontal: 6,
                                                                    paddingVertical: 1,
                                                                    borderRadius: 8,
                                                                    marginLeft: 6,
                                                                    overflow: 'hidden',
                                                                    fontFamily: Typography.sans.regular
                                                                }}>Popular</Text>
                                                            )}
                                                        </View>
                                                        <Text style={styles.planPrice}>{priceText}</Text>
                                                    </View>
                                                    <Ionicons 
                                                        name={isSelected ? "radio-button-on" : "radio-button-off"} 
                                                        size={20} 
                                                        color="#B99A4A" 
                                                    />
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}

                                {topupError && <Text style={{ color: '#F43F5E', textAlign: 'center', marginTop: 10, marginBottom: 5 }}>{topupError}</Text>}

                                <TouchableOpacity
                                    style={styles.modalPrimaryBtnWrapper}
                                    onPress={handleRequestSeatToken}
                                    disabled={isProcessingTopup}
                                >
                                    <LinearGradient
                                        colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                        locations={[0, 0.76]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.modalPrimaryBtnGradient}
                                    >
                                        <View style={styles.modalPrimaryBtnInner}>
                                            {isProcessingTopup ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <Text style={styles.modalPrimaryBtnText}>
                                                    {Platform.OS === 'ios' ? 'Continue with Apple' : 'Request More Seats'}
                                                </Text>
                                            )}
                                        </View>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </>
                        )}
                    </Animated.View>
                </Modal>

                {/* Request Sent Modal */}
                <Modal
                    isVisible={requestSentVisible}
                    onBackdropPress={() => setRequestSentVisible(false)}
                    onSwipeComplete={() => setRequestSentVisible(false)}
                    swipeDirection="down"
                    backdropOpacity={0.7}
                    style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
                    useNativeDriver={true}
                    hideModalContentWhileAnimating={true}
                >
                    <Animated.View
                        style={[
                            styles.seatModalContent,
                            { transform: [{ translateY: panYRequest }] }
                        ]}
                        {...requestSentSwipe.panHandlers}
                    >
                        <View style={styles.modalHandle} />
                        <Text style={styles.sentModalTitle}>Request Sent</Text>
                        <Text style={styles.sentModalDesc}>
                            An email has been sent to you. Please follow the link to login to our web application to complete this process.
                        </Text>

                        <TouchableOpacity
                            style={styles.requestButton}
                            onPress={() => setRequestSentVisible(false)}
                        >
                            <LinearGradient
                                colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.resendGradientBorder}
                            >
                                <View style={styles.resendButtonInner}>
                                    <Text style={styles.requestButtonText}>OK</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                </Modal>

                  <TripBottomTabBar activeRoute="TripSettings" tripData={trip} />
             </View>
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
        paddingTop: 50,
        paddingBottom: 5,
    },
    headerTitle: {
        fontSize: responsiveFontSize(20),
        color: '#FFF',
        fontFamily: Typography.sans.regular,
    },
    iconButton: {
        padding: 5,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    sectionTitle: {
        fontSize: responsiveFontSize(20),
        color: '#FFF',
        marginBottom: 15,
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
        marginTop: 10,
    },
    statsSectionTitle: {
        fontSize: responsiveFontSize(27),
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        marginBottom: 30,
        marginTop: 10,
    },
    totalSeatsOutlineCard: {
        borderWidth: 1,
        borderColor: '#fff',
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        backgroundColor: '#23272A',
    },
    statsLabel: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.bold,
        marginBottom: 15,
    },
    statsValue: {
        color: '#FFF',
        fontSize: responsiveFontSize(32),
        fontFamily: Typography.sans.bold,
    },
    statsValueText: {
        color: '#FFF',
        fontSize: responsiveFontSize(32),
        fontFamily: Typography.sans.bold,
    },
    seatsGrid: {
        flexDirection: 'row',
        gap: 15,
        marginBottom: 25,
    },
    gradientCard: {
        borderRadius: 12,
        padding: 20,
        height: 140,
        justifyContent: 'flex-start',
    },
    halfCard: {
        flex: 1,
    },
    increaseBtnWrapper: {
        width: '100%',
        marginBottom: 40,
    },
    increaseGradientBorder: {
        borderRadius: 12,
        padding: 1.5,
    },
    increaseBtnInner: {
        backgroundColor: '#23272A',
        borderRadius: 11,
        height: 64,
        justifyContent: 'center',
        alignItems: 'center',
    },
    increaseBtnText: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.bold,
    },
    visibilityCard: {
        backgroundColor: '#23272A',
        borderRadius: 16,
        padding: 20,
        marginBottom: 15,
    },
    visibilityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 16,
    },
    visibilityLabel: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
        marginTop: 2, // Minor adjustment to align with right side text
    },
    rightColumn: {
        alignItems: 'flex-start',
        minWidth: 160,
    },
    visibilityValueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    visibilityValue: {
        color: '#B99A4A',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
    },
    deleteButton: {
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: '#FF383C',
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 20,
        backgroundColor: 'transparent',
    },
    deleteButtonText: {
        color: '#FF383C',
        fontSize: 16,
        letterSpacing: 0.2,
        fontFamily: Typography.sans.semiBold,
    },
    visibilityItemContainer: {
        marginBottom: 10,
    },
    expandedOptions: {
        paddingLeft: 0,
        paddingBottom: 10,
    },
    optionItem: {
        paddingVertical: 12,
        paddingHorizontal: 0,
    },
    optionText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
        textAlign: 'left',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
    deleteModalContent: {
        backgroundColor: '#23272A',
        borderRadius: 20,
        paddingHorizontal: 50,
        paddingVertical: 32,
        width: '100%',
        alignItems: 'center',
    },
    deleteWarningText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 20,
        letterSpacing: 0.2,
        marginBottom: 16,
        
    },
    deleteQuestionText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
        textAlign: 'center',
        letterSpacing: 0.2,
        marginBottom: 24,
    },
    deleteConfirmButton: {
        width: '100%',
        backgroundColor: '#942F31',
        borderRadius: 30,
        paddingVertical: 18,
        alignItems: 'center',
        marginBottom: 12,
    },
    deleteConfirmButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.semiBold,
    },
    cancelButtonWrapper: {
        width: '100%',
    },
    cancelGradientBorder: {
        borderRadius: 30,
        padding: 2,
    },
    cancelButtonInner: {
        backgroundColor: '#23272A',
        borderRadius: 28,
        paddingVertical: 18,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
    },
    modalOverlayFull: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    seatModalContent: {
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        alignItems: 'center',
    },
    seatModalTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
        letterSpacing: 0.2,
        textAlign: 'center',
        marginBottom: 8,
    },
    seatModalSubTitle: {
        color: '#9BA1A6',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    modalPrimaryBtnWrapper: {
        width: '100%',
    },
    modalPrimaryBtnGradient: {
        borderRadius: 50,
        padding: 1.5,
    },
    modalPrimaryBtnInner: {
        backgroundColor: '#1E2124',
        borderRadius: 49,
        height: 54,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalPrimaryBtnText: {
        color: '#fff',
        fontSize: responsiveFontSize(14),
        padding: 10,
        letterSpacing: 0.2,
        fontFamily: Typography.sans.semiBold,
    },
    modalSecondaryBtn: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#666',
        borderRadius: 12,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    modalSecondaryBtnText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
    },
    modalBtnRow: {
        flexDirection: 'row',
        width: '100%',
        marginTop: 10,
    },
    planCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#23272A',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#323537',
    },
    planCardSelected: {
        borderColor: '#B99A4A',
        backgroundColor: '#2A2D33',
    },
    planName: {
        color: '#FFF',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.bold,
        marginBottom: 4,
    },
    planPrice: {
        color: '#9BA1A6',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.regular,
    },
    successIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#2A2D33',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    errorText: {
        color: '#FF4B4B',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
        marginBottom: 16,
        textAlign: 'center',
    },
    counterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,

        marginVertical: 40,
    },
    counterBtn: {
        backgroundColor: '#B99A4A',
        width: 22,
        height: 22,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    countCircle: {
        width: 65,
        height: 50,
        borderRadius: 35,
        borderWidth: 1,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    countText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
    },
    requestButton: {
        width: '100%',
    },
    requestButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    resendGradientBorder: {
        borderRadius: 28,
        padding: 1.5,
    },
    resendButtonInner: {
        backgroundColor: '#1E2124',
        borderRadius: 26.5,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sentModalTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(20),
        fontFamily: Typography.sans.bold,
        textAlign: 'center',
        marginBottom: 20,
    },
    sentModalDesc: {
        color: '#9BA1A6',
        fontSize: responsiveFontSize(15),
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 30,
    },
    helpCard: {
        backgroundColor: '#23272A',
        borderRadius: 16,
        padding: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
    },
    helpText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.regular,
    },
    logoutBtnWrapper: {
        width: '100%',
        marginTop: 20,
    },
    logoutGradientBorder: {
        borderRadius: 30,
        padding: 2,
    },
    logoutBtnInner: {
        backgroundColor: '#1A1E21',
        borderRadius: 28,
        paddingVertical: 18,
        alignItems: 'center',
    },
    logoutBtnText: {
        color: '#FFF',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
    },
});

export default TripSettingsScreen;
