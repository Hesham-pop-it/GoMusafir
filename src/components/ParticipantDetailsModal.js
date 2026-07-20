import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    ScrollView,
    Dimensions,
    PanResponder,
    Animated,
    ActivityIndicator,
    I18nManager,
    Alert,
} from 'react-native';
import Modal from './CompatModal';
import { Colors } from '../constants/Colors';
import GradientBorderButton from './GradientBorderButton';
import { Typography } from '../constants/Typography';
import { useLanguage } from '../context/LanguageContext';
import { responsiveFontSize } from '../utils/responsive';
import { Ionicons, FontAwesome, Feather } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

const ParticipantDetailsModal = ({ visible, onClose, participant, onDelete, isDecrypting }) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [scrollOffset, setScrollOffset] = useState(0);
    const scrollViewRef = useRef(null);

    const handleOnScroll = (event) => {
        setScrollOffset(event.nativeEvent.contentOffset.y);
    };

    const handleScrollTo = (p) => {
        if (scrollViewRef.current) {
            scrollViewRef.current.scrollTo(p);
        }
    };

    const { t } = useLanguage();

    if (!participant) return null;

    // Split name for display
    const nameParts = participant.name ? participant.name.trim().split(/\s+/) : ['Guest'];
    const firstName = nameParts[0] || 'Guest';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

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

    return (
        <>
             <Modal
                isVisible={visible}
                onBackdropPress={onClose}
                onBackButtonPress={onClose}
                onSwipeComplete={onClose}
                swipeDirection="down"
                swipeThreshold={100}
                propagateSwipe={true}
                scrollTo={handleScrollTo}
                scrollOffset={scrollOffset}
                scrollOffsetMax={300}
                useNativeDriver={false}
                useNativeDriverForBackdrop={true}
                animationIn="bounceInUp"
                animationOut="bounceOutDown"
                style={{ margin: 0, justifyContent: 'flex-end' }}
                animationInTiming={900}
                animationOutTiming={500}
                backdropTransitionInTiming={1000}
                backdropTransitionOutTiming={500}
            >
                <View
                    style={[
                        styles.modalContent,
                        // { transform: [{ translateY: panYMain }] }
                    ]}
                // {...mainSwipe.panHandlers}
                >
                    <View style={styles.dragIndicator} />

                    <ScrollView 
                        ref={scrollViewRef}
                        onScroll={handleOnScroll}
                        scrollEventThrottle={16}
                        style={{ flexShrink: 1 }} 
                        contentContainerStyle={styles.scrollContent} 
                        showsVerticalScrollIndicator={false}
                    >
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
                                <Text style={styles.label}>{t('first_name')}</Text>
                                <View style={styles.inputContainer}>
                                    <Text style={styles.inputText}>{firstName}</Text>
                                </View>
                            </View>
                            <View style={styles.halfWidth}>
                                <Text style={styles.label}>{t('last_name')}</Text>
                                <View style={styles.inputContainer}>
                                    <Text style={styles.inputText}>{lastName}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Email */}
                        <Text style={styles.label}>{t('email')}</Text>
                        <View style={styles.inputContainer}>
                            {isDecrypting && (!participant.email || participant.email === 'N/A' || participant.email.includes('*') || !participant.email.includes('@')) ? (
                                <ActivityIndicator size="small" color="#B99A4A" style={{ alignSelf: 'flex-start' }} />
                            ) : (
                                <Text style={styles.inputText}>{participant.email || 'N/A'}</Text>
                            )}
                        </View>

                        {/* Phone */}
                        <Text style={styles.label}>{t('phone')}</Text>
                        <View style={styles.inputContainer}>
                            {isDecrypting && (!participant.phone || participant.phone === 'N/A' || participant.phone.includes('*')) ? (
                                <ActivityIndicator size="small" color="#B99A4A" style={{ alignSelf: 'flex-start' }} />
                            ) : (
                                <Text style={styles.inputText}>{participant.phone || 'N/A'}</Text>
                            )}
                        </View>

                        {/* Trip History */}
                        <Text style={styles.label}>{t('trip_history')}</Text>
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
                                    <Text style={[styles.tripStatus, { fontStyle: 'italic' }]}>{t('no_history')}</Text>
                                </View>
                            )}
                        </View>

                    </ScrollView>
                    <View style={{ marginVertical: 24 }}>
                        {/* Delete Button */}
                        <TouchableOpacity 
                            style={styles.deleteButton} 
                            onPress={() => Alert.alert(
                                t('remove_participant'), 
                                t('confirm_delete'), 
                                [{ text: t('cancel') }, { text: t('delete'), onPress: () => onDelete(participant.id) }]
                            )}
                        >
                            <Text style={styles.deleteButtonText}>{t('remove_participant')}</Text>
                        </TouchableOpacity>

                        {/* Bottom Spacer for scrolling */}
                        <View style={{ height: 40 }} />
                    </View>
                </View>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isVisible={showDeleteConfirm}
                onBackdropPress={() => setShowDeleteConfirm(false)}
                onSwipeComplete={() => setShowDeleteConfirm(false)}
                swipeDirection="down"
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
                style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}
            >
                <View
                    style={[
                        styles.confirmContent,
                        // { transform: [{ translateY: panYConfirm }] }
                    ]}
                // {...confirmSwipe.panHandlers}
                >
                    <View style={styles.modalHandle} />
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
                                if (onDelete) onDelete(participant);
                            }}
                        >
                            <Text style={styles.confirmDeleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </>
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
        width: 120,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.5)',
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
        borderColor: '#23272A', // Slight border
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
        fontFamily: Typography.sans.regular,
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
        fontFamily: Typography.sans.bold,
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
        // backgroundColor: '#23272A',
        marginHorizontal: 16,
    },
    tripName: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
    },
    tripStatus: {
        color: '#fff',
        fontSize: 14,
        fontFamily: Typography.sans.regular,
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
        fontFamily: Typography.sans.bold,
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
        fontSize: responsiveFontSize(16),
        color: '#FFF',
        textAlign: 'center',
        fontFamily: Typography.sans.semiBold,
        marginBottom: 40,
        lineHeight: 32,
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
        fontFamily: Typography.sans.bold,
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

export default ParticipantDetailsModal;
