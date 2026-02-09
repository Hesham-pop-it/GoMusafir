import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Image,
    ScrollView,
    Dimensions,
    TouchableWithoutFeedback
} from 'react-native';
import { Colors } from '../constants/Colors';
import GradientBorderButton from './GradientBorderButton';

const { height } = Dimensions.get('window');

const ParticipantDetailsModal = ({ visible, onClose, participant }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    if (!participant) return null;

    // Split name for display
    const nameParts = participant.name ? participant.name.split(' ') : ['Ethan', 'Carter'];
    const firstName = nameParts[0] || 'Ethan';
    const lastName = nameParts.slice(1).join(' ') || 'Carter';

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
                <View style={styles.modalContent}>
                    <View style={styles.dragIndicator} />

                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        {/* Avatar */}
                        <View style={styles.avatarContainer}>
                            <Image
                                source={{ uri: participant.image || 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=3387&auto=format&fit=crop' }}
                                style={styles.avatar}
                            />
                        </View>

                        {/* Name Fields */}
                        <View style={styles.row}>
                            <View style={styles.halfWidth}>
                                <Text style={styles.label}>First Name</Text>
                                <View style={styles.inputContainer}>
                                    <Text style={styles.inputText}>{firstName}</Text>
                                </View>
                            </View>
                            <View style={styles.halfWidth}>
                                <Text style={styles.label}>Last Name</Text>
                                <View style={styles.inputContainer}>
                                    <Text style={styles.inputText}>{lastName}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Email */}
                        <Text style={styles.label}>Email Address</Text>
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputText}>{participant.email || 'ethan@gmail.com'}</Text>
                        </View>

                        {/* Phone */}
                        <Text style={styles.label}>Phone Number</Text>
                        <View style={styles.inputContainer}>
                            <Text style={styles.inputText}>{participant.phone || '+444545456'}</Text>
                        </View>

                        {/* Trip History */}
                        <Text style={styles.label}>Trip History</Text>
                        <View style={styles.tripHistoryContainer}>
                            {participant.tripHistory && participant.tripHistory.length > 0 ? (
                                participant.tripHistory.map((trip, index) => (
                                    <View key={index}>
                                        <View style={styles.tripItem}>
                                            <Text style={styles.tripName}>
                                                {trip.name} <Text style={styles.tripStatus}>({trip.status})</Text>
                                            </Text>
                                        </View>
                                        {index < participant.tripHistory.length - 1 && <View style={styles.separator} />}
                                    </View>
                                ))
                            ) : (
                                <View style={styles.tripItem}>
                                    <Text style={[styles.tripStatus, { fontStyle: 'italic' }]}>No trip history available</Text>
                                </View>
                            )}
                        </View>

                    </ScrollView>
                    <View style={{ marginVertical: 24 }}>
                        {/* Delete Button */}
                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() => setShowDeleteConfirm(true)}
                        >
                            <Text style={styles.deleteButtonText}>Delete Participant</Text>
                        </TouchableOpacity>

                        {/* Bottom Spacer for scrolling */}
                        <View style={{ height: 40 }} />
                    </View>
                </View>
            </View>

            {/* Delete Confirmation Modal */}
            <Modal
                visible={showDeleteConfirm}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowDeleteConfirm(false)}
            >
                <TouchableWithoutFeedback onPress={() => setShowDeleteConfirm(false)}>
                    <View style={styles.confirmOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={styles.confirmContent}>
                                <Text style={styles.confirmTitle}>
                                    Are You sure you want to delete this participant
                                </Text>
                                <View style={styles.confirmButtons}>
                                    <GradientBorderButton
                                        text="Cancel"
                                        onPress={() => setShowDeleteConfirm(false)}
                                        style={{ flex: 1 }}
                                        innerBg="#1E2124"
                                    />
                                    <TouchableOpacity
                                        style={styles.confirmDeleteButton}
                                        onPress={() => {
                                            setShowDeleteConfirm(false);
                                            onClose();
                                            // Handle actual deletion logic here
                                        }}
                                    >
                                        <Text style={styles.confirmDeleteButtonText}>Delete</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    modalContent: {
        backgroundColor: '#1A1E21', // Dark background matching the image
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        maxHeight: height * 0.9,
    },
    dragIndicator: {
        width: 40,
        height: 4,
        backgroundColor: '#383B42',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    avatarContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: '#2C2E33', // Slight border
    },
    row: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    halfWidth: {
        flex: 1,
    },
    label: {
        fontSize: 14,
        color: '#fff',
        marginBottom: 8,
    },
    inputContainer: {
        backgroundColor: '#23272A',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    inputText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',

    },
    tripHistoryContainer: {
        backgroundColor: '#23272A',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 24,
    },
    tripItem: {
        padding: 16,
    },
    separator: {
        // height: 1,
        // backgroundColor: '#2C2E33',
        marginHorizontal: 16,
    },
    tripName: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    tripStatus: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'normal',
    },
    deleteButton: {

        backgroundColor: '#942F31', // Reddish brown color from image
        borderRadius: 30, // Pill shape
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    deleteButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Confirmation Modal Styles
    confirmOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmContent: {
        width: '90%',
        backgroundColor: '#1E2124',
        borderRadius: 32,
        padding: 30,
        alignItems: 'center',
    },
    confirmTitle: {
        fontSize: 16,
        color: '#FFF',
        textAlign: 'center',
        fontWeight: '600',
        marginBottom: 40,
        lineHeight: 32,
        fontFamily: 'IBMPlexSans_600SemiBold',
    },
    confirmButtons: {
        flexDirection: 'row',
        gap: 16,
        width: '100%',
    },
    confirmDeleteButton: {
        flex: 1,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#942F31',
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmDeleteButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default ParticipantDetailsModal;
