import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Dimensions,
    StyleSheet,
    ActivityIndicator,
    Animated,
    PanResponder,
    Alert,
} from 'react-native';
import Modal from './CompatModal';
import { Typography } from '../constants/Typography';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { connectIAP, disconnectIAP, purchaseSeatProduct } from '../services/iapService';
import { auth, database } from '../config/firebase';
import { ref, push } from 'firebase/database';

const { height: screenHeight } = Dimensions.get('window');

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

const IAPSeatSelectionModal = ({ visible, onClose, orgId, onSuccess }) => {
    const [selectedPackage, setSelectedPackage] = useState('com.gomusafir.plan.seat_only');
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);
    const [seatCount, setSeatCount] = useState(1);

    const panY = React.useRef(new Animated.Value(0)).current;

    const purchasesRef = React.useRef([]);
    const currentPurchaseIndexRef = React.useRef(0);
    const successfulSeatsRef = React.useRef(0);

    useEffect(() => {
        if (visible) {
            setSelectedPackage('com.gomusafir.plan.seat_only');
            setIsPurchasing(false);
            setStatusMessage(null);
            setSeatCount(1);

            purchasesRef.current = [];
            currentPurchaseIndexRef.current = 0;
            successfulSeatsRef.current = 0;

            connectIAP(
                async (purchase, data) => {
                    console.log("[IAPSeatSelectionModal] connectIAP success callback triggered, purchase:", purchase);
                    try {
                        const currentPurchase = purchasesRef.current[currentPurchaseIndexRef.current];
                        if (currentPurchase) {
                            successfulSeatsRef.current += currentPurchase.seatCount;
                        }

                        currentPurchaseIndexRef.current += 1;

                        if (currentPurchaseIndexRef.current < purchasesRef.current.length) {
                            const nextPurchase = purchasesRef.current[currentPurchaseIndexRef.current];
                            console.log(`[IAPSeatSelectionModal] Next purchase in sequence: ${nextPurchase.productId} x ${nextPurchase.qty}`);
                            const { purchaseSeatProduct } = require('../services/iapService');
                            await purchaseSeatProduct(nextPurchase.productId, nextPurchase.qty);
                        } else {
                            setIsPurchasing(false);
                            setStatusMessage("Your journey seats ready.");
                            if (auth.currentUser) {
                                const totalPurchased = successfulSeatsRef.current || currentTotalSeats;
                                push(ref(database, `users/${auth.currentUser.uid}/notifications`), {
                                    type: 'seat_update',
                                    title: 'Seats Purchased',
                                    message: `${totalPurchased} journey seat(s) successfully purchased and added to your balance.`,
                                    timestamp: Date.now(),
                                    read: false,
                                    seen: false,
                                    diff: totalPurchased
                                }).catch(() => {});
                            }
                            onClose();
                            if (onSuccess) {
                                onSuccess(data);
                            }
                        }
                    } catch (err) {
                        console.error("[IAPSeatSelectionModal] Sequential IAP success handler error:", err);
                        setIsPurchasing(false);
                        Alert.alert("Purchase Failed", err.message || "Could not complete sequential purchase.");
                        onClose();
                    }
                },
                (err) => {
                    console.warn("[IAPSeatSelectionModal] connectIAP error callback triggered:", err);
                    setIsPurchasing(false);
                    const isCancel = err.message?.toLowerCase().includes('cancel') || err.code === 'E_USER_CANCELLED';
                    if (successfulSeatsRef.current > 0) {
                        Alert.alert(
                            "Purchase Failed",
                            `Successfully purchased ${successfulSeatsRef.current} seats, but failed to complete the remaining seats: ${isCancel ? 'User cancelled' : (err.message || 'User cancelled')}.`
                        );
                    } else {
                        Alert.alert("Purchase Failed", err.message || "Could not complete In-App Purchase.");
                    }
                    onClose();
                }
            );
        } else {
            disconnectIAP();
        }
    }, [visible]);

    const handleBuyIAP = async () => {
        setIsPurchasing(true);
        setStatusMessage(null);

        // Decompose seatCount into product purchases
        const purchases = [];
        let tempSeats = seatCount;

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
                const firstPurchase = purchases[0];
                console.log("[IAPSeatSelectionModal] Triggering first IAP purchase for product ID:", firstPurchase.productId, "quantity:", firstPurchase.qty);
                await purchaseSeatProduct(firstPurchase.productId, firstPurchase.qty);
            } catch (err) {
                setIsPurchasing(false);
                Alert.alert("IAP Error", err.message || "Failed to initiate purchase.");
            }
        } else {
            setIsPurchasing(false);
        }
    };

    const swipeResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5 && gestureState.dy > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
            if (gestureState.dy > 0) panY.setValue(gestureState.dy);
        },
        onPanResponderRelease: (_, gestureState) => {
            if (gestureState.dy > 120 || (gestureState.dy > 50 && gestureState.vy > 0.5)) {
                Animated.timing(panY, {
                    toValue: screenHeight,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => {
                    onClose();
                    panY.setValue(0);
                });
            } else {
                Animated.spring(panY, { toValue: 0, friction: 8, useNativeDriver: true }).start();
            }
        },
    });

    const packages = [
        { id: 'com.gomusafir.plan.seat_only', label: 'Journey Seat', basePrice: 9.99 },
    ];

    return (
        <Modal
            isVisible={visible}
            onBackdropPress={onClose}
            onSwipeComplete={onClose}
            swipeDirection="down"
            useNativeDriver={true}
            style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}
        >
            <Animated.View
                style={[styles.modalContent, { transform: [{ translateY: panY }] }]}
                {...swipeResponder.panHandlers}
            >
                <View style={styles.handle} />
                <Text style={styles.title}>Prepare Your Journey</Text>
                <Text style={styles.subtitle}>
                    Choose the number of pilgrims joining this journey. Each seat gives one pilgrim access to the GoMusāfir journey experience.
                </Text>

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

                <View style={styles.packageList}>
                    {packages.map((pkg) => {
                        const isSelected = selectedPackage === pkg.id;
                        return (
                            <TouchableOpacity
                                key={pkg.id}
                                style={[
                                    styles.packageCard,
                                    isSelected && styles.selectedCard
                                ]}
                                onPress={() => setSelectedPackage(pkg.id)}
                                activeOpacity={0.8}
                            >
                                <View style={{ flex: 1, paddingRight: 10 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text style={styles.packageLabel}>{pkg.label}</Text>
                                        {pkg.popular && <Text style={styles.popularBadge}>Popular</Text>}
                                    </View>
                                    <Text style={styles.packagePrice}>
                                        €{calculateActualIAPPrice(seatCount).toFixed(2)} {seatCount > 1 ? 'total' : 'per pilgrim'}
                                    </Text>
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

                {statusMessage && <Text style={styles.statusText}>{statusMessage}</Text>}

                <TouchableOpacity
                    style={styles.buyButtonWrapper}
                    onPress={handleBuyIAP}
                    disabled={isPurchasing}
                >
                    <LinearGradient
                        colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.buyGradient}
                    >
                        {isPurchasing ? (
                            <ActivityIndicator color="#FFF" size="small" />
                        ) : (
                            <Text style={styles.buyBtnText}>Continue with Apple</Text>
                        )}
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                    <Text style={styles.closeBtnText}>Cancel</Text>
                </TouchableOpacity>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContent: {
        width: '100%',
        backgroundColor: '#1E2328',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: '#4A4E54',
        borderRadius: 2,
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        color: '#FFF',
        fontFamily: Typography.sans.bold,
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 13,
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 18,
    },
    packageList: {
        width: '100%',
        marginBottom: 20,
    },
    packageCard: {
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
    selectedCard: {
        borderColor: '#B99A4A',
        backgroundColor: '#2A2D33',
    },
    packageInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    packageLabel: {
        color: '#FFF',
        fontSize: 14,
        fontFamily: Typography.sans.bold,
        marginBottom: 4,
    },
    popularBadge: {
        fontSize: 10,
        color: '#B99A4A',
        backgroundColor: 'rgba(185, 154, 74, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 8,
        overflow: 'hidden',
    },
    packagePrice: {
        color: '#9BA1A6',
        fontSize: 14,
        fontFamily: Typography.sans.regular,
    },
    statusText: {
        color: '#10B981',
        fontSize: 13,
        marginBottom: 12,
        textAlign: 'center',
    },
    buyButtonWrapper: {
        width: '100%',
        borderRadius: 30,
        overflow: 'hidden',
        marginBottom: 12,
    },
    buyGradient: {
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buyBtnText: {
        fontSize: 16,
        color: '#FFF',
        fontFamily: Typography.sans.bold,
    },
    closeBtn: {
        paddingVertical: 10,
    },
    closeBtnText: {
        color: '#A1A1AA',
        fontSize: 14,
        fontFamily: Typography.sans.regular,
    },
    counterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        marginVertical: 15,
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
        fontSize: 16,
        fontFamily: Typography.sans.semiBold,
    },
});

export default IAPSeatSelectionModal;
