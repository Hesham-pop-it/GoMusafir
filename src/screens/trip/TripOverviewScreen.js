import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
    View,
    Text,
    StyleSheet,
    ImageBackground,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Alert,
    StatusBar,
    Image,
    PanResponder,
    Animated,
    Share,
} from 'react-native';
import Modal from 'react-native-modal';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ref, onValue, get, update, remove, query, limitToLast, set, push, serverTimestamp } from 'firebase/database';

import { database, auth, functions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useNavigation, useRoute } from '@react-navigation/native';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import GradientBorderButton from '../../components/GradientBorderButton';
import { responsiveFontSize } from '../../utils/responsive';
import ParticipantDetailModal from '../../components/trip/ParticipantDetailModal';

const { width, height } = Dimensions.get('window');

const MicUnmutedIcon = ({ color = "white", size = 20 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <G clipPath="url(#clip0_mic_unmuted)">
            <Path fillRule="evenodd" clipRule="evenodd" d="M12 16.5C14.4842 16.4974 16.4974 14.4842 16.5 12V6C16.5 3.51472 14.4853 1.5 12 1.5C9.51472 1.5 7.5 3.51472 7.5 6V12C7.50258 14.4842 9.51579 16.4974 12 16.5ZM9 6C9 4.34315 10.3431 3 12 3C13.6569 3 15 4.34315 15 6V12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12V6ZM12.75 19.4625V21.75C12.75 22.1642 12.4142 22.5 12 22.5C11.5858 22.5 11.25 22.1642 11.25 21.75V19.4625C7.41988 19.0728 4.50473 15.8499 4.5 12C4.5 11.5858 4.83579 11.25 5.25 11.25C5.66421 11.25 6 11.5858 6 12C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12C18 11.5858 18.3358 11.25 18.75 11.25C19.1642 11.25 19.5 11.5858 19.5 12C19.4953 15.8499 16.5801 19.0728 12.75 19.4625Z" fill={color} />
        </G>
        <Defs>
            <ClipPath id="clip0_mic_unmuted">
                <Rect width="24" height="24" fill="white" />
            </ClipPath>
        </Defs>
    </Svg>
);

const MicMutedIcon = ({ color = "white", size = 20 }) => (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <Path fillRule="evenodd" clipRule="evenodd" d="M22.0552 21.7457L7.0552 5.24568C6.87596 5.04363 6.60193 4.95357 6.33777 5.00988C6.07362 5.0662 5.86015 5.2602 5.7789 5.51778C5.69765 5.77536 5.76117 6.05674 5.9452 6.25443L9.5002 10.1647V14.0001C9.50042 15.6452 10.3983 17.159 11.8419 17.9481C13.2854 18.7371 15.0444 18.6756 16.4293 17.7876L17.4493 18.9126C15.6167 20.2 13.2196 20.3596 11.2325 19.3265C9.24544 18.2934 7.99911 16.2397 8.0002 14.0001C8.0002 13.5858 7.66442 13.2501 7.2502 13.2501C6.83599 13.2501 6.5002 13.5858 6.5002 14.0001C6.50493 17.85 9.42008 21.0728 13.2502 21.4626V23.7501C13.2502 24.1643 13.586 24.5001 14.0002 24.5001C14.4144 24.5001 14.7502 24.1643 14.7502 23.7501V21.4616C16.0953 21.3278 17.379 20.8318 18.4646 20.0263L20.9452 22.7544C21.1244 22.9565 21.3985 23.0465 21.6626 22.9902C21.9268 22.9339 22.1403 22.7399 22.2215 22.4823C22.3028 22.2247 22.2392 21.9434 22.0552 21.7457ZM14.0002 17.0001C12.3433 17.0001 11.0002 15.6569 11.0002 14.0001V11.8147L15.399 16.6541C14.9677 16.8813 14.4876 17.0001 14.0002 17.0001ZM10.1715 5.63568C11.2286 3.92384 13.2936 3.12174 15.2291 3.67119C17.1646 4.22064 18.5002 5.98809 18.5002 8.00005V13.6654C18.5002 14.0796 18.1644 14.4154 17.7502 14.4154C17.336 14.4154 17.0002 14.0796 17.0002 13.6654V8.00005C17.0009 6.65799 16.1102 5.4787 14.8192 5.11234C13.5281 4.74598 12.1507 5.28168 11.4465 6.42412C11.3105 6.66222 11.0554 6.80713 10.7812 6.80203C10.5071 6.79694 10.2576 6.64264 10.1305 6.39965C10.0035 6.15666 10.0192 5.86371 10.1715 5.63568ZM19.5915 16.1816C19.8628 15.4864 20.0015 14.7464 20.0002 14.0001C20.0002 13.5858 20.336 13.2501 20.7502 13.2501C21.1644 13.2501 21.5002 13.5858 21.5002 14.0001C21.5015 14.9331 21.3279 15.8582 20.9883 16.7272C20.8949 16.9825 20.6707 17.1672 20.4023 17.21C20.1339 17.2529 19.8634 17.1472 19.6951 16.9338C19.5268 16.7204 19.4872 16.4326 19.5915 16.1816Z" fill={color} />
    </Svg>
);

const mapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
  { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#263c3f" }] },
  { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#6b9a76" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] },
  { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#746855" }] },
  { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1f2835" }] },
  { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#f3d19c" }] },
  { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#2f3948" }] },
  { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#515c6d" }] },
  { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#17263c" }] }
];

const TripOverviewScreen = () => {

    const navigation = useNavigation();
    const route = useRoute();
    const { trip, tripId: passedTripId, orgId: passedOrgId, invitationCode: directCode, isAdmin: passedIsAdmin } = route.params || {};

    const invitationCode = directCode || trip?.invitationCode;

    const [liveTripData, setLiveTripData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(passedIsAdmin !== undefined ? passedIsAdmin : (trip?.isAdmin !== undefined ? trip.isAdmin : false));
    const [userRole, setUserRole] = useState(passedIsAdmin ? 'admin' : 'participant');


    const [visibilityModalVisible, setVisibilityModalVisible] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [seatModalVisible, setSeatModalVisible] = useState(false);
    const [requestSentVisible, setRequestSentVisible] = useState(false);
    const [seatCount, setSeatCount] = useState(1);

    // New Participant Detail States
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [detailVisible, setDetailVisible] = useState(false);
    const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
    const [deleteType, setDeleteType] = useState('this'); // 'this' or 'all'
    const [quickAlertVisible, setQuickAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');

    const [selectedField, setSelectedField] = useState(null);
    const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
    const [countdown, setCountdown] = useState(10);
    const [isMuted, setIsMuted] = useState(true);
    const [isAllMuted, setIsAllMuted] = useState(true);
    const [isChannelStarted, setIsChannelStarted] = useState(false);
    const [participantsList, setParticipantsList] = useState([]);
    const [notificationsList, setNotificationsList] = useState([]);
    const [lastChatMessage, setLastChatMessage] = useState(null);
    const [liveLocations, setLiveLocations] = useState({});
    const [userLocation, setUserLocation] = useState(null);
    const [participantsCount, setParticipantsCount] = useState(0);
    const [sharedTemplates, setSharedTemplates] = useState([]);
    const [globalVisibilityConfig, setGlobalVisibilityConfig] = useState({});
    const [activeSpeakerData, setActiveSpeakerData] = useState(null);
    const [currentUserFullName, setCurrentUserFullName] = useState('');
    const [resolvedOrgId, setResolvedOrgId] = useState(passedOrgId || trip?.orgId || trip?.org_id);


    // Stable ID resolution to avoid effect re-runs on temporary nulls
    const tripId = passedTripId || trip?.id || trip?.trip_id || liveTripData?.id;
    const orgId = resolvedOrgId || passedOrgId || trip?.orgId || trip?.org_id || liveTripData?.orgId;



    // Real-time Data Synchronization
    useEffect(() => {
        let tripRef;

        const syncData = async () => {
            try {
                // Verify account role from Custom Claims
                const currentU = auth.currentUser;
                if (currentU) {
                    const tokenResult = await currentU.getIdTokenResult();
                    const role = tokenResult.claims.role || 'participant';
                    setUserRole(role);
                    setIsAdmin(role === 'admin' || role === 'co-host' || role === 'manager');

                    // Fetch full name for notifications
                    get(ref(database, `users/${currentU.uid}/full_name`)).then(snap => {
                        if (snap.exists()) setCurrentUserFullName(snap.val());
                    });
                }

                let activeTripId = tripId;
                let activeOrgId = orgId;

                // S22: If no trip info passed (app start), fetch current_trip from user profile (The Secure Store)
                if (!activeTripId && auth.currentUser) {
                    const userSnap = await get(ref(database, `users/${auth.currentUser.uid}`));
                    const userData = userSnap.val();
                    
                    if (userData?.current_trip) {
                        activeTripId = userData.current_trip;
                    }
                }

                // If we still don't have a trip, return to Home instead of guessing
                if (!activeTripId) {
                    setIsLoading(false);
                    navigation.navigate('Home');
                    return;
                }

                // S22: If orgId is missing, resolve it from staff profile or joined trips
                if (!activeOrgId && auth.currentUser) {
                    const userSnap = await get(ref(database, `users/${auth.currentUser.uid}`));
                    const userData = userSnap.val();
                    
                    if (userData?.staff_org_id) {
                        activeOrgId = userData.staff_org_id;
                    } else {
                        const joinedSnap = await get(ref(database, `users/${auth.currentUser.uid}/joined_trips/${activeTripId}`));
                        if (joinedSnap.exists()) {
                            activeOrgId = joinedSnap.val().org_id || joinedSnap.val().orgId;
                        }
                    }
                }

                // S22: Anchor this trip as the 'current_trip' for the user session
                if (auth.currentUser && activeTripId) {
                    update(ref(database, `users/${auth.currentUser.uid}`), {
                        current_trip: activeTripId
                    }).catch(err => {});

                    // Resolve orgId if still missing
                    if (!activeOrgId) {
                        const orgSnap = await get(ref(database, `trips_orgs/${activeTripId}`));
                        if (orgSnap.exists()) {
                            activeOrgId = orgSnap.val();
                            setResolvedOrgId(activeOrgId);
                        }
                    }
                }

                if (invitationCode) {
                    // Participant View: Resolve Admin ID and Trip ID first
                    const inviteRef = ref(database, `invites/${invitationCode}`);
                    onValue(inviteRef, (snapshot) => {
                        const inviteData = snapshot.val();
                        if (inviteData && inviteData.org_id && inviteData.trip_id) {
                            tripRef = ref(database, `orgs/${inviteData.org_id}/trips/${inviteData.trip_id}`);
                            onValue(tripRef, (tripSnapshot) => {
                                const data = tripSnapshot.val();
                                setLiveTripData({ ...data, orgId: inviteData.org_id, id: inviteData.trip_id });
                                setIsLoading(false);
                            });
                        } else {
                            setIsLoading(false);
                        }
                    }, { onlyOnce: true });
                } else if (activeOrgId && activeTripId) {
                    // Direct sync (Admin or Resolved Participant)
                    tripRef = ref(database, `orgs/${activeOrgId}/trips/${activeTripId}`);
                    onValue(tripRef, (snapshot) => {
                        if (snapshot.exists()) {
                            setLiveTripData({ ...snapshot.val(), orgId: activeOrgId, id: activeTripId });
                        }
                        setIsLoading(false);
                    });
                } else {
                    setIsLoading(false);
                }
            } catch (error) {
                setIsLoading(false);
            }
        };


        syncData();
        return () => {
            // Cleanup would require tracking all listeners, for now we let it be
        };
    }, [invitationCode, trip]);

    // 0. Fetch Global Visibility Config
    useEffect(() => {
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

    // Mock data fallback if trip is missing or not yet loaded
    const DEFAULT_TRIP_IMAGE = require('../../../assets/Madinah.png');

    const displayTrip = liveTripData || trip || {};

    const tripData = {
        title: displayTrip.title || 'Loading Trip...',
        date: displayTrip.date || '---',
        location: displayTrip.location || '---',
        participants: participantsCount || displayTrip.participants || 0,
        image: displayTrip.image || DEFAULT_TRIP_IMAGE,
        invitationCode,
        isAdmin,
        orgId,
        tripId,
    };


    // 1. Fetch Real Participants with Privacy Masking
    useEffect(() => {
        if (!tripId || !orgId) {
            setParticipantsList([]);
            setParticipantsCount(0);
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

            // The real participant count is the number of entries in trips_participants
            // (Excluding the organizer if they are only staff)
            setParticipantsCount(uids.length);

            // Ensure organizer is in the UIDs list to be fetched for the UI list
            if (organizerId && !uids.includes(organizerId)) {
                uids.push(organizerId);
            }
            
            // Temporary collection to avoid multiple rapid state updates
            const fetchedParticipants = [];
            let processedCount = 0;

            if (uids.length === 0) {
                setParticipantsList([]);
                return;
            }

            uids.forEach((uid) => {
                const profileRef = ref(database, `users/${uid}/profile`);
                const nameRef = ref(database, `users/${uid}/full_name`);
                const visibilityRef = ref(database, `users/${uid}/participant_visibility/${tripId}`);
                
                // Fetch granular nodes
                Promise.all([get(profileRef), get(nameRef), get(visibilityRef)]).then(([userSnap, nameSnap, visSnap]) => {
                    const profile = userSnap.val() || {};
                    const fullName = nameSnap.val();
                    const visibility = visSnap.val() || {};
                    const isCurrentUser = uid === auth.currentUser?.uid;
                    const amIAdmin = isAdmin; // captured from state

                    // Privacy Logic based on role and settings
                    // Settings: 'Show to organizer', 'Show to everyone', 'Do not show'
                    const canSeePII = (field) => {
                        if (isCurrentUser) return true; // Can always see self
                        
                        // 1. Check Global Admin Config
                        const globalSetting = globalVisibilityConfig[field] || 'Show to everyone';
                        
                        // Rule: 'Do not show' hides from EVERYONE including admin
                        if (globalSetting === 'Do not show') return false;
                        if (globalSetting === 'Show to organizer') return amIAdmin;
                        if (globalSetting === 'Show to everyone') return true;
                        
                        // 2. If 'Custom choice', check participant's own setting
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

                    const pData = {
                        id: uid,
                        name: displayName,
                        image: displayImage,
                        status: uid === organizerId ? 'Organizer' : 'Joined', 
                        isSpeaking: false,
                        isOrganizer: uid === organizerId,
                        canSeeLocation: canSeePII('location')
                    };

                    setParticipantsList(prev => {
                        const filtered = prev.filter(p => p.id !== uid);
                        return [...filtered, pData];
                    });
                }).catch(err => {
                });
            });
        });

        return () => unsubscribe();
    }, [tripId, orgId, isAdmin, globalVisibilityConfig]);

    // 3. Sync Voice Channel State
    useEffect(() => {
        if (!orgId || !tripId) return;

        const voiceRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel`);
        const unsubscribe = onValue(voiceRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setIsChannelStarted(data.isChannelStarted ?? false);
                setIsAllMuted(data.isAllMuted ?? false);
                if (isAdmin && data.adminMuted !== undefined) {
                    setIsMuted(data.adminMuted);
                }
                setActiveSpeakerData(data.activeSpeaker || null);
            } else {
                setIsChannelStarted(false);
                setActiveSpeakerData(null);
            }
        });

        return () => unsubscribe();
    }, [orgId, tripId]);

    const handleToggleMute = async () => {
        const nextState = !isMuted;
        setIsMuted(nextState); // Optimistic update
        
        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';
        if (isStaff && orgId && tripId) {
            update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                adminMuted: nextState
            });
        }
    };

    const handleToggleAllMute = async () => {
        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';
        if (!isStaff || !orgId || !tripId) return;
        const nextState = !isAllMuted;
        setIsAllMuted(nextState);
        update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
            isAllMuted: nextState
        });
    };

    const handleToggleChannel = async () => {
        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';
        if (!isStaff || !orgId || !tripId) return;
        const nextState = !isChannelStarted;

        if (nextState) {
            // If starting, navigate to Voice Chat and auto-start
            navigation.navigate('VoiceChat', { 
                trip: tripData, 
                isAdmin: true, 
                autoStart: true 
            });
        } else {
            // If stopping, just update the DB
            setIsChannelStarted(false);
            update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                isChannelStarted: false,
                isAllMuted: false
            });
        }
    };

    // 2. Fetch Real Notifications (Location Requests)
    useEffect(() => {
        const myUid = auth.currentUser?.uid;
        if (!myUid || !orgId || !tripId) return;

        const notificationsRef = ref(database, `trips_active/${orgId}/${tripId}/notifications/${myUid}`);
        const unsubscribe = onValue(notificationsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const list = Object.entries(data ?? {}).map(([id, val]) => {
                    let msg = val?.message || '';
                    if (val?.type === 'location_request') {
                        msg = 'asked for your location';
                    }
                    
                    return {
                        id,
                        ...(val || {}),
                        message: msg
                    };
                });
                // Sort by timestamp
                list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                setNotificationsList(list);
            } else {
                setNotificationsList([]);
            }
        });

        return () => unsubscribe();
    }, [orgId, tripId]);

    // 3. Fetch Shared Templates for Admin
    useEffect(() => {
        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';
        if (!orgId || !tripId || !isStaff) return;

        const templatesRef = ref(database, `trips_active/${orgId}/${tripId}/templates`);
        const unsubscribe = onValue(templatesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const list = Object.entries(data).map(([id, t]) => ({
                    id,
                    name: t.name,
                    message: t.message
                }));
                setSharedTemplates(list);
            } else {
                setSharedTemplates([]);
            }
        });

        return () => unsubscribe();
    }, [orgId, tripId, isAdmin]);

    // 4. Fetch Last Chat Message
    useEffect(() => {
        if (!orgId || !tripId) return;

        const chatRef = query(ref(database, `trips_active/${orgId}/${tripId}/chat`), limitToLast(1));
        const unsubscribe = onValue(chatRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const lastKey = Object.keys(data ?? {})[0];
                if (lastKey) {
                    const msg = data[lastKey];
                    
                    // Apply privacy check for sender name if possible
                    // However, we don't have participantsList easily accessible here with privacy flags
                    // Let's use a simpler check: if name visibility is restricted globally to 'Do not show'
                    const nameSetting = globalVisibilityConfig?.name || 'Show to everyone';
                    let senderName = msg.sender_name || 'User';
                    if (nameSetting === 'Do not show') senderName = 'User';
                    else if (nameSetting === 'Show to organizer' && !isAdmin) senderName = 'User';

                    setLastChatMessage({
                        senderName: senderName,
                        text: msg.text || '',
                        type: msg.type || ''
                    });
                }
            } else {
                setLastChatMessage(null);
            }
        });

        return () => unsubscribe();
    }, [orgId, tripId]);

    // 4. Fetch Live Participant Locations for map preview
    useEffect(() => {
        if (!orgId || !tripId) return;

        const locationsRef = ref(database, `trips_active/${orgId}/${tripId}/locations`);
        const unsubscribe = onValue(locationsRef, (snapshot) => {
            if (snapshot.exists()) {
                setLiveLocations(snapshot.val());
            } else {
                setLiveLocations({});
            }
        });


        return () => unsubscribe();
    }, [orgId, tripId]);

    // 5. Track Current User Location

    useEffect(() => {
        let subscription;
        const startWatching = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced,
                    timeInterval: 5000,
                    distanceInterval: 10,
                },
                (loc) => {
                    setUserLocation({
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                    });
                }
            );
        };
        startWatching();
        return () => subscription?.remove();
    }, []);

    // Utility to find nearest participant
    const getNearestParticipant = () => {
        if (!userLocation || Object.keys(liveLocations ?? {}).length === 0) return null;

        let nearestUid = null;
        let minDistance = Infinity;

        for (const [uid, loc] of Object.entries(liveLocations ?? {})) {
            if (uid === auth.currentUser?.uid || !loc) continue;

            // Check visibility
            const pProfile = participantsList.find(p => p.id === uid);
            if (pProfile && pProfile.canSeeLocation === false) continue;

            const dist = Math.sqrt(
                Math.pow(loc.lat - userLocation.latitude, 2) +
                Math.pow((loc.lng || 0) - userLocation.longitude, 2)
            );

            if (dist < minDistance) {
                minDistance = dist;
                nearestUid = uid;
            }
        }

        if (!nearestUid) return null;
        return {
            uid: nearestUid,
            ...liveLocations[nearestUid],
            profile: participantsList.find(p => p.id === nearestUid)
        };
    };

    const nearestParticipant = getNearestParticipant();

    const handleAcceptNotification = async (notif) => {
        const myUid = auth.currentUser?.uid;
        if (!myUid || !orgId || !tripId) return;

        try {
            // 1. Grant permission if it's a location request
            if (notif?.type === 'location_request' && notif?.fromUid) {
                await set(ref(database, `trips_active/${orgId}/${tripId}/location_permissions/${myUid}/${notif.fromUid}`), true);
            }

            // 2. Mark as accepted for visual feedback
            await update(ref(database, `trips_active/${orgId}/${tripId}/notifications/${myUid}/${notif.id}`), {
                status: 'accepted'
            });

            // 3. Remove after delay
            setTimeout(async () => {
                try {
                    await remove(ref(database, `trips_active/${orgId}/${tripId}/notifications/${myUid}/${notif.id}`));
                } catch (e) {}
            }, 2000);
        } catch (error) {
        }
    };


    const handleRequestSeats = () => {
        setSeatModalVisible(false);
        setRequestSentVisible(true);
    };

    const handleShare = async () => {
        if (!invitationCode) return;
        try {
            const shareUrl = `https://gomusafir.app/join?code=${invitationCode}`;
            await Share.share({
                message: `Join our journey on GoMusafir! Use this link to join: ${shareUrl}`,
                url: shareUrl,
                title: 'Join Journey'
            });
        } catch (error) {
        }
    };

    const handleParticipantPress = (participant) => {
        setSelectedParticipant(participant);
        setDetailVisible(true);
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
            console.error("Delete Error:", error);
            Alert.alert("Error", "Failed to delete participant. " + error.message);
        } finally {
            setIsLoading(false);
            setSelectedParticipant(null);
        }
    };

    const sortedParticipants = [...participantsList].sort((a, b) => {
        const myUid = auth.currentUser?.uid;
        if (a.id === myUid) return -1;
        if (b.id === myUid) return 1;
        return a.name.localeCompare(b.name);
    });

    const participants = sortedParticipants;


    const QUICK_MESSAGES = [
        'The bus leaves in 5 min',
        'Gather at the meeting point',
        'Bus is arriving, please get ready'
    ];

    const MOCK_NOTIFICATIONS = notificationsList;


    const handleQuickMsgPress = (template) => {
        setAlertMessage(template.message);
        setQuickAlertVisible(true);
    };

    const broadcastNotification = async (msg) => {
        if (!orgId || !tripId) {
            alert("Trip information not fully loaded. Please wait.");
            return;
        }

        try {
            const timestamp = serverTimestamp();
            const adminName = currentUserFullName || auth.currentUser?.email?.split('@')[0] || 'Admin';
            
            // 1. Fetch current UIDs directly from the source of truth (trips_participants)
            const participantsRef = ref(database, `trips_participants/${tripId}`);
            const participantsSnap = await get(participantsRef);
            
            if (!participantsSnap.exists()) {
                alert("No participants found to notify.");
                return;
            }

            const val = participantsSnap.val();
            if (!val) {
                alert("No participants found in this trip.");
                return;
            }
            
            // S22: Correctly extract UIDs (values) and ensure they are unique
            const rawUids = Array.isArray(val) ? val.filter(v => v !== null) : Object.keys(val);
            const uids = Array.from(new Set(rawUids.filter(id => typeof id === 'string')));

            // 2. Broadcast to all found UIDs
            const promises = uids.map(uid => {
                const userNotifRef = ref(database, `trips_active/${orgId}/${tripId}/notifications/${uid}`);
                return push(userNotifRef, {
                    name: adminName,
                    message: msg,
                    timestamp: timestamp,
                    type: 'alert'
                });
            });

            await Promise.all(promises);
            setQuickAlertVisible(false); // Close preview
            Alert.alert("Success", "Notification broadcasted to all participants.");
        } catch (error) {
            console.error("Broadcast failed:", error);
            alert("Failed to send notification.");
        }
    };

    const triggerEmergencyAlert = async () => {
        if (!orgId || !tripId) return;
        try {
            // 1. Get all staff members for this organization
            const staffRef = ref(database, `orgs/${orgId}/staff`);
            const staffSnap = await get(staffRef);
            
            if (staffSnap.exists()) {
                const staffData = staffSnap.val();
                // S22: Ensure unique Staff UIDs to prevent duplicate emergency alerts
                const staffUids = Array.from(new Set(Object.keys(staffData)));
                const userName = currentUserFullName || auth.currentUser?.email?.split('@')[0] || 'A Participant';
                const timestamp = serverTimestamp();

                // 2. Send notification to each staff member (excluding the sender)
                const promises = staffUids
                    .filter(sUid => sUid !== auth.currentUser?.uid) // Don't notify yourself
                    .map(sUid => {
                        const notifRef = ref(database, `trips_active/${orgId}/${tripId}/notifications/${sUid}`);
                        return push(notifRef, {
                            name: isAdmin ? "Admin" : userName,
                            message: "needs immediate assistance!",
                            timestamp: timestamp,
                            type: 'emergency',
                            senderUid: auth.currentUser?.uid
                        });
                    });

                await Promise.all(promises);
                // setAlertMessage("Emergency Alert Sent to all staff!");
                // setQuickAlertVisible(true);
            }
        } catch (error) {
            console.error("Emergency Alert Failed:", error);
        }
    };

    const PrayerTimeItem = ({ name, time, icon, isActive }) => (
        <View style={styles.prayerItem}>
            <MaterialCommunityIcons
                name={icon}
                size={24}
                color={isActive ? "#B99A4A" : "#A1A1AA"}
                style={{ marginBottom: 4 }}
            />
            <Text style={[styles.prayerName, isActive && { color: '#FFF' }]}>{name}</Text>
            <Text style={[styles.prayerTime, isActive && { color: '#FFF' }]}>{time}</Text>
        </View>
    );

    const [prayerTimes, setPrayerTimes] = useState({
        Fajr: "--:--",
        Dhuhr: "--:--",
        Asr: "--:--",
        Maghrib: "--:--",
        Isha: "--:--",
    });

    useEffect(() => {
        const getLocAndPrayers = async () => {
            console.log("Starting prayer fetch...");
            try {
                // 1. Try to load cached prayer times immediately
                const cached = await AsyncStorage.getItem('cached_prayer_times');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    const today = new Date().toISOString().split('T')[0];
                    if (parsed.date === today) {
                        console.log("Using cached prayer times for today");
                        setPrayerTimes(parsed.timings);
                    }
                }

                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    console.log("Location permission denied");
                    return;
                }

                // 2. Get location with Low accuracy (fastest)
                console.log("Requesting location...");
                let location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Low,
                }).catch(err => {
                    console.log("getCurrentPositionAsync failed, trying last known:", err.message);
                    return Location.getLastKnownPositionAsync();
                });

                console.log('Final Location Found:', location ? "Yes" : "No");
                
                if (location) {
                    const { latitude, longitude } = location.coords;
                    console.log(`Fetching prayers for ${latitude}, ${longitude}`);
                    
                    const response = await fetch(
                        `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=4`
                    );
                    
                    const data = await response.json();
                    if (data.code === 200) {
                        console.log("Prayer API Success");
                        const timings = data.data.timings;
                        const newTimings = {
                            Fajr: timings.Fajr,
                            Dhuhr: timings.Dhuhr,
                            Asr: timings.Asr,
                            Maghrib: timings.Maghrib,
                            Isha: timings.Isha,
                        };
                        setPrayerTimes(newTimings);
                        
                        // Cache for today
                        await AsyncStorage.setItem('cached_prayer_times', JSON.stringify({
                            date: new Date().toISOString().split('T')[0],
                            timings: newTimings
                        }));
                    } else {
                        console.log("Prayer API Error Code:", data.code);
                    }
                } else {
                    console.log("No location could be determined");
                }
            } catch (error) {
                console.log("Prayer fetch catch error:", error);
            }
        };

        getLocAndPrayers();
    }, []);

    const getActivePrayer = () => {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const prayers = [
            { name: "Fajr", time: prayerTimes.Fajr },
            { name: "Dhuhr", time: prayerTimes.Dhuhr },
            { name: "Asr", time: prayerTimes.Asr },
            { name: "Maghrib", time: prayerTimes.Maghrib },
            { name: "Isha", time: prayerTimes.Isha },
        ];

        let activeIdx = -1;
        for (let i = 0; i < prayers.length; i++) {
            const [h, m] = prayers[i].time.split(':').map(Number);
            const pTime = h * 60 + m;
            if (currentTime >= pTime) {
                activeIdx = i;
            }
        }

        if (activeIdx === -1) return "Isha";
        return prayers[activeIdx].name;
    };

    useEffect(() => {
        let timer;
        if (emergencyModalVisible && countdown > 0) {
            timer = setInterval(() => {
                setCountdown(prev => prev - 1);
            }, 1000);
        } else if (countdown === 0) {
            setEmergencyModalVisible(false);
            triggerEmergencyAlert();
            setCountdown(10);
        }
        return () => clearInterval(timer);
    }, [emergencyModalVisible, countdown]);

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
    const panYEmergency = React.useRef(new Animated.Value(0)).current;
    const panYDelete = React.useRef(new Animated.Value(0)).current;
    const panYQuick = React.useRef(new Animated.Value(0)).current;

    const detailSwipe = createDraggableResponder(setDetailVisible, panYDetail);
    const emergencySwipe = createDraggableResponder(setEmergencyModalVisible, panYEmergency);
    const deleteConfirmSwipe = createDraggableResponder(setDeleteConfirmVisible, panYDelete); // Reusing for confirm modal
    const quickAlertSwipe = createDraggableResponder(setQuickAlertVisible, panYQuick);



    const activePrayer = getActivePrayer();

    const ControlButton = ({ icon, label, isActive }) => (
        <TouchableOpacity style={[styles.controlButton, isActive && styles.controlButtonActive]}>
            <View style={styles.controlIconWrapper}>
                <Ionicons name={icon} size={20} color="#FFF" />
            </View>
            <Text style={styles.controlLabel}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Background Image at the top only */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 310 }}>
                <ImageBackground
                    source={typeof tripData.image === 'string' ? { uri: tripData.image } : tripData.image}
                    style={{ flex: 1 }}
                    resizeMode="cover"
                >
                    <LinearGradient
                        colors={['rgba(0,0,0,0.3)', Colors.dark.background]}
                        style={styles.gradientOverlay}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                    />
                </ImageBackground>
            </View>

            <SafeAreaView style={{ flex: 1, marginTop: 20 }}>
                {/* Fixed Background Header Layer (Z-Index: 0) - Title stays fixed */}
                <View style={[styles.header, { position: 'absolute', top: 0, left: 0, right: 0 }]}>

                    {isAdmin ? (
                        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.iconButton}>
                            <Ionicons name="arrow-back" size={24} color="#FFF" />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.iconButton} />
                    )}


                    <Text style={[styles.headerTitle, (userRole === 'admin' || userRole === 'co-host') ? null : { marginRight: 30 }]}>Overview</Text>

                    {(userRole === 'admin' || userRole === 'co-host') ? (
                        // {isAdmin ? (
                        <View style={{ flexDirection: 'row' }}>
                            {/* <TouchableOpacity
                                style={styles.iconButton}
                                onPress={handleShare}
                            >
                                <Ionicons name="share-social-outline" size={24} color="#B99A4A" />
                            </TouchableOpacity> */}

                            <TouchableOpacity
                                style={styles.iconButton}
                                onPress={() => navigation.navigate('JourneySuccess', { invitationCode: trip?.invitationCode })}
                            >
                                <MaterialCommunityIcons name="card-account-details-outline" size={24} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.iconButton} />
                    )}
                </View>

                {/* Scrollable Layer (Z-Index: 10) */}
                <ScrollView
                    style={{ flex: 1, zIndex: 10, marginTop: 70 }}
                    contentContainerStyle={{ flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* 1. Transparent Gap with Interactive Buttons (Mirror) */}


                    {/* 2. Content Container */}
                    <View style={{ backgroundColor: 'transparent', paddingHorizontal: 20 }}>

                        {/* Trip Info Card */}
                        <View style={styles.tripCard}>
                            <LinearGradient
                                colors={['#235242', 'rgba(35, 82, 66, 0.5)']} // Dark green to semi-transparent dark green
                                style={styles.tripCardGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Text style={styles.tripTitle}>{tripData.title}</Text>
                                <View style={styles.infoRow}>
                                    <Feather name="calendar" size={16} color="#B99A4A" />
                                    <Text style={styles.infoText}>{tripData.date}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Ionicons name="location-outline" size={16} color="#B99A4A" />
                                    <Text style={styles.infoText}>{tripData.location}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Ionicons name="person-outline" size={16} color="#B99A4A" />
                                    <Text style={styles.infoText}>{tripData.participants}</Text>
                                </View>
                            </LinearGradient>
                        </View>

                        {/* Prayer Times */}
                        <View style={styles.prayerTimesContainer}>
                            <PrayerTimeItem
                                name="Fajr"
                                time={prayerTimes.Fajr}
                                icon="weather-sunset-up"
                                isActive={activePrayer === "Fajr"}
                            />
                            <PrayerTimeItem
                                name="Dhuhr"
                                time={prayerTimes.Dhuhr}
                                icon="weather-sunny"
                                isActive={activePrayer === "Dhuhr"}
                            />
                            <PrayerTimeItem
                                name="Asr"
                                time={prayerTimes.Asr}
                                icon="weather-partly-cloudy"
                                isActive={activePrayer === "Asr"}
                            />
                            <PrayerTimeItem
                                name="Maghrib"
                                time={prayerTimes.Maghrib}
                                icon="weather-sunset-down"
                                isActive={activePrayer === "Maghrib"}
                            />
                            <PrayerTimeItem
                                name="Isha"
                                time={prayerTimes.Isha}
                                icon="weather-night"
                                isActive={activePrayer === "Isha"}
                            />
                        </View>

                        {/* Audio Channel Section */}
                        <View style={styles.sectionCard}>
                            <TouchableOpacity style={styles.channelHeader} onPress={() => navigation.navigate('VoiceChat', { trip: tripData })}>
                                <View style={styles.avatarWrapper}>
                                    <Image
                                        source={{ uri: activeSpeakerData?.avatar || 'https://ui-avatars.com/api/?name=U&background=B99A4A&color=fff' }}
                                        style={styles.speakerAvatar}
                                    />
                                    {isChannelStarted && <View style={styles.liveIndicator} />}
                                </View>
                                <View style={styles.channelInfo}>
                                    <Text style={styles.channelStatus}>Channel Status: <Text style={{ color: isChannelStarted ? '#34C759' : '#A1A1AA' }}>{isChannelStarted ? 'Live' : 'Offline'}</Text></Text>
                                    <Text style={styles.activeSpeaker}>
                                        {isChannelStarted ? (activeSpeakerData ? `Active speaker: ${activeSpeakerData.name}` : 'Ready for conversation') : 'Channel not started'}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={24} color="#fff" />
                            </TouchableOpacity>

                            {/* Audio Channel Controls */}
                            <View style={styles.controlsGrid}>
                                {(userRole === 'admin' || userRole === 'co-host' || userRole === 'manager') ? (
                                    <>
                                        <TouchableOpacity
                                            onPress={handleToggleMute}
                                            disabled={!isChannelStarted}
                                            style={[
                                                styles.controlButtonOutline,
                                                !isMuted && { backgroundColor: '#2D2528', borderColor: '#2D2528' },
                                                !isChannelStarted && { opacity: 0.5 }
                                            ]}
                                        >
                                            <View style={{ marginRight: 8 }}>
                                                {isMuted ? (
                                                    <MicMutedIcon color="#FFF" size={20} />
                                                ) : (
                                                    <MicUnmutedIcon color="#D66A77" size={20} />
                                                )}
                                            </View>
                                            <Text style={[styles.controlText, !isMuted && { color: '#D66A77', fontWeight: 'bold' }]}>
                                                {isMuted ? 'Unmute Myself' : 'Mute Myself'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleToggleAllMute}
                                            disabled={!isChannelStarted}
                                            style={[
                                                styles.controlButtonOutline,
                                                !isAllMuted && { backgroundColor: '#2D2528', borderColor: '#2D2528' },
                                                !isChannelStarted && { opacity: 0.5 }
                                            ]}
                                        >
                                            <View style={{ marginRight: 8 }}>
                                                {isAllMuted ? (
                                                    <MicMutedIcon color="#FFF" size={20} />
                                                ) : (
                                                    <MicUnmutedIcon color="#D66A77" size={20} />
                                                )}
                                            </View>
                                            <Text style={[styles.controlText, !isAllMuted && { color: '#D66A77' }]}>
                                                {isAllMuted ? 'Unmute All' : 'Mute All'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                styles.controlButtonOutline,
                                                { width: '100%', marginBottom: 0, backgroundColor: isChannelStarted ? '#D66A77' : '#34C759', borderColor: isChannelStarted ? '#D66A77' : '#34C759' }
                                            ]}
                                            onPress={handleToggleChannel}
                                        >
                                            <Ionicons
                                                name={isChannelStarted ? "stop-circle-outline" : "play-circle-outline"}
                                                size={20}
                                                color="#FFF"
                                                style={{ marginRight: 8 }}
                                            />
                                            <Text style={[styles.controlText, { color: "#FFF" }]}>
                                                {isChannelStarted ? 'Stop Channel' : 'Start Channel'}
                                            </Text>
                                        </TouchableOpacity>

                                    </>
                                ) : (
                                    <View style={{ width: '100%', alignItems: 'center' }}>
                                        <TouchableOpacity
                                            onPress={handleToggleMute}
                                            disabled={isAllMuted}
                                            style={[
                                                styles.controlButtonOutline,
                                                { width: '100%', marginBottom: 0 },
                                                (!isMuted && !isAllMuted) && { backgroundColor: '#2D2528', borderColor: '#2D2528' },
                                                isAllMuted && { opacity: 0.5 }
                                            ]}
                                        >
                                            <View style={{ marginRight: 8 }}>
                                                {(isMuted || isAllMuted) ? (
                                                    <MicMutedIcon color="#FFF" size={20} />
                                                ) : (
                                                    <MicUnmutedIcon color="#D66A77" size={20} />
                                                )}
                                            </View>
                                            <Text style={[styles.controlText, (!isMuted && !isAllMuted) && { color: '#D66A77' }]}>
                                                {isAllMuted ? 'Muted by Organizer' : (isMuted ? 'Mute Myself' : 'Unmute Myself')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Map and Chat Row */}
                        <View style={styles.rowContainer}>
                            <TouchableOpacity
                                style={[styles.sectionCard, styles.halfCard, { padding: 0, overflow: 'hidden' }]}
                                onPress={() => navigation.navigate('LiveLocation', { trip: tripData })}
                                activeOpacity={0.8}
                            >
                                {userLocation ? (
                                    <MapView
                                        style={StyleSheet.absoluteFill}
                                        initialRegion={{
                                            latitude: userLocation.latitude,
                                            longitude: userLocation.longitude,
                                            latitudeDelta: 0.05,
                                            longitudeDelta: 0.05,
                                        }}

                                        region={{
                                            latitude: userLocation.latitude,
                                            longitude: userLocation.longitude,
                                            latitudeDelta: 0.05,
                                            longitudeDelta: 0.05,
                                        }}
                                        scrollEnabled={false}
                                        zoomEnabled={false}
                                        pitchEnabled={false}
                                        rotateEnabled={false}
                                        customMapStyle={mapStyle}
                                        showsPointsOfInterest={false}
                                        showsBuildings={false}
                                        showsTraffic={false}
                                        showsIndoors={false}
                                        showsUserLocation={false}
                                        showsMyLocationButton={false}
                                        toolbarEnabled={false}
                                    >

                                        {/* Me */}
                                        <Marker 
                                            coordinate={userLocation} 
                                            anchor={{ x: 0.5, y: 0.5 }}
                                            tracksViewChanges={false}
                                        >
                                            <View style={styles.mapAvatar}>
                                                <Image 
                                                    source={{ uri: auth.currentUser?.photoURL || `https://ui-avatars.com/api/?name=${auth.currentUser?.displayName?.[0] || 'U'}&background=B99A4A&color=fff` }} 
                                                    style={styles.mapAvatarImg} 
                                                    resizeMode="cover"
                                                />
                                            </View>
                                        </Marker>

                                        {/* Nearest Participant */}
                                        {nearestParticipant && (
                                            <Marker 
                                                coordinate={{ latitude: nearestParticipant.lat, longitude: nearestParticipant.lng }} 
                                                anchor={{ x: 0.5, y: 0.5 }}
                                            >
                                                <View style={styles.mapAvatar}>
                                                    <Image 
                                                        source={{ uri: nearestParticipant.profile?.image || `https://ui-avatars.com/api/?name=${nearestParticipant.profile?.name?.[0] || 'U'}&background=B99A4A&color=fff` }} 
                                                        style={styles.mapAvatarImg} 
                                                        resizeMode="cover"
                                                    />
                                                </View>
                                            </Marker>
                                        )}


                                    </MapView>
                                ) : (
                                    <ImageBackground
                                        source={{ uri: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?q=80&w=2000&auto=format&fit=crop' }}
                                        style={styles.mapBackground}
                                        imageStyle={{ opacity: 0.6 }}
                                    >
                                        <View style={styles.mapOverlay} />
                                        <View style={[styles.mapAvatar, { top: '35%', alignSelf: 'center' }]}>
                                            <Ionicons name="location-outline" size={22} color="#B99A4A" />
                                        </View>
                                    </ImageBackground>
                                )}
                            </TouchableOpacity>



                            <TouchableOpacity
                                style={[styles.sectionCard, styles.halfCard, { backgroundColor: '#23272A' }]}
                                onPress={() => navigation.navigate('TripChat', { trip })}
                            >
                                <View style={styles.chatIconWrapper}>
                                    <View style={styles.chatIconCircle}>
                                        <Ionicons name="chatbubble-ellipses-outline" size={25} color="#B99A4A" />
                                    </View>
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>12</Text>
                                    </View>
                                </View>
                                <View style={{ marginTop: 'auto', paddingBottom: 10 }}>
                                    <Text style={styles.chatTitle}>{tripData.title}</Text>
                                    <Text style={styles.chatPreview} numberOfLines={1}>
                                        {lastChatMessage 
                                            ? (lastChatMessage.text ? lastChatMessage.text : 
                                               lastChatMessage.type === 'image' ? '📷 Image' :
                                               lastChatMessage.type === 'location' ? '📍 Location' :
                                               lastChatMessage.type === 'voice' ? '🎤 Voice' : lastChatMessage.type)
                                            : "No messages yet"}
                                    </Text>
                                </View>

                            </TouchableOpacity>
                        </View>

                        {/* Notifications Section */}
                        <View style={styles.sectionCard}>
                            <Text style={styles.notificationTitle}>Notification</Text>
                            <View style={styles.notificationListContainer}>
                                <ScrollView 
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled={true}
                                    contentContainerStyle={{ flexGrow: 1 }}
                                >
                                    {notificationsList
                                        .map((item, index, filteredList) => (
                                            <View key={item.id}>
                                                <View style={styles.notificationItem}>
                                                    <View style={styles.notificationContent}>
                                                        <Text style={styles.notifName}>
                                                            {item.name} <Text style={[styles.notifMsg, item.type === 'emergency' && { color: '#FF4B4B', fontWeight: 'bold' }]}>{item.message}</Text>
                                                        </Text>
                                                    </View>
                                                    
                                                    {item.type !== 'alert' && item.type !== 'emergency' && item.type !== 'broadcast' && (
                                                        <TouchableOpacity 
                                                            style={[styles.acceptButton, item.status === 'accepted' && { backgroundColor: '#A1A1AA' }]}
                                                            onPress={() => handleAcceptNotification(item)}
                                                            disabled={item.status === 'accepted'}
                                                        >
                                                            <Ionicons 
                                                                name={item.status === 'accepted' ? "checkmark-done-circle" : "checkmark-circle-outline"} 
                                                                size={14} 
                                                                color="#FFF" 
                                                                style={{ marginRight: 6 }} 
                                                            />
                                                            <Text style={styles.acceptButtonText}>
                                                                {item.status === 'accepted' ? 'Accepted' : 'Accept'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                                {index < filteredList.length - 1 && <View style={styles.notificationSeparator} />}
                                            </View>
                                        ))}
                                </ScrollView>
                            </View>
                        </View>



                        {/* Participants List */}
                        <View
                            style={styles.sectionCard}
                        >
                            <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => navigation.navigate('TripParticipants', { isAdmin, trip: tripData })}>
                                <Text style={styles.sectionTitle}>Participants</Text>
                                <View style={styles.searchBar}>
                                    <Ionicons name="search" size={24} color="#A1A1AA" />
                                </View>
                                <View >
                                    <Ionicons name="chevron-forward" size={20} color="#fff" />
                                </View>
                            </TouchableOpacity>

                            <View style={styles.participantsScrollContainer}>
                                <ScrollView 
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled={true}
                                >
                                    {participants.length > 0 ? (
                                        participants.map((p, idx) => (
                                            <TouchableOpacity
                                                key={idx}
                                                style={styles.participantRow}
                                                onPress={() => handleParticipantPress(p)}
                                            >
                                                <View style={[
                                                    styles.participantAvatarContainer,
                                                    p.isSpeaking && styles.speakingAvatarBorder
                                                ]}>
                                                    <Image source={{ uri: p.image }} style={styles.participantAvatar} />
                                                </View>
                                                <View style={styles.participantInfo}>
                                                    <Text style={styles.participantName}>
                                                        {p.name} {p.id === auth.currentUser?.uid ? '(You)' : ''}
                                                    </Text>
                                                    <Text style={p.isSpeaking ? styles.participantStatus : styles.participantStatusMuted}>
                                                        {p.status}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))
                                    ) : (
                                        <View style={{ padding: 20, alignItems: 'center' }}>
                                            <Text style={{ color: '#A1A1AA', fontSize: 14 }}>No participants joined yet</Text>
                                        </View>
                                    )}
                                </ScrollView>
                            </View>

                        </View>

                        {/* Quick Messages & Alert Row - Hide Quick Messages for Participants */}
                        <View style={styles.rowContainer}>
                            {(userRole === 'admin' || userRole === 'co-host' || userRole === 'manager') && (
                                <View style={[styles.sectionCard, styles.halfCard, styles.quickMsgCard]}>
                                    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                                        {sharedTemplates.length > 0 ? (
                                            sharedTemplates.map((template, index) => (
                                                <TouchableOpacity
                                                    key={template.id}
                                                    style={styles.quickMsgItem}
                                                    onPress={() => handleQuickMsgPress(template)}
                                                >
                                                    <Text style={styles.quickMsgText} numberOfLines={1}>{template.name}</Text>
                                                </TouchableOpacity>
                                            ))
                                        ) : (
                                            <Text style={[styles.quickMsgText, { opacity: 0.5, fontSize: 12 }]}>No templates. Add in Chat.</Text>
                                        )}
                                    </ScrollView>
                                </View>
                            )}


                            <TouchableOpacity
                                style={[styles.sectionCard, styles.halfCard, styles.alertCard, !isAdmin && { flex: 1 }]}
                                onPress={() => {
                                    setCountdown(10);
                                    setEmergencyModalVisible(true);
                                }}
                            >
                                <View style={styles.alertIconContainer}>
                                    <Ionicons name="information-circle-outline" size={24} color="#FDF3DC" />
                                </View>
                                <View style={styles.alertContent}>
                                    {/* <Ionicons name="chevron-forward" size={20} color="#FFF" style={{ alignSelf: 'flex-end', marginBottom: 20 }} /> */}
                                    <Text style={styles.alertTitle}>SOS Alert</Text>
                                </View>
                            </TouchableOpacity>
                        </View>

                        <View style={{ height: 150 }} />
                    </View>
                </ScrollView>

                {/* Bottom Trip Navigation (Reusable) */}
                <TripBottomTabBar activeRoute="TripOverview" tripData={tripData} />
            </SafeAreaView>

            {/* Emergency Alert Modal */}
            <Modal
                isVisible={emergencyModalVisible}
                onBackdropPress={() => setEmergencyModalVisible(false)}
                onSwipeComplete={() => setEmergencyModalVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.4}
                style={{ margin: 0, justifyContent: 'center', alignItems: 'center' }}
                animationIn="fadeIn"
                animationOut="fadeOut"
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <View
                    style={[
                        styles.emergencyContent,
                        // { transform: [{ translateY: panYEmergency }] }
                    ]}
                // {...emergencySwipe.panHandlers}
                >
                    <View style={styles.modalHandle} />
                    <Text style={styles.emergencyTitle}>Notifying Host</Text>
                    <Text style={styles.emergencySubtitle}>Emergency alert will be sent in</Text>
                    <Text style={styles.countdownText}>{countdown} <Text style={{ color: '#942F31', fontSize: responsiveFontSize(31) }}>seconds</Text></Text>

                    <GradientBorderButton
                        onPress={() => setEmergencyModalVisible(false)}
                        style={{ borderRadius: 30, width: '100%', marginTop: 10 }}
                        innerBg="transparent"
                    >
                        <Text style={{
                            color: '#FFF',
                            fontSize: responsiveFontSize(14),
                            fontFamily: Typography.sans.bold
                        }}>
                            Cancel
                        </Text>
                    </GradientBorderButton>
                </View>
            </Modal>

            <ParticipantDetailModal
                isVisible={detailVisible}
                onClose={() => setDetailVisible(false)}
                participant={selectedParticipant}
                liveLocations={liveLocations}
                isAdmin={isAdmin}
                onDelete={handleDeletePress}
                mapDarkStyle={mapDarkStyle}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isVisible={deleteConfirmVisible}
                onBackdropPress={() => setDeleteConfirmVisible(false)}
                onSwipeComplete={() => setDeleteConfirmVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.7}
                style={{ margin: 0, justifyContent: 'center', paddingHorizontal: 24 }}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <View
                    style={[
                        styles.confirmBox,
                        // { transform: [{ translateY: panYDelete }] }
                    ]}
                // {...deleteConfirmSwipe.panHandlers}
                >
                    <View style={styles.modalHandle} />
                    <Text style={styles.confirmTitle}>Are You sure you want to delete this participant</Text>

                    <View style={styles.confirmButtons}>
                        <GradientBorderButton
                            text="Cancel"
                            onPress={() => setDeleteConfirmVisible(false)}
                            style={{ flex: 1 }}
                            innerBg="#1E2124"
                        />
                        <TouchableOpacity
                            style={styles.confirmDeleteBtn}
                            onPress={confirmDelete}
                        >
                            <Text style={styles.confirmDeleteText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Trip Visibility Modal */}
            <Modal
                isVisible={visibilityModalVisible}
                onBackdropPress={() => setVisibilityModalVisible(false)}
                onSwipeComplete={() => setVisibilityModalVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.7}
                style={{ margin: 0, justifyContent: 'flex-end' }}
            >
                <View style={styles.bottomSheet}>
                    <View style={styles.handle} />
                    <Text style={styles.sheetTitle}>Trip Visibility</Text>
                    <View style={styles.divider} />

                    <TouchableOpacity
                        style={[styles.visibilityOption, liveTripData?.visibility !== 'private' && styles.visibilityOptionSelected]}
                        onPress={() => {
                            const tripId = trip?.id;
                            const orgId = trip?.orgId;
                            if (tripId && orgId) {
                                update(ref(database, `orgs/${orgId}/trips/${tripId}`), { visibility: 'public' });
                            }
                            setVisibilityModalVisible(false);
                        }}
                    >
                        <Ionicons name="earth-outline" size={24} color="#FFF" />
                        <View style={{ marginLeft: 16 }}>
                            <Text style={styles.visibilityTitle}>Public</Text>
                            <Text style={styles.visibilityDesc}>Visible to everyone in the Explore section.</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.visibilityOption, liveTripData?.visibility === 'private' && styles.visibilityOptionSelected]}
                        onPress={() => {
                            const tripId = trip?.id;
                            const orgId = trip?.orgId;
                            if (tripId && orgId) {
                                update(ref(database, `orgs/${orgId}/trips/${tripId}`), { visibility: 'private' });
                            }
                            setVisibilityModalVisible(false);
                        }}
                    >
                        <Ionicons name="lock-closed-outline" size={24} color="#FFF" />
                        <View style={{ marginLeft: 16 }}>
                            <Text style={styles.visibilityTitle}>Private (Invite Only)</Text>
                            <Text style={styles.visibilityDesc}>Only people with the link or code can join.</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Trip Delete Modal */}
            <Modal
                isVisible={deleteModalVisible}
                onBackdropPress={() => setDeleteModalVisible(false)}
                onSwipeComplete={() => setDeleteModalVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.8}
                style={{ margin: 0, justifyContent: 'center', paddingHorizontal: 24 }}
            >
                <View style={styles.confirmBox}>
                    <View style={styles.modalHandle} />
                    <Ionicons name="warning-outline" size={48} color="#942F31" style={{ marginBottom: 16 }} />
                    <Text style={styles.confirmTitle}>Delete this journey?</Text>
                    <Text style={[styles.confirmTitle, { fontSize: 14, fontFamily: Typography.sans.regular, opacity: 0.7 }]}>
                        This action cannot be undone. All participant data will be lost.
                    </Text>

                    <View style={styles.confirmButtons}>
                        <GradientBorderButton
                            text="Cancel"
                            onPress={() => setDeleteModalVisible(false)}
                            style={{ flex: 1 }}
                            innerBg="#1E2124"
                        />
                        <TouchableOpacity
                            style={styles.confirmDeleteBtn}
                            onPress={async () => {
                                const tripId = trip?.id;
                                const orgId = trip?.orgId;
                                if (tripId && orgId) {
                                    await remove(ref(database, `orgs/${orgId}/trips/${tripId}`));
                                    // Also remove from user_trips if necessary (already handled in functions usually)
                                    setDeleteModalVisible(false);
                                    navigation.navigate('Home');
                                }
                            }}
                        >
                            <Text style={styles.confirmDeleteText}>Delete Forever</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Quick Message Alert Modal */}
            <Modal
                isVisible={quickAlertVisible}
                onBackdropPress={() => setQuickAlertVisible(false)}
                onSwipeComplete={() => setQuickAlertVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.8}
                style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <View
                    style={[
                        styles.quickAlertBox,
                    ]}
                >
                    <View style={styles.modalHandle} />
                    <View style={styles.quickAlertHeader}>
                        <View style={styles.alertIconCircleSmall}>
                            <Ionicons name="information" size={20} color="#FF4B4B" />
                        </View>
                        <Text style={styles.quickAlertTitle}>Alert!</Text>
                    </View>

                    <Text style={styles.quickAlertMsg}>{alertMessage}</Text>

                    <View style={styles.confirmButtons}>
                        <GradientBorderButton
                            text="Cancel"
                            onPress={() => setQuickAlertVisible(false)}
                            style={{ flex: 1 }}
                            innerBg="#1E2124"
                        />
                        <TouchableOpacity
                            style={[styles.confirmDeleteBtn, { backgroundColor: '#B99A4A' }]}
                            onPress={() => broadcastNotification(alertMessage)}
                        >
                            <Text style={styles.confirmDeleteText}>Send All</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    backgroundImage: {
        flex: 1,
        width: width,
    },
    gradientOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 50,
    },
    headerTitle: {
        fontSize: responsiveFontSize(20),
        color: '#FFF',
        fontFamily: Typography.sans.regular,
    },
    iconButton: {
        padding: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    tripCard: {
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 20,
        height: 150,
    },
    tripCardGradient: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
    },
    tripTitle: {
        fontSize: responsiveFontSize(20),
        color: '#FFF',
        fontFamily: Typography.sans.bold,
        marginBottom: 12,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 10,
    },
    infoText: {
        color: '#F4F4F5',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
    },
    chatIconWrapper: {
        position: 'relative',
        width: 64,
        height: 64,
        marginBottom: 5
    },
    chatIconCircle: {
        width: 54,
        height: 54,
        borderRadius: 32,
        backgroundColor: '#2D3134',
        justifyContent: 'center',
        alignItems: 'center',
    },
    badge: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        backgroundColor: '#B99A4A',
        width: 18,
        height: 18,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: responsiveFontSize(10),
        fontFamily: Typography.sans.bold,
    },
    chatTitle: {
        color: '#FFFFFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.bold,
        marginBottom: 8,
    },
    chatPreview: {
        color: '#71717A',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.regular,
        lineHeight: 20,
    },
    prayerTimesContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 25,
        paddingHorizontal: 10,
    },
    prayerItem: {
        alignItems: 'center',
    },
    prayerName: {
        color: '#A1A1AA',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
        marginBottom: 4,
    },
    prayerTime: {
        color: '#A1A1AA',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.semiBold,
    },
    sectionCard: {
        backgroundColor: '#2D3134',
        borderRadius: 24,
        padding: 20,
        marginVertical: 6,
        // borderWidth: 1,
        // borderColor: 'rgba(255,255,255,0.05)',
    },
    notificationTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(22),
        fontFamily: Typography.sans.bold,
        marginBottom: 10,
    },
    notificationListContainer: {
        height: 160,
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },
    notificationContent: {
        flex: 1,
        marginRight: 10,
    },
    notifName: {
        color: '#FFF',
        fontSize: responsiveFontSize(15),
        fontFamily: Typography.sans.bold
    },
    notifMsg: {
        color: '#fff',
        fontFamily: Typography.sans.regular,
    },
    acceptButton: {
        backgroundColor: '#34C759',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        minWidth: 100,
    },
    acceptButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.bold,
    },
    notificationSeparator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    channelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        backgroundColor: '#23272A',
        padding: 10,
        borderRadius: 20,
    },
    avatarWrapper: {
        position: 'relative',
    },
    speakerAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: '#34C759',
        elevation: 14,
        shadowColor: '#34C759',
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowOpacity: 0.8,
        shadowRadius: 10
    },
    liveIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,

        backgroundColor: '#34C759',
        position: 'absolute',
        bottom: 2,
        right: 2,
        borderWidth: 2,
        borderColor: '#1E2023',
    },
    channelInfo: {
        flex: 1,
        marginLeft: 12,
    },
    channelStatus: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.regular,
    },
    activeSpeaker: {
        color: '#9BA1A6',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
    },
    controlsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
        backgroundColor: '#23272A',
        padding: 10,
        borderRadius: 20,
    },
    controlButtonOutline: {
        width: '48%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 30, // Pill shape
        borderWidth: 1,
        borderColor: '#B99A4A',
        marginBottom: 10,
    },
    controlText: {
        color: '#FFF',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.medium,
    },
    rowContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    halfCard: {
        flex: 1,
        height: 180, // Taller to fit content
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: responsiveFontSize(20),
        color: '#FFF',
        fontFamily: Typography.sans.semiBold,
        flex: 1,
    },
    searchBar: {
        width: "45%",
        height: 40,
        backgroundColor: '#3F4346',
        borderRadius: 15,
        justifyContent: 'center',
        paddingHorizontal: 10,
        marginRight: 10,
    },
    participantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    participantsScrollContainer: {
        height: 180, // Height for roughly 3 items (60px each)
    },
    participantAvatarContainer: {
        marginRight: 12,
        borderRadius: 24,
        padding: 2, // For border space
    },
    speakingAvatarBorder: {
        borderWidth: 2,
        borderColor: '#34C759',
        shadowColor: '#34C759',
        shadowOpacity: 0.5,
        shadowRadius: 5,
    },
    participantAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#ccc',
    },
    participantInfo: {
        flex: 1,
    },
    participantName: {
        fontSize: responsiveFontSize(16),
        color: '#FFF',
        fontFamily: Typography.sans.semiBold,
    },
    participantStatus: {
        fontSize: responsiveFontSize(13),
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
    },
    participantStatusMuted: {
        fontSize: responsiveFontSize(13),
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
    },
    quickMsgCard: {
        backgroundColor: '#2D3134',
        padding: 10,
        height: 160, // Fixed height to match chat card
    },
    quickMsgItem: {
        backgroundColor: '#23272A',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
    },
    quickMsgText: {
        color: '#E0E0E0',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
    },
    alertCard: {
        backgroundColor: '#2D2528', // Dark reddish tint background
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        padding: 20,
    },
    alertIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#D92D20', // Red alert color
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        alignSelf: 'flex-start',
    },
    alertContent: {
        width: '100%',
    },
    alertTitle: {
        fontSize: responsiveFontSize(18),
        color: '#FFF',
        fontFamily: Typography.sans.bold,
    },
    mapBackground: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: '#1A1E21',
    },
    mapOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    mapAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,

        borderWidth: 2,
        borderColor: '#B99A4A',
        overflow: 'hidden',
        backgroundColor: '#1E2124',
        justifyContent: 'center',
        alignItems: 'center',

        shadowColor: '#B99A4A',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 10,
    },
    mapAvatarImg: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },


    mapAvatarLiveDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#34C759',
        borderWidth: 2,
        borderColor: '#1A1E21',
    },
    // Modal Styles

    bottomSheet: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
        width: '100%',
        marginTop: 'auto', // Push to bottom
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
    modalOverlayFull: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheetTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(28),
        fontFamily: Typography.serif.regular,
        marginBottom: 16,
    },
    divider: {
        height: 0.2,
        backgroundColor: '#eeeeee',
        marginBottom: 24,
    },
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
        fontFamily: Typography.sans.bold,
        textAlign: 'center',
        marginBottom: 30,
    },
    confirmButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    confirmDeleteBtn: {
        flex: 1,
        height: 56,
        backgroundColor: '#942F31',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmDeleteText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    // Quick Alert Styles
    quickAlertOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    quickAlertBox: {
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        alignItems: 'center',
    },
    quickAlertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 10,
    },
    alertIconCircleSmall: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#FF4B4B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickAlertTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(20),
        fontFamily: Typography.sans.bold,
    },
    quickAlertMsg: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.semiBold,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 26,
    },
    quickAlertBtn: {
        width: '100%',
    },
    quickAlertGradient: {
        borderRadius: 28,
        padding: 1.5,
    },
    quickAlertInner: {
        backgroundColor: '#1E2124',
        borderRadius: 26.5,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickAlertBtnText: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.bold,
    },
    // Emergency Modal Styles
    emergencyOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    emergencyContent: {
        backgroundColor: '#23272A',
        borderRadius: 24,
        padding: 30,
        width: '100%',
        alignItems: 'center',
    },
    emergencyTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
        marginBottom: 15,
    },
    emergencySubtitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular
    },
    countdownText: {
        color: '#942F31',
        fontSize: responsiveFontSize(31),
        fontFamily: Typography.sans.bold,
        marginBottom: 10,
    },
    modalHandle: {
        width: 60,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
    visibilityOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderRadius: 16,
        backgroundColor: '#23272A',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    visibilityOptionSelected: {
        borderColor: '#B99A4A',
        backgroundColor: '#2D3134',
    },
    visibilityTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    visibilityDesc: {
        color: '#A1A1AA',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
        marginTop: 4,
    },
});

const mapDarkStyle = [
    {
        "elementType": "geometry",
        "stylers": [{ "color": "#212121" }]
    },
    {
        "elementType": "labels.icon",
        "stylers": [{ "visibility": "off" }]
    },
    {
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#757575" }]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [{ "color": "#1A1E21" }]
    },
    {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [{ "color": "#1E2124" }]
    },
    {
        "featureType": "road",
        "elementType": "geometry.fill",
        "stylers": [{ "color": "#2C2F33" }]
    },
    {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [{ "color": "#000000" }]
    }
];

export default TripOverviewScreen;
