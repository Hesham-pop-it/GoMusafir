import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Dimensions,
    Linking,
    StyleSheet,
    Platform,
    PanResponder,
    Animated,
} from 'react-native';
import Modal from 'react-native-modal';
import { Typography } from '../constants/Typography';
import GradientBorderButton from './GradientBorderButton';

const { width } = Dimensions.get('window');

const EmailConfirmationModal = ({ visible, onClose }) => {
    const handleOpenEmail = () => {
        if (Platform.OS === 'ios') {
            Linking.openURL('message://').catch(() => {
                Linking.openURL('mailto:');
            });
        } else {
            Linking.openURL('mailto:');
        }
        onClose();
    };

    const { height: screenHeight } = Dimensions.get('window');
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
                <Text style={styles.messageText}>
                    We’ve sent you an email. Please continue via the link in your email.
                </Text>

                <View style={styles.buttonRow}>
                    <GradientBorderButton
                        text="Close"
                        onPress={onClose}
                        innerBg="#23272A"
                        style={{ flex: 1 }}
                        innerStyle={{ height: 48 }}
                        borderRadius={24}
                    />

                    <GradientBorderButton
                        text="Open Email App"
                        onPress={handleOpenEmail}
                        innerBg="#B99A4A"
                        style={{ flex: 1 }}
                        innerStyle={{ height: 48 }}
                        borderRadius={24}
                    />
                </View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: width * 0.85,
        backgroundColor: '#23272A',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        elevation: 10,
    },
    messageText: {
        fontSize: 16,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 24,
        fontFamily: Typography.sans.semiBold,
        lineHeight: 26,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    modalHandle: {
        width: 60,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
});

export default EmailConfirmationModal;
