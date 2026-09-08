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
    ActivityIndicator,
    AppState,
} from 'react-native';
import Modal from '../../components/CompatModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import GradientBorderButton from '../../components/GradientBorderButton';
import SpeakerGlow from '../../components/SpeakerGlow';
import { responsiveFontSize } from '../../utils/responsive';
import { useTracks } from '@livekit/react-native';
import { Track, RoomEvent } from 'livekit-client';
import { useVoice } from '../../context/VoiceContext';
import { database, auth, functions } from '../../config/firebase';
import { ref, onValue, get, update, onDisconnect } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { LinearGradient } from 'expo-linear-gradient';
import { isStaffMember, checkPIIVisibility, getParticipantDisplayName, getParticipantDisplayPhoto } from '../../utils/visibilityHelper';
import { useLanguage } from '../../context/LanguageContext';

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
    const { t } = useLanguage();
    const { isAdmin, trip } = route.params || {};
    const tripId = trip?.id || trip?.tripId;
    const orgId = trip?.orgId || trip?.org_id;

    const [participants, setParticipants] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const renderEmptyComponent = () => {
        if (isLoading) {
            return (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#B99A4A" />
                </View>
            );
        }

        return (
            <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                    <Feather name="users" size={32} color="#B99A4A" />
                </View>
                <Text style={styles.emptyTitle}>{t('no_participants_title')}</Text>
                <Text style={styles.emptySubtitle}>{t('no_participants_subtitle')}</Text>
            </View>
        );
    };
    const [participantsCount, setParticipantsCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [detailVisible, setDetailVisible] = useState(false);
    const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
    const [globalVisibilityConfig, setGlobalVisibilityConfig] = useState({});
    const [userRole, setUserRole] = useState('participant');
    const [isAdminState, setIsAdminState] = useState(isAdmin);
    const [deleteType, setDeleteType] = useState('this'); // 'this' or 'all'
    const { room, activeSpeakerData, speakingUids: contextSpeakingUids } = useVoice();
    const [speakingUids, setSpeakingUids] = useState([]);
    const [voicePresence, setVoicePresence] = useState({});
    const [appPresence, setAppPresence] = useState({});
    const [participantUids, setParticipantUids] = useState([]);
    const [staffData, setStaffData] = useState({});
    const [organizerId, setOrganizerId] = useState(null);

    React.useEffect(() => {
        if (!tripId || !orgId) return;

        const presenceRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel/presence`);
        const unsubscribe = onValue(presenceRef, (snapshot) => {
            if (snapshot.exists()) {
                setVoicePresence(snapshot.val() || {});
            } else {
                setVoicePresence({});
            }
        });

        return () => unsubscribe();
    }, [tripId, orgId]);

    React.useEffect(() => {
        if (!tripId || !orgId) return;

        const appPresenceRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel/app_presence`);
        const unsubscribe = onValue(appPresenceRef, (snapshot) => {
            if (snapshot.exists()) {
                setAppPresence(snapshot.val() || {});
            } else {
                setAppPresence({});
            }
        });

        // Ensure own presence is marked online in RTDB immediately when viewing participants
        const myUid = auth.currentUser?.uid;
        if (myUid && AppState.currentState === 'active') {
            const itemRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel/app_presence/${myUid}`);
            onDisconnect(itemRef).remove().catch(() => {});
            update(appPresenceRef, {
                [myUid]: true
            }).catch(() => {});
        }

        return () => unsubscribe();
    }, [tripId, orgId, auth.currentUser?.uid]);

    React.useEffect(() => {
        if (!room) return;

        const handleActiveSpeakersChanged = (speakers) => {
            setSpeakingUids((speakers || []).map(s => s.identity));
        };

        room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
        
        if (room.activeSpeakers) {
            setSpeakingUids(room.activeSpeakers.map(s => s.identity));
        } else {
            setSpeakingUids([]);
        }

        return () => {
            room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakersChanged);
        };
    }, [room]);

    React.useEffect(() => {
        const fetchRole = async () => {
            try {
                if (auth.currentUser) {
                    const token = await auth.currentUser.getIdTokenResult();
                    const role = token.claims.role || 'participant';
                    setUserRole(role);
                    setIsAdminState(role === 'admin' || role === 'co-host' || role === 'manager');
                }
            } catch (error) {
                console.warn("[ParticipantsScreen] Error fetching role:", error);
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

    // Get organizer ID once
    React.useEffect(() => {
        if (!tripId || !orgId) return;
        const tripDataRef = ref(database, `orgs/${orgId}/trips/${tripId}`);
        get(tripDataRef).then(snap => {
            if (snap.exists()) {
                setOrganizerId(snap.val().organizer_id);
            }
        });
    }, [tripId, orgId]);

    // Listen to participants and staff in real-time
    React.useEffect(() => {
        if (!tripId || !orgId) {
            setIsLoading(false);
            return;
        }

        const participantsRef = ref(database, `trips_participants/${tripId}`);
        const unsubscribeParticipants = onValue(participantsRef, (snapshot) => {
            const val = snapshot.val() || {};
            let uids = [];
            if (Array.isArray(val)) {
                uids = val.filter(v => v !== null);
            } else {
                uids = Object.keys(val);
            }
            setParticipantUids(uids);
        });

        const staffRef = ref(database, `orgs/${orgId}/staff`);
        const unsubscribeStaff = onValue(staffRef, (snapshot) => {
            setStaffData(snapshot.val() || {});
        });

        return () => {
            unsubscribeParticipants();
            unsubscribeStaff();
        };
    }, [tripId, orgId]);

    // Build participants list reactively
    React.useEffect(() => {
        if (!tripId || !orgId) {
            setIsLoading(false);
            return;
        }

        const filteredUids = participantUids.filter(uid => {
            const role = staffData[uid];
            return !role || role === 'admin' || role === 'co-host' || role === 'manager';
        });

        const teamMemberUids = Object.keys(staffData).filter(uid => {
            const role = staffData[uid];
            return role === 'admin' || role === 'co-host' || role === 'manager';
        });

        const combinedUids = Array.from(new Set([...filteredUids, ...teamMemberUids]));

        if (combinedUids.length === 0) {
            setParticipants([]);
            setParticipantsCount(0);
            setIsLoading(false);
            return;
        }

        let isMounted = true;

        const promises = combinedUids.map((uid) => {
            const profileRef = ref(database, `users/${uid}/profile`);
            const nameRef = ref(database, `users/${uid}/full_name`);
            const visibilityRef = ref(database, `users/${uid}/participant_visibility/${tripId}`);

            return Promise.all([
                get(profileRef),
                get(nameRef),
                get(visibilityRef),
                get(ref(database, `users/${uid}/photo_url`)).catch(() => ({ val: () => null }))
            ]).then(([userSnap, nameSnap, visSnap, photoSnap]) => {
                if (!isMounted) return null;
                const rawProfile = userSnap.val() || {};
                const photoUrl = photoSnap?.val();
                const profile = {
                    ...rawProfile,
                    photoURL: rawProfile.photoURL || rawProfile.photo_url || photoUrl || rawProfile.photo || rawProfile.profile_photo || rawProfile.image
                };
                const fullName = nameSnap.val();
                const visibility = visSnap.val() || {};
                const targetRole = staffData[uid];
                const isTargetStaff = isStaffMember(uid, staffData, organizerId, targetRole);
                const isViewerStaff = isStaffMember(auth.currentUser?.uid, staffData, organizerId, userRole) || isAdminState;

                const displayName = getParticipantDisplayName({
                    profile,
                    fullName,
                    targetUid: uid,
                    viewerUid: auth.currentUser?.uid,
                    isViewerStaff,
                    isTargetStaff,
                    globalConfig: globalVisibilityConfig,
                    personalVisibility: visibility
                });

                const displayImage = getParticipantDisplayPhoto({
                    profile,
                    displayName,
                    targetUid: uid,
                    viewerUid: auth.currentUser?.uid,
                    isViewerStaff,
                    isTargetStaff,
                    globalConfig: globalVisibilityConfig,
                    personalVisibility: visibility
                });

                const canSeeFirstName = checkPIIVisibility({
                    field: 'name',
                    targetUid: uid,
                    viewerUid: auth.currentUser?.uid,
                    isViewerStaff,
                    isTargetStaff,
                    globalConfig: globalVisibilityConfig,
                    personalVisibility: visibility
                });

                const canSeeLastName = checkPIIVisibility({
                    field: 'lastname',
                    targetUid: uid,
                    viewerUid: auth.currentUser?.uid,
                    isViewerStaff,
                    isTargetStaff,
                    globalConfig: globalVisibilityConfig,
                    personalVisibility: visibility
                });

                const canSeeEmail = checkPIIVisibility({
                    field: 'email',
                    targetUid: uid,
                    viewerUid: auth.currentUser?.uid,
                    isViewerStaff,
                    isTargetStaff,
                    globalConfig: globalVisibilityConfig,
                    personalVisibility: visibility
                });

                const canSeePhone = checkPIIVisibility({
                    field: 'phone',
                    targetUid: uid,
                    viewerUid: auth.currentUser?.uid,
                    isViewerStaff,
                    isTargetStaff,
                    globalConfig: globalVisibilityConfig,
                    personalVisibility: visibility
                });

                const canSeeLocation = checkPIIVisibility({
                    field: 'location',
                    targetUid: uid,
                    viewerUid: auth.currentUser?.uid,
                    isViewerStaff,
                    isTargetStaff,
                    globalConfig: globalVisibilityConfig,
                    personalVisibility: visibility
                });

                const role = staffData[uid];
                let status = uid === organizerId ? 'Organizer' : 'Joined';
                if (role === 'admin') {
                    status = 'Admin';
                } else if (role === 'co-host') {
                    status = 'Co-Host';
                } else if (role === 'manager') {
                    status = 'Manager';
                }

                let rawFirstName = profile.firstName || profile.first_name || '';
                let rawLastName = profile.lastName || profile.last_name || '';
                if (!rawFirstName && !rawLastName && fullName) {
                    const parts = String(fullName).trim().split(/\s+/);
                    rawFirstName = parts[0] || '';
                    rawLastName = parts.slice(1).join(' ') || '';
                }

                return {
                    id: uid,
                    name: displayName,
                    image: displayImage,
                    status: status,
                    isSpeaking: false,
                    isOrganizer: uid === organizerId,
                    email: canSeeEmail ? (profile.email || 'N/A') : '***',
                    phone: canSeePhone ? (profile.phone || 'N/A') : '***',
                    firstName: canSeeFirstName ? (rawFirstName || '') : '***',
                    lastName: canSeeLastName ? (rawLastName || '') : '***',
                    canSeeFirstName,
                    canSeeLastName,
                    canSeeEmail,
                    canSeePhone,
                    canSeeLocation: canSeeLocation,
                    rawProfile: profile,
                    rawFullName: fullName,
                    rawVisibility: visibility
                };
            }).catch(err => {
                console.warn(`Error fetching participant ${uid}:`, err);
                return null;
            });
        });

        Promise.all(promises).then((results) => {
            if (!isMounted) return;
            const validParticipants = results.filter(p => p !== null);
            setParticipants(validParticipants);
            setParticipantsCount(validParticipants.length);
            setIsLoading(false);
        });

        return () => {
            isMounted = false;
        };
    }, [participantUids, staffData, globalVisibilityConfig, organizerId, tripId, orgId, isAdminState, userRole]);

    const filteredParticipants = React.useMemo(() => {
        const activeUids = (speakingUids && speakingUids.length > 0) ? speakingUids : (contextSpeakingUids || []);
        const speakerData = activeSpeakerData;
        const myUid = auth.currentUser?.uid;

        return participants
            .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .sort((a, b) => {
                // Rule 1: Current user (You) always first
                if (a.id === myUid && b.id !== myUid) return -1;
                if (b.id === myUid && a.id !== myUid) return 1;

                const aIsSpeaking = activeUids.includes(a.id) || (speakerData && speakerData.uid === a.id && speakerData.speaking !== false);
                const bIsSpeaking = activeUids.includes(b.id) || (speakerData && speakerData.uid === b.id && speakerData.speaking !== false);

                const aIndex = activeUids.indexOf(a.id);
                const bIndex = activeUids.indexOf(b.id);

                // Rule 2: Active speakers directly below current user
                if (aIsSpeaking && bIsSpeaking) {
                    if (aIndex !== -1 && bIndex !== -1 && aIndex !== bIndex) {
                        return aIndex - bIndex;
                    }
                }
                if (aIsSpeaking && !bIsSpeaking) return -1;
                if (!aIsSpeaking && bIsSpeaking) return 1;

                // Rule 3: Rest of participants in consistent alphabetical order
                const aName = (a.name || '').trim();
                const bName = (b.name || '').trim();
                const nameDiff = aName.localeCompare(bName, undefined, { sensitivity: 'base' });
                if (nameDiff !== 0) return nameDiff;
                return (a.id || '').localeCompare(b.id || '');
            });
    }, [participants, searchQuery, speakingUids, contextSpeakingUids, activeSpeakerData, auth.currentUser?.uid]);

    const voiceTracks = useTracks([Track.Source.Microphone], { onlyRemote: false });

    const mappedParticipants = filteredParticipants.map(p => {
        const isInVoice = voicePresence[p.id] === true;
        const isCurrentUser = p.id === auth.currentUser?.uid;
        const isOnline = appPresence[p.id] === true || (isCurrentUser && AppState.currentState === 'active');
        const track = voiceTracks.find(t => t.participant.identity === p.id);
        const currentSpeakingUids = (speakingUids && speakingUids.length > 0) ? speakingUids : (contextSpeakingUids || []);
        const isSpeaking = currentSpeakingUids.includes(p.id) || (activeSpeakerData && activeSpeakerData.uid === p.id && activeSpeakerData.speaking !== false);
        
        let voiceStatus = null;
        if (track) {
            const isMicrophoneEnabled = track.participant.isMicrophoneEnabled;
            voiceStatus = isSpeaking ? 'Speaking' : (isMicrophoneEnabled ? 'Active' : 'Muted');
        } else if (isInVoice) {
            voiceStatus = isSpeaking ? 'Speaking' : 'joined';
        } else if (isOnline) {
            if (p.status === 'Joined') {
                voiceStatus = 'online';
            } else {
                voiceStatus = `${p.status} (online)`;
            }
        } else {
            if (p.status === 'Joined') {
                voiceStatus = 'offline';
            } else {
                voiceStatus = `${p.status} (offline)`;
            }
        }
        
        return {
            ...p,
            voiceStatus,
            isSpeaking
        };
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
                <View style={styles.avatarContainer}>
                    {item.isSpeaking && <SpeakerGlow size={60} />}
                    <Image
                        source={{ uri: item.image }}
                        style={[
                            styles.avatar,
                            item.isSpeaking && styles.speakingAvatar
                        ]}
                    />
                </View>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={[
                        styles.status,
                        item.voiceStatus && item.voiceStatus.includes('Speaking') && styles.statusSpeaking,
                        item.voiceStatus && item.voiceStatus.includes('Active') && styles.statusActive,
                        item.voiceStatus && item.voiceStatus.includes('Muted') && styles.statusMuted,
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
    const searchInputRef = React.useRef(null);

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
                    <TouchableOpacity onPress={() => searchInputRef.current?.focus()}>
                        <Feather name="search" size={22} color="#A1A1AA" style={styles.searchIcon} />
                    </TouchableOpacity>
                    <TextInput
                        ref={searchInputRef}
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
                contentContainerStyle={[
                    styles.listContent,
                    mappedParticipants.length === 0 && { flexGrow: 1, justifyContent: 'center' }
                ]}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={renderEmptyComponent}
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

                            {/* Mini Map Placeholder - Only rendered when location visibility allows */}
                            {selectedParticipant.canSeeLocation !== false && (
                                <View style={styles.mapPlaceholder}>
                                    <Image
                                        source={{ uri: 'https://via.placeholder.com/400x200/1A1E21/FFFFFF?text=Map+View' }}
                                        style={styles.mapImage}
                                    />
                                    <View style={styles.mapPinContainer}>
                                        <Image source={{ uri: selectedParticipant.image }} style={styles.mapPinAvatar} />
                                    </View>
                                </View>
                            )}

                            {!isAdminState && (
                                <TouchableOpacity
                                    style={styles.actionButtonOutline}
                                    onPress={() => {
                                        setDetailVisible(false);
                                        navigation.navigate('EditParticipant', { participant: selectedParticipant, tripId });
                                    }}
                                >
                                    <Text style={styles.actionButtonText}>Edit Participant</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeletePress('this')}
                            >
                                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <Path d="M2.75002 6.167C2.75002 5.707 3.09502 5.333 3.52102 5.333H6.18602C6.71502 5.318 7.18202 4.955 7.36202 4.417L7.39202 4.322L7.50702 3.95C7.57702 3.722 7.63802 3.523 7.72402 3.345C8.06202 2.643 8.68802 2.156 9.41102 2.031C9.59502 2 9.78802 2 10.011 2H13.489C13.712 2 13.906 2 14.089 2.031C14.812 2.156 15.439 2.643 15.776 3.345C15.862 3.523 15.923 3.722 15.993 3.95L16.108 4.322L16.138 4.417C16.318 4.955 16.878 5.319 17.408 5.333H19.978C20.405 5.333 20.75 5.706 20.75 6.167C20.75 6.628 20.405 7 19.979 7H3.52002C3.09402 7 2.75002 6.627 2.75002 6.167ZM11.607 22H12.394C15.101 22 16.454 22 17.335 21.137C18.215 20.273 18.305 18.857 18.485 16.026L18.745 11.945C18.843 10.408 18.892 9.64 18.45 9.153C18.008 8.666 17.263 8.666 15.771 8.666H8.23002C6.73902 8.666 5.99302 8.666 5.55102 9.153C5.10902 9.64 5.15902 10.408 5.25602 11.945L5.51602 16.025C5.69602 18.858 5.78602 20.273 6.66602 21.137C7.54602 22.001 8.90002 22 11.607 22Z" fill="white"/>
                                </Svg>

                                <Text style={styles.deleteButtonText}>Delete for this trip</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDeletePress('all')}
                            >
                                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <Path d="M2.75002 6.167C2.75002 5.707 3.09502 5.333 3.52102 5.333H6.18602C6.71502 5.318 7.18202 4.955 7.36202 4.417L7.39202 4.322L7.50702 3.95C7.57702 3.722 7.63802 3.523 7.72402 3.345C8.06202 2.643 8.68802 2.156 9.41102 2.031C9.59502 2 9.78802 2 10.011 2H13.489C13.712 2 13.906 2 14.089 2.031C14.812 2.156 15.439 2.643 15.776 3.345C15.862 3.523 15.923 3.722 15.993 3.95L16.108 4.322L16.138 4.417C16.318 4.955 16.878 5.319 17.408 5.333H19.978C20.405 5.333 20.75 5.706 20.75 6.167C20.75 6.628 20.405 7 19.979 7H3.52002C3.09402 7 2.75002 6.627 2.75002 6.167ZM11.607 22H12.394C15.101 22 16.454 22 17.335 21.137C18.215 20.273 18.305 18.857 18.485 16.026L18.745 11.945C18.843 10.408 18.892 9.64 18.45 9.153C18.008 8.666 17.263 8.666 15.771 8.666H8.23002C6.73902 8.666 5.99302 8.666 5.55102 9.153C5.10902 9.64 5.15902 10.408 5.25602 11.945L5.51602 16.025C5.69602 18.858 5.78602 20.273 6.66602 21.137C7.54602 22.001 8.90002 22 11.607 22Z" fill="white"/>
                                </Svg>
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
                        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <Path d="M2.75002 6.167C2.75002 5.707 3.09502 5.333 3.52102 5.333H6.18602C6.71502 5.318 7.18202 4.955 7.36202 4.417L7.39202 4.322L7.50702 3.95C7.57702 3.722 7.63802 3.523 7.72402 3.345C8.06202 2.643 8.68802 2.156 9.41102 2.031C9.59502 2 9.78802 2 10.011 2H13.489C13.712 2 13.906 2 14.089 2.031C14.812 2.156 15.439 2.643 15.776 3.345C15.862 3.523 15.923 3.722 15.993 3.95L16.108 4.322L16.138 4.417C16.318 4.955 16.878 5.319 17.408 5.333H19.978C20.405 5.333 20.75 5.706 20.75 6.167C20.75 6.628 20.405 7 19.979 7H3.52002C3.09402 7 2.75002 6.627 2.75002 6.167ZM11.607 22H12.394C15.101 22 16.454 22 17.335 21.137C18.215 20.273 18.305 18.857 18.485 16.026L18.745 11.945C18.843 10.408 18.892 9.64 18.45 9.153C18.008 8.666 17.263 8.666 15.771 8.666H8.23002C6.73902 8.666 5.99302 8.666 5.55102 9.153C5.10902 9.64 5.15902 10.408 5.25602 11.945L5.51602 16.025C5.69602 18.858 5.78602 20.273 6.66602 21.137C7.54602 22.001 8.90002 22 11.607 22Z" fill="white"/>
                        </Svg>
                        <Text style={styles.deleteButtonText}>Delete for this trip</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.multiDeleteButton}
                        onPress={() => {
                            setMultiDeleteVisible(false);
                            setTimeout(() => setMultiConfirmVisible(true), 300);
                        }}
                    >
                        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <Path d="M2.75002 6.167C2.75002 5.707 3.09502 5.333 3.52102 5.333H6.18602C6.71502 5.318 7.18202 4.955 7.36202 4.417L7.39202 4.322L7.50702 3.95C7.57702 3.722 7.63802 3.523 7.72402 3.345C8.06202 2.643 8.68802 2.156 9.41102 2.031C9.59502 2 9.78802 2 10.011 2H13.489C13.712 2 13.906 2 14.089 2.031C14.812 2.156 15.439 2.643 15.776 3.345C15.862 3.523 15.923 3.722 15.993 3.95L16.108 4.322L16.138 4.417C16.318 4.955 16.878 5.319 17.408 5.333H19.978C20.405 5.333 20.75 5.706 20.75 6.167C20.75 6.628 20.405 7 19.979 7H3.52002C3.09402 7 2.75002 6.627 2.75002 6.167ZM11.607 22H12.394C15.101 22 16.454 22 17.335 21.137C18.215 20.273 18.305 18.857 18.485 16.026L18.745 11.945C18.843 10.408 18.892 9.64 18.45 9.153C18.008 8.666 17.263 8.666 15.771 8.666H8.23002C6.73902 8.666 5.99302 8.666 5.55102 9.153C5.10902 9.64 5.15902 10.408 5.25602 11.945L5.51602 16.025C5.69602 18.858 5.78602 20.273 6.66602 21.137C7.54602 22.001 8.90002 22 11.607 22Z" fill="white"/>
                        </Svg>
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
        position: 'relative',
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    speakingAvatar: {
        borderWidth: 2,
        borderColor: '#34C759',
        shadowColor: '#34C759',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 6,
        elevation: 8,
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
        width: 130,
        height: 5,
        backgroundColor: '#FFFFFF',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,

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
        fontSize: 16,
        fontFamily: Typography.sans.semiBold,
        textAlign: 'center',
        letterSpacing: 0.2,
        marginBottom: 30,
    },
    multiDeleteButton: {
        width: '100%',
        height: 56,
        borderRadius: 50,
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
        color: '#FFFBFC',
        fontSize: 16,
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2
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
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
        paddingBottom: 60,
    },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#1E2328',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#B99A4A',
    },
    emptyTitle: {
        fontSize: 20,
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        textAlign: 'center',
        marginBottom: 10,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default ParticipantsScreen;
