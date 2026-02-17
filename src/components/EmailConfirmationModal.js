import React from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    Dimensions,
    Linking,
    StyleSheet,
    Platform
} from 'react-native';
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
                        <GradientBorderButton
                            text="Close"
                            onPress={onClose}
                            innerBg="#23272A"
                            style={{ flex: 1 }}
                        />

                        <GradientBorderButton
                            text="Open Email App"
                            onPress={handleOpenEmail}
                            innerBg="#B99A4A"
                            style={{ flex: 1 }}
                        />
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
        fontFamily: Typography.sans.semiBold,
        lineHeight: 26,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
});

export default EmailConfirmationModal;
