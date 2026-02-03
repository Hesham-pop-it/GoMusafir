import React from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    Dimensions,
    Linking,
    StyleSheet
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

const { width } = Dimensions.get('window');

const EmailConfirmationModal = ({ visible, onClose }) => {
    const handleOpenEmail = () => {
        // Attempt to open email app
        Linking.openURL('mailto:');
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.messageText}>
                        We’ve sent you an email. Please continue via the link in your email.
                    </Text>

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={onClose}
                        >
                            <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
                                <Defs>
                                    <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <Stop offset="0%" stopColor="#B99A4A" stopOpacity="1" />
                                        <Stop offset="76%" stopColor="#B99A4A" stopOpacity="0.44" />
                                    </LinearGradient>
                                </Defs>
                                <Rect
                                    x="1"
                                    y="1"
                                    width="98%"
                                    height="94%"
                                    rx="30"
                                    ry="30"
                                    stroke="url(#grad)"
                                    strokeWidth="1.5"
                                    fill="transparent"
                                />
                            </Svg>
                            <Text style={styles.closeButtonText}>Close</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.emailButton}
                            onPress={handleOpenEmail}
                        >
                            <Text style={styles.emailButtonText}>Open Email App</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
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
        fontSize: 18,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 24,
        fontWeight: '600',
        lineHeight: 26,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    closeButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        overflow: 'hidden', // Ensures the SVG doesn't bleed out if sizes mismatch slightly
    },
    closeButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    emailButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 30,
        backgroundColor: '#C9A443', // Gold color from FAB
        alignItems: 'center',
        justifyContent: 'center',
    },
    emailButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default EmailConfirmationModal;
