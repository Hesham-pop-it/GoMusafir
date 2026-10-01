import { brandedBrowserOptions } from '../utils/browserOptions';
import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Dimensions,
    StyleSheet,
    Platform,
    PanResponder,
    Animated,
} from 'react-native';
import Modal from './CompatModal';
import { Typography } from '../constants/Typography';
import GradientBorderButton from './GradientBorderButton';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Colors } from '../constants/Colors';

const { width, height: screenHeight } = Dimensions.get('window');

const PaymentSuccessModal = ({ visible, onClose, webLink }) => {
    const panY = React.useRef(new Animated.Value(0)).current;

    const swipeResponder = PanResponder.create({
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
                panY.setValue(gestureState.dy);
            }
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
                Animated.spring(panY, {
                    toValue: 0,
                    friction: 8,
                    useNativeDriver: true,
                }).start();
            }
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => true,
    });

    return (
        <Modal
            isVisible={visible}
            onBackdropPress={onClose}
            onSwipeComplete={onClose}
            swipeDirection="down"
            useNativeDriver={true}
            hideModalContentWhileAnimating={true}
            style={{ margin: 0, justifyContent: 'center', alignItems: 'center' }}
        >
            <Animated.View
                style={[
                    styles.modalContent,
                    { transform: [{ translateY: panY }] }
                ]}
                {...swipeResponder.panHandlers}
            >
                <View style={styles.modalHandle} />
                
                <View style={styles.iconContainer}>
                    <Ionicons name="checkmark-circle" size={64} color="#B99A4A" />
                </View>

                <Text style={styles.titleText}>
                    You’re Ready to Begin
                </Text>

                <Text style={styles.messageText}>
                    Your journey seat has been prepared. Continue securely to complete your journey and start guiding your pilgrims.
                </Text>

                <View style={styles.buttonRow}>
                    <GradientBorderButton
                        text="Continue to Journey Setup"
                        onPress={async () => {
                            onClose();
                            if (webLink) {
                                setTimeout(async () => {
                                    try {
                                        const { setBrowserOpenState } = require('../navigation/RootNavigator');
                                        setBrowserOpenState(true);
                                        await WebBrowser.openBrowserAsync(webLink, brandedBrowserOptions);
                                        setBrowserOpenState(false);
                                    } catch (err) {
                                        console.warn("Failed to open link in in-app browser:", err);
                                        const { setBrowserOpenState } = require('../navigation/RootNavigator');
                                        setBrowserOpenState(false);
                                    }
                                }, 600);
                            }
                        }}
                        innerBg="#B99A4A"
                        style={{ flex: 1 }}
                        innerStyle={{ height: 48 }}
                    />
                </View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContent: {
        width: width * 0.85,
        backgroundColor: '#1E2328',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        elevation: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    modalHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#4A4E54',
        borderRadius: 2,
        marginBottom: 20,
    },
    iconContainer: {
        marginBottom: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleText: {
        fontSize: 20,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 12,
        fontFamily: Typography.sans.bold,
    },
    messageText: {
        fontSize: 14,
        color: '#A1A1AA',
        textAlign: 'center',
        marginBottom: 24,
        fontFamily: Typography.sans.regular,
        lineHeight: 20,
    },
    buttonRow: {
        flexDirection: 'row',
        width: '100%',
    },
});

export default PaymentSuccessModal;
