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
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import { auth, database } from '../../config/firebase';
import { signOut } from 'firebase/auth';
import { ref, onValue, update } from 'firebase/database';


const { width } = Dimensions.get('window');

const TripSettingsScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { trip, invitationCode: directCode, isAdmin: passedIsAdmin } = route.params || {};
    const invitationCode = directCode || trip?.invitationCode;
    const isAdmin = passedIsAdmin !== undefined ? passedIsAdmin : (trip?.isAdmin !== undefined ? trip.isAdmin : !invitationCode);

    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);
    const [seatModalVisible, setSeatModalVisible] = useState(false);
    const [requestSentVisible, setRequestSentVisible] = useState(false);
    const [seatCount, setSeatCount] = useState(1);
    const [expandedField, setExpandedField] = useState(null);
    const [visibilitySettings, setVisibilitySettings] = useState({
        name: 'Show to organizer',
        lastname: 'Show to organizer',
        email: 'Show to organizer',
        phone: 'Show to organizer',
        photo: 'Show to organizer',
        location: 'Show to organizer',
    });

    useEffect(() => {
        const user = auth.currentUser;
        if (!user || !trip?.id) return;

        const visibilityRef = ref(database, `users/${user.uid}/participant_visibility/${trip.id}`);
        const unsubscribe = onValue(visibilityRef, (snapshot) => {
            if (snapshot.exists()) {
                setVisibilitySettings(prev => ({ ...prev, ...snapshot.val() }));
            }
        });

        return () => unsubscribe();
    }, [trip?.id]);


    const visibilityOptions = [
        'Show to organizer',
        'Show to everyone',
        'Do not show',
        'Custom choice'
    ];

    const toggleExpand = (field) => {
        setExpandedField(expandedField === field ? null : field);
    };

    const handleSelectVisibility = async (field, option) => {
        const user = auth.currentUser;
        if (!user || !trip?.id) return;

        setVisibilitySettings(prev => ({ ...prev, [field]: option }));
        setExpandedField(null);

        try {
            await update(ref(database, `users/${user.uid}/participant_visibility/${trip.id}`), {
                [field]: option
            });
        } catch (error) {
            console.warn("Failed to update visibility setting:", error);
        }
    };


    const handleDeleteTrip = () => {
        setDeleteModalVisible(false);
        // Handle deletion logic
        navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
        });
    };

    const handleRequestSeats = () => {
        setSeatModalVisible(false);
        setRequestSentVisible(true);
    };

    const handleLogout = async () => {
        setLogoutModalVisible(false);
        try {
            await signOut(auth);
            // The onAuthStateChanged listener in App.js will handle redirecting to Welcome
        } catch (error) {
            console.warn("Logout failed:", error);
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
    const panYSeat = React.useRef(new Animated.Value(0)).current;
    const panYRequest = React.useRef(new Animated.Value(0)).current;

    const deleteSwipe = createDraggableResponder(setDeleteModalVisible, panYDelete);
    const logoutSwipe = createDraggableResponder(setLogoutModalVisible, panYLogout);
    const seatSwipe = createDraggableResponder(setSeatModalVisible, panYSeat);
    const requestSentSwipe = createDraggableResponder(setRequestSentVisible, panYRequest);



    const VisibilityItem = ({ label, field }) => {
        const isExpanded = expandedField === field;
        return (
            <View style={styles.visibilityItemContainer}>
                <View style={styles.visibilityRow}>
                    <Text style={styles.visibilityLabel}>{label}</Text>
                    <View style={styles.rightColumn}>
                        <TouchableOpacity
                            style={styles.visibilityValueContainer}
                            onPress={() => toggleExpand(field)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.visibilityValue}>{visibilitySettings[field]}</Text>
                            <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={16} color="#B99A4A" />
                        </TouchableOpacity>
                        {isExpanded && (
                            <View style={styles.expandedOptions}>
                                {visibilityOptions.map((option, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        style={styles.optionItem}
                                        onPress={() => handleSelectVisibility(field, option)}
                                    >
                                        <Text style={[
                                            styles.optionText,
                                            visibilitySettings[field] === option && { color: '#B99A4A' }
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
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            <SafeAreaView style={[styles.container, { marginTop: 20 }]}>
                {/* Fixed Background Header Layer (Z-Index: 10) - Box-none allows touch-through */}
                <View style={[styles.header, { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }]} pointerEvents="box-none">
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>Setting</Text>

                    <View style={{ width: 40 }} />
                </View>

                <ScrollView
                    style={{ flex: 1, zIndex: 0 }}
                    contentContainerStyle={styles.scrollContent}
                >
                    <View style={{ marginTop: 80 }}>
                        {/* Journey Seat Statistics */}
                        <Text style={styles.statsSectionTitle}>Journey Seat Statistics</Text>

                        <View style={styles.totalSeatsOutlineCard}>
                            <Text style={styles.statsLabel}>Total seats</Text>
                            <Text style={styles.statsValue}>15</Text>
                        </View>

                        <View style={styles.seatsGrid}>
                            <LinearGradient
                                colors={['#9C781C', 'rgba(50, 53, 55, 0.6)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.gradientCard, styles.halfCard]}
                            >
                                <Text style={styles.statsLabel}>Filled seats</Text>
                                <Text style={styles.statsValueText}>11</Text>
                            </LinearGradient>

                            <LinearGradient
                                colors={['#205A4B', '#1C2426']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.gradientCard, styles.halfCard]}
                            >
                                <Text style={styles.statsLabel}>Seats left</Text>
                                <Text style={styles.statsValueText}>4</Text>
                            </LinearGradient>
                        </View>

                        {isAdmin && (
                            <TouchableOpacity
                                style={styles.increaseBtnWrapper}
                                onPress={() => setSeatModalVisible(true)}
                            >
                                <LinearGradient
                                    colors={['#D4AF37', '#73571F', '#1C1E21']}
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

                        {/* Help & Support */}
                        <TouchableOpacity
                            style={styles.helpCard}
                            onPress={() => navigation.navigate('HelpSupport')}
                        >
                            <Text style={styles.helpText}>Help & Support</Text>
                            <Ionicons name="chevron-forward" size={20} color="#9BA1A6" />
                        </TouchableOpacity>

                        {/* Action Button (Delete for Admin / Logout for Participant) */}
                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() => isAdmin ? setDeleteModalVisible(true) : setLogoutModalVisible(true)}
                        >
                            <Text style={styles.deleteButtonText}>{isAdmin ? 'Delete Journey' : 'Log Out'}</Text>
                        </TouchableOpacity>

                        <View style={{ height: 100 }} />
                    </View>
                </ScrollView>

                {/* Delete Confirmation Modal */}
                <Modal
                    isVisible={deleteModalVisible}
                    onBackdropPress={() => setDeleteModalVisible(false)}
                    onSwipeComplete={() => setDeleteModalVisible(false)}
                    swipeDirection="down"
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
                            style={styles.deleteConfirmButton}
                            onPress={handleDeleteTrip}
                        >
                            <Text style={styles.deleteConfirmButtonText}>Delete Trip</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.cancelButtonWrapper}
                            onPress={() => setDeleteModalVisible(false)}
                        >
                            <LinearGradient
                                colors={['#D4AF37', '#B8860B', '#8B6914']}
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
                        <Text style={[styles.deleteQuestionText, { marginBottom: 30 }]}>
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
                                colors={['#D4AF37', '#B8860B', '#8B6914']}
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
                        <Text style={styles.seatModalTitle}>How many more seats do you need?</Text>

                        <View style={styles.counterRow}>
                            <TouchableOpacity
                                style={styles.counterBtn}
                                onPress={() => setSeatCount(Math.max(1, seatCount - 1))}
                            >
                                <Ionicons name="remove" size={20} color="#000" />
                            </TouchableOpacity>

                            <View style={styles.countCircle}>
                                <Text style={styles.countText}>{seatCount}</Text>
                            </View>

                            <TouchableOpacity
                                style={styles.counterBtn}
                                onPress={() => setSeatCount(seatCount + 1)}
                            >
                                <Ionicons name="add" size={20} color="#000" />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={styles.requestButton}
                            onPress={handleRequestSeats}
                        >
                            <LinearGradient
                                colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.resendGradientBorder}
                            >
                                <View style={styles.resendButtonInner}>
                                    <Text style={styles.requestButtonText}>Request more seats</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
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
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1E2124',
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
        fontFamily: Typography.sans.bold,
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
        fontFamily: Typography.sans.bold,
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
    },
    deleteButton: {
        backgroundColor: '#2D2528',
        borderRadius: 30,
        paddingVertical: 20,
        alignItems: 'center',
        marginVertical: 20,
    },
    deleteButtonText: {
        color: '#D66A77',
        fontFamily: Typography.sans.bold,
        fontSize: responsiveFontSize(16),
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
        fontFamily: Typography.sans.bold,
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
        padding: 32,
        width: '100%',
        alignItems: 'center',
    },
    deleteWarningText: {
        color: '#FFF',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 16,
    },
    deleteQuestionText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
        textAlign: 'center',
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
        fontFamily: Typography.sans.bold,
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
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        marginBottom: 30,
    },
    counterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        marginBottom: 40,
    },
    counterBtn: {
        backgroundColor: '#B99A4A',
        width: 30,
        height: 30,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    countCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 1,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    countText: {
        color: '#FFF',
        fontSize: responsiveFontSize(24),
        fontFamily: Typography.sans.bold,
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
});

export default TripSettingsScreen;
