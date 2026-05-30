import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    TextInput,
    TouchableWithoutFeedback,
    Platform,
    Dimensions,
    PanResponder,
    Animated,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import GradientBorderButton from '../../components/GradientBorderButton';
import { responsiveFontSize } from '../../utils/responsive';
import { useTracks } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { database, auth, functions } from '../../config/firebase';
import { ref, onValue, get } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

// Mock participants removed in favor of real data fetching

const CustomDeleteIcon = () => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <Path d="M2.75002 6.167C2.75002 5.707 3.09502 5.333 3.52102 5.333H6.18602C6.71502 5.318 7.18202 4.955 7.36202 4.417L7.39202 4.322L7.50702 3.95C7.57702 3.722 7.63802 3.523 7.72402 3.345C8.06202 2.643 8.68802 2.156 9.41102 2.031C9.59502 2 9.78802 2 10.011 2H13.489C13.712 2 13.906 2 14.089 2.031C14.812 2.156 15.439 2.643 15.776 3.345C15.862 3.523 15.923 3.722 15.993 3.95L16.108 4.322L16.138 4.417C16.318 4.955 16.878 5.319 17.408 5.333H19.978C20.405 5.333 20.75 5.706 20.75 6.167C20.75 6.628 20.405 7 19.979 7H3.52002C3.09402 7 2.75002 6.627 2.75002 6.167ZM11.607 22H12.394C15.101 22 16.454 22 17.335 21.137C18.215 20.273 18.305 18.857 18.485 16.026L18.745 11.945C18.843 10.408 18.892 9.64 18.45 9.153C18.008 8.666 17.263 8.666 15.771 8.666H8.23002C6.73902 8.666 5.99302 8.666 5.55102 9.153C5.10902 9.64 5.15902 10.408 5.25602 11.945L5.51602 16.025C5.69602 18.858 5.78602 20.273 6.66602 21.137C7.54602 22.001 8.90002 22 11.607 22Z" fill="#FF383C" />
    </Svg>
);

const ParticipantsScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { isAdmin, trip } = route.params || {};
    const tripId = trip?.id || trip?.tripId;
    const orgId = trip?.orgId || trip?.org_id;

    const [participants, setParticipants] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [participantsCount, setParticipantsCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [detailVisible, setDetailVisible] = useState(false);
    const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
    const [globalVisibilityConfig, setGlobalVisibilityConfig] = useState({});
    const [userRole, setUserRole] = useState('participant');
    const [isAdminState, setIsAdminState] = useState(isAdmin);
    const [deleteType, setDeleteType] = useState('this'); // 'this' or 'all'

    React.useEffect(() => {
        const fetchRole = async () => {
            if (auth.currentUser) {
                const token = await auth.currentUser.getIdTokenResult();
                const role = token.claims.role || 'participant';
                setUserRole(role);
                setIsAdminState(role === 'admin' || role === 'co-host' || role === 'manager');
            }
        };
        fetchRole();
    }, []);

    // 0. Fetch Global Visibility Config
    React.useEffect(() => {
        if (!orgId || !tripId) return;
        const configRef = ref(database, `orgs/${orgId}/trips/${tripId}/visibility_config`);
        const unsubscribe = onValue(configRef, (snapshot) => {
            if (snapshot.exists()) {
                setGlobalVisibilityConfig(snapshot.val());
            } else {
                setGlobalVisibilityConfig({});
            }
        });
        return () => unsubscribe();
    }, [orgId, tripId]);

    // Fetch Participants with Privacy Masking
    React.useEffect(() => {
        if (!tripId || !orgId) {
            setIsLoading(false);
            return;
        }

        const participantsRef = ref(database, `trips_participants/${tripId}`);
        const tripDataRef = ref(database, `orgs/${orgId}/trips/${tripId}`);

        let organizerId = null;

        // Get organizer ID first
        get(tripDataRef).then(snap => {
            if (snap.exists()) {
                organizerId = snap.val().organizer_id;
            }
        });

        const unsubscribe = onValue(participantsRef, (snapshot) => {
            const val = snapshot.val() || {};
            let uids = [];
            if (Array.isArray(val)) {
                uids = val.filter(v => v !== null);
            } else {
                uids = Object.keys(val);
            }

            if (uids.length === 0) {
                setParticipants([]);
                setParticipantsCount(0);
                setIsLoading(false);
                return;
            }

            // Get staff list for filtering
            const staffRef = ref(database, `orgs/${orgId}/staff`);
            get(staffRef).then(staffSnap => {
                const staffList = staffSnap.val() || {};
                const filteredUids = uids.filter(uid => {
                    const role = staffList[uid];
                    return !role || role === 'admin' || role === 'co-host' || role === 'manager';
                });

                const teamMemberUids = Object.keys(staffList).filter(uid => {
                    const role = staffList[uid];
                    return role === 'admin' || role === 'co-host' || role === 'manager';
                });

                const combinedUids = Array.from(new Set([...filteredUids, ...teamMemberUids]));

                if (combinedUids.length === 0) {
                    setParticipants([]);
                    setParticipantsCount(0);
                    setIsLoading(false);
                    return;
                }

                combinedUids.forEach((uid) => {
                    const profileRef = ref(database, `users/${uid}/profile`);
                const nameRef = ref(database, `users/${uid}/full_name`);
                const visibilityRef = ref(database, `users/${uid}/participant_visibility/${tripId}`);

                Promise.all([get(profileRef), get(nameRef), get(visibilityRef)]).then(([userSnap, nameSnap, visSnap]) => {
                    const profile = userSnap.val() || {};
                    const fullName = nameSnap.val();
                    const visibility = visSnap.val() || {};
                    const isCurrentUser = uid === auth.currentUser?.uid;
                    const amIAdmin = isAdminState;

                    const canSeePII = (field) => {
                        if (isCurrentUser) return true;

                        // 1. Check Global Admin Config
                        const globalSetting = globalVisibilityConfig[field] || 'Show to everyone';

                        // Rule: 'Do not show' hides from EVERYONE including admin
                        if (globalSetting === 'Do not show') return false;
                        if (globalSetting === 'Show to organizer') return amIAdmin;
                        if (globalSetting === 'Show to everyone') return true;

                        // 2. If 'Custom choice', check personal choice
                        if (globalSetting === 'Custom choice') {
                            const personalSetting = visibility[field] || 'Show to organizer';
                            if (personalSetting === 'Do not show') return false;
                            if (personalSetting === 'Show to organizer') return amIAdmin;
                            if (personalSetting === 'Show to everyone') return true;
                        }

                        return false;
                    };

                    let displayName = 'User';
                    if (canSeePII('name')) {
                        if (profile.firstName || profile.lastName) {
                            displayName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
                        } else if (fullName) {
                            displayName = fullName;
                        } else if (isCurrentUser) {
                            displayName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'You';
                        }
                    } else if (isCurrentUser) {
                        displayName = 'You';
                    }

                    const displayImage = canSeePII('photo') && profile.photoURL
                        ? profile.photoURL
                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName[0] || 'U')}&background=B99A4A&color=fff`;

                    const role = staffList[uid];
                    let status = uid === organizerId ? 'Organizer' : 'Joined';
                    if (role === 'admin') {
                        status = 'Admin';
                    } else if (role === 'co-host') {
                        status = 'Co-Host';
                    } else if (role === 'manager') {
                        status = 'Manager';
                    }

                    const pData = {
                        id: uid,
                        name: displayName,
                        image: displayImage,
                        status: status,
                        isSpeaking: false,
                        isOrganizer: uid === organizerId,
                    };

                    setParticipants(prev => {
                        const filtered = prev.filter(p => p.id !== uid);
                        const newList = [...filtered, pData];
                        setParticipantsCount(newList.length);
                        return newList;
                    });
                    setIsLoading(false);
                }).catch(err => {
                    console.warn(`Error fetching participant ${uid}:`, err);
                });
            });
        });
    });

        return () => unsubscribe();
    }, [tripId, orgId, isAdmin, globalVisibilityConfig]);

    const filteredParticipants = participants.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => {
        const myUid = auth.currentUser?.uid;
        if (a.id === myUid) return -1;
        if (b.id === myUid) return 1;
        return a.name.localeCompare(b.name);
    });

    const voiceTracks = useTracks([Track.Source.Microphone], { onlyRemote: false });

    const mappedParticipants = filteredParticipants.map(p => {
        const track = voiceTracks.find(t => t.participant.identity === p.id);
        if (track) {
            const isSpeaking = track.participant.isSpeaking;
            const isMicrophoneEnabled = track.participant.isMicrophoneEnabled;
            return {
                ...p,
                isSpeaking,
                isMicrophoneEnabled,
                voiceStatus: isSpeaking ? 'Speaking' : (isMicrophoneEnabled ? 'Active' : 'Muted')
            };
        }
        return p;
    });

    // Multi-selection state
    const [selectedIds, setSelectedIds] = useState([]);
    const [multiDeleteVisible, setMultiDeleteVisible] = useState(false);
    const [multiConfirmVisible, setMultiConfirmVisible] = useState(false);

    const toggleSelection = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const renderParticipant = ({ item }) => {
        const isSelected = selectedIds.includes(item.id);
        return (
            <TouchableOpacity
                style={styles.participantRow}
                onPress={isAdminState ? () => toggleSelection(item.id) : null}
                activeOpacity={isAdminState ? 0.7 : 1}
            >
                <View style={[
                    styles.avatarContainer,
                    item.isSpeaking && styles.speakingAvatar
                ]}>
                    <Image source={{ uri: item.image }} style={styles.avatar} />
                </View>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={[
                        styles.status,
                        item.voiceStatus === 'Speaking' && styles.statusSpeaking,
                        item.voiceStatus === 'Active' && styles.statusActive,
                        item.voiceStatus === 'Muted' && styles.statusMuted,
                    ]}>{item.voiceStatus ? item.voiceStatus : item.status}</Text>
                </View>

                {isAdminState && selectedIds.length > 0 && (
                    <View
                        style={[styles.checkbox, isSelected && styles.checkboxSelected]}
                    >
                        {isSelected && <Ionicons name="checkmark" size={18} color="#FFF" />}
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const handleDeletePress = (type = 'this') => {
        setDeleteType(type);
        setDetailVisible(false);
        setTimeout(() => setDeleteConfirmVisible(true), 300);
    };

    const confirmDelete = async () => {
        if (!selectedParticipant) return;

        setDeleteConfirmVisible(false);
        setIsLoading(true);

        try {
            if (deleteType === 'all') {
                const deleteGlobally = httpsCallable(functions, 'deleteUserGlobally');
                await deleteGlobally({ targetUid: selectedParticipant.id });
            } else {
                const removeParticipant = httpsCallable(functions, 'removeParticipantFromTrip');
                await removeParticipant({
                    tripId: tripId,
                    targetUid: selectedParticipant.id
                });
            }
            Alert.alert("Success", `Participant has been removed ${deleteType === 'all' ? 'globally' : 'from this trip'}.`);
        } catch (error) {
            console.log("Delete Error:", error);
            Alert.alert("Error", "Failed to delete participant. " + error.message);
        } finally {
            setIsLoading(false);
            setSelectedParticipant(null);
        }
    };

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
                    toValue: height,
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

    const panYDetail = React.useRef(new Animated.Value(0)).current;
    const panYMultiDelete = React.useRef(new Animated.Value(0)).current;
    const panYConfirm = React.useRef(new Animated.Value(0)).current;

    const detailSwipe = createDraggableResponder(setDetailVisible, panYDetail);
    const multiDeleteSwipe = createDraggableResponder(setMultiDeleteVisible, panYMultiDelete);
    const confirmSwipe = createDraggableResponder((val) => {
        setDeleteConfirmVisible(val);
        setMultiConfirmVisible(val);
    }, panYConfirm);



    return (
        <View style={styles.container}>
            {/* Header */}
            <LinearGradient
                colors={['#1A1E21', '#332F2B']}
                start={{ x: 0.5, y: 1 }}
                end={{ x: 0.5, y: 0 }}
            >
                <SafeAreaView edges={['top']}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <View style={styles.headerTitleContainer}>
                            <Text style={styles.headerTitle}>Participants</Text>
                            <Text style={styles.headerSubtitle}>{participantsCount} Joined</Text>
                        </View>
                        <View style={{ width: 40, alignItems: 'flex-end' }}>
                            {isAdminState && selectedIds.length > 0 && (
                                <TouchableOpacity onPress={() => setMultiDeleteVisible(true)}>
                                    <CustomDeleteIcon />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </SafeAreaView>
            </LinearGradient>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Feather name="search" size={22} color="#A1A1AA" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search participant"
                        placeholderTextColor="#A1A1AA"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {/* List */}
            <FlatList
                data={mappedParticipants}
                renderItem={renderParticipant}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                    !isLoading && (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Text style={{ color: '#A1A1AA', fontSize: 16 }}>No participants found</Text>
                        </View>
                    )
                }
            />

            {/* Participant Detail Modal (Bottom Sheet Style) */}
            {/* Participant Detail Modal (Bottom Sheet Style) */}
            <Modal
                isVisible={detailVisible}
                onBackdropPress={() => setDetailVisible(false)}
                onSwipeComplete={() => setDetailVisible(false)}
                swipeDirection="down"
                style={{ margin: 0, justifyContent: 'flex-end' }}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <Animated.View
                    style={[
                        styles.bottomSheet,
                        { transform: [{ translateY: panYDetail }] }
                    ]}
                    {...detailSwipe.panHandlers}
                >
                    <View style={styles.handle} />
                    <View style={styles.handle} />
                    <Text style={styles.sheetTitle}>Participant Detail</Text>
                    <View style={styles.divider} />

                    {selectedParticipant && (
                        <>
                            <View style={styles.detailHeader}>
                                <Image source={{ uri: selectedParticipant.image }} style={styles.detailAvatar} />
                                <Text style={styles.detailName}>{selectedParticipant.name}</Text>
                            </View>

                            {/* Mini Map Placeholder */}
                            <View style={styles.mapPlaceholder}>
                                <Image
                                    source={{ uri: 'https://via.placeholder.com/400x200/1A1E21/FFFFFF?text=Map+View' }}
                                    style={styles.mapImage}
                                />
                                <View style={styles.mapPinContainer}>
                                    <Image source={{ uri: selectedParticipant.image }} style={styles.mapPinAvatar} />
                                </View>
                            </View>

                            {!isAdminState && (
                                <TouchableOpacity
                                    style={styles.actionButtonOutline}
                                    onPress={() => {
                                        setDetailVisible(false);
                                        navigation.navigate('EditParticipant', { participant: selectedParticipant });
                                    }}
                                >
                                    <Text style={styles.actionButtonText}>Edit Participant</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeletePress('this')}
                            >
                                <Ionicons name="trash-outline" size={20} color="#FFF" style={styles.btnIcon} />
                                <Text style={styles.deleteButtonText}>Delete for this trip</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeletePress('all')}
                            >
                                <Ionicons name="trash-outline" size={20} color="#FFF" style={styles.btnIcon} />
                                <Text style={styles.deleteButtonText}>Delete for all trip</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </Animated.View>
            </Modal>

            {/* Multi Delete Modal (Bottom Sheet Style) */}
            <Modal
                isVisible={multiDeleteVisible}
                onBackdropPress={() => setMultiDeleteVisible(false)}
                onSwipeComplete={() => setMultiDeleteVisible(false)}
                swipeDirection="down"
                style={{ margin: 0, justifyContent: 'flex-end' }}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <Animated.View
                    style={[
                        styles.bottomSheet,
                        { transform: [{ translateY: panYMultiDelete }] }
                    ]}
                    {...multiDeleteSwipe.panHandlers}
                >
                    <View style={styles.handle} />
                    <Text style={styles.multiDeleteTitle}>
                        Are you sure to delete selected participants?
                    </Text>

                    <TouchableOpacity
                        style={styles.multiDeleteButton}
                        onPress={() => {
                            setMultiDeleteVisible(false);
                            setTimeout(() => setMultiConfirmVisible(true), 300);
                        }}
                    >
                        <Ionicons name="trash-outline" size={20} color="#FFF" style={styles.btnIcon} />
                        <Text style={styles.deleteButtonText}>Delete for this trip</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.multiDeleteButton}
                        onPress={() => {
                            setMultiDeleteVisible(false);
                            setTimeout(() => setMultiConfirmVisible(true), 300);
                        }}
                    >
                        <Ionicons name="trash-outline" size={20} color="#FFF" style={styles.btnIcon} />
                        <Text style={styles.deleteButtonText}>Delete for all trip</Text>
                    </TouchableOpacity>
                </Animated.View>
            </Modal>

            {/* Confirmation Modals */}
            <Modal
                isVisible={deleteConfirmVisible || multiConfirmVisible}
                onBackdropPress={() => {
                    setDeleteConfirmVisible(false);
                    setMultiConfirmVisible(false);
                }}
                onSwipeComplete={() => {
                    setDeleteConfirmVisible(false);
                    setMultiConfirmVisible(false);
                }}
                style={{ margin: 0, justifyContent: 'center', paddingHorizontal: 24 }}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <Animated.View
                    style={[
                        styles.confirmBox,
                        { transform: [{ translateY: panYConfirm }] }
                    ]}
                    {...confirmSwipe.panHandlers}
                >
                    <View style={styles.modalHandle} />
                    <Text style={styles.confirmTitle}>Are You sure you want to delete this participant</Text>

                    <View style={styles.confirmButtons}>
                        <GradientBorderButton
                            text="Cancel"
                            onPress={() => {
                                setDeleteConfirmVisible(false);
                                setMultiConfirmVisible(false);
                            }}
                            style={styles.confirmCancel}
                            innerBg="#1E2124"
                        />
                        <TouchableOpacity
                            style={styles.confirmDelete}
                            onPress={confirmDelete}
                        >
                            <Text style={styles.confirmDeleteText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1E21',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    backButton: {
        padding: 5,
    },
    headerTitleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: 'regular',
        fontFamily: 'IBMPlexSans',
    },
    headerSubtitle: {
        color: '#A1A1AA',
        fontSize: 13,
        fontWeight: 'regular',
        fontFamily: 'IBMPlexSans',
    },
    searchContainer: {
        paddingHorizontal: 20,
        marginTop: 20,
        marginBottom: 10,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#23272A',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.regular,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    participantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    avatarContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        padding: 2,
        marginRight: 16,
    },
    speakingAvatar: {
        borderWidth: 2,
        borderColor: '#34C759',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 28,
    },
    info: {
        flex: 1,
    },
    name: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    status: {
        fontSize: 14,
        color: '#A1A1AA',
    },
    statusSpeaking: {
        color: '#34C759',
        fontWeight: 'bold',
    },
    statusActive: {
        color: '#B99A4A',
    },
    statusMuted: {
        color: '#D66A77',
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: '#49454F',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
    checkboxSelected: {
        backgroundColor: '#B99A4A',
        borderColor: '#B99A4A',

    },
    // Modal & Sheet Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    bottomSheet: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
        maxHeight: height * 0.85,
    },
    handle: {
        width: 60,
        height: 5,
        backgroundColor: '#FFF',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
        opacity: 0.8,
    },
    sheetTitle: {
        color: '#FFF',
        fontSize: 28,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        marginBottom: 16,
    },
    divider: {
        height: 1,
        backgroundColor: '#23272A',
        marginBottom: 24,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    detailAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        marginRight: 16,
    },
    detailName: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
    mapPlaceholder: {
        width: '100%',
        height: 180,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 30,
        backgroundColor: '#1A1E21',
    },
    mapImage: {
        width: '100%',
        height: '100%',
    },
    mapPinContainer: {
        position: 'absolute',
        top: '40%',
        left: '50%',
        transform: [{ translateX: -20 }, { translateY: -20 }],
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#B99A4A',
        overflow: 'hidden',
    },
    mapPinAvatar: {
        width: '100%',
        height: '100%',
    },
    actionButtonOutline: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        borderWidth: 1.5,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    actionButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    deleteButton: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        backgroundColor: '#942F31',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    multiDeleteTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 30,
    },
    multiDeleteButton: {
        width: '100%',
        height: 56,
        borderRadius: 12,
        backgroundColor: '#942F31',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    btnIcon: {
        marginRight: 10,
    },
    deleteButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Confirm Box
    confirmOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    confirmBox: {
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 30,
        width: '100%',
        alignItems: 'center',
    },
    confirmTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 30,
    },
    confirmButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    confirmCancel: {
        flex: 1,
    },
    confirmDelete: {
        flex: 1,
        height: 56,
        backgroundColor: '#942F31',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmDeleteText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
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

export default ParticipantsScreen;
