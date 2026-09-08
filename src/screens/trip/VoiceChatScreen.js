import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ImageBackground,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Image,
    StatusBar,
    ActivityIndicator,
    Alert,
    PermissionsAndroid,
    Platform,
    Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useNavigation, useRoute } from '@react-navigation/native';
import { 
    LiveKitRoom, 
    useTracks, 
    useRoomContext,
    useParticipants,
    AudioSession,
    AndroidAudioTypePresets
} from '@livekit/react-native';
import { Track, ParticipantEvent, ConnectionQuality, setLogLevel, RoomEvent } from 'livekit-client';

import { useVoice } from '../../context/VoiceContext';

// Silence LiveKit and WebRTC logs for a cleaner console
setLogLevel('error');
import * as Network from 'expo-network';
import { database, functions, auth } from '../../config/firebase';
import { ref, onValue, off, update, get } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import SpeakerGlow from '../../components/SpeakerGlow';
import { responsiveFontSize } from '../../utils/responsive';
import { Typography } from '../../constants/Typography';
import { isStaffMember, checkPIIVisibility, getParticipantDisplayName, getParticipantDisplayPhoto } from '../../utils/visibilityHelper';

const { width } = Dimensions.get('window');

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

const VoiceChatContent = ({ 
    tripData, 
    tripId,
    orgId,
    isAdmin, 
    onDisconnect, 
    onStopChannel, 
    fetchToken, 
    loading, 
    isMuted, 
    setIsMuted, 
    isGlobalMuteActive, 
    sendMuteCommand, 
    teamMemberUids,
    staffData,
    organizerId,
    globalVisibilityConfig,
    userRole
}) => {
    const room = useRoomContext();
    const participants = useParticipants();
    const [participantMap, setParticipantMap] = useState({});
    const [speakingUids, setSpeakingUids] = useState([]);
    const [isHoldToTalkActive, setIsHoldToTalkActive] = useState(false);

    const participantIdentities = React.useMemo(() => {
        return (participants || []).map(p => p.identity).filter(Boolean).sort().join(',');
    }, [participants]);

    const staffInChatCount = React.useMemo(() => {
        if (!teamMemberUids) return 0;
        let count = 0;
        participants.forEach(participant => {
            const identity = participant.identity;
            if (identity && teamMemberUids.has(identity)) {
                count++;
            }
        });
        return count;
    }, [participants, teamMemberUids]);

    // Keep track of active speakers to sort them to the top
    useEffect(() => {
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

    const sortedParticipants = React.useMemo(() => {
        return [...participants].sort((a, b) => {
            // Rule 1: Local participant (You) always goes to the very top (first row)
            if (a.isLocal && !b.isLocal) return -1;
            if (!a.isLocal && b.isLocal) return 1;

            const aId = a.identity;
            const bId = b.identity;
            
            const aIndex = speakingUids.indexOf(aId);
            const bIndex = speakingUids.indexOf(bId);
            
            // Rule 2: Active speakers directly underneath local user
            if (aIndex !== -1 && bIndex !== -1) {
                if (aIndex !== bIndex) return aIndex - bIndex;
            }
            if (aIndex !== -1 && bIndex === -1) return -1;
            if (bIndex !== -1 && aIndex === -1) return 1;
            
            // Rule 3: The rest of the participants in a consistent, deterministic order across ALL devices
            const aName = (participantMap[aId]?.name || a.name || aId || '').trim();
            const bName = (participantMap[bId]?.name || b.name || bId || '').trim();
            const nameDiff = aName.localeCompare(bName, undefined, { sensitivity: 'base' });
            if (nameDiff !== 0) return nameDiff;


            return aName.localeCompare(bName);
        });
    }, [participants, speakingUids, participantMap]);

    useEffect(() => {
        const uids = participantIdentities.split(',').filter(Boolean);
        if (uids.length === 0 || !tripId) return;

        uids.forEach(async (uid) => {
            if (!participantMap[uid]) {
                try {
                    const profileRef = ref(database, `users/${uid}/profile`);
                    const fullNameRef = ref(database, `users/${uid}/full_name`);
                    const visibilityRef = ref(database, `users/${uid}/participant_visibility/${tripId}`);

                    const [profileSnap, nameSnap, visSnap, photoSnap] = await Promise.all([
                        get(profileRef),
                        get(fullNameRef),
                        get(visibilityRef),
                        get(ref(database, `users/${uid}/photo_url`)).catch(() => ({ val: () => null }))
                    ]);

                    const rawProfile = profileSnap.val() || {};
                    const photoUrl = photoSnap?.val();
                    const profile = {
                        ...rawProfile,
                        photoURL: rawProfile.photoURL || rawProfile.photo_url || photoUrl || rawProfile.photo || rawProfile.profile_photo || rawProfile.image
                    };
                    const fullName = nameSnap.val();
                    const visibility = visSnap.val() || {};
                    const targetRole = staffData?.[uid];
                    const isTargetStaff = isStaffMember(uid, staffData, organizerId, targetRole);
                    const isViewerStaff = isStaffMember(auth.currentUser?.uid, staffData, organizerId, userRole) || isAdmin;

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

                    setParticipantMap(prev => ({
                        ...prev,
                        [uid]: {
                            name: displayName,
                            avatar: displayImage
                        }
                    }));
                } catch (e) {
                    console.log("Fetch user profile error in VoiceChat:", e);
                }
            }
        });
    }, [participantIdentities, staffData, organizerId, globalVisibilityConfig, isAdmin, userRole, tripId]);


    const handleHoldToTalkStart = async () => {
        if (isGlobalMuteActive && !isAdmin) {
            Alert.alert("Muted by Organizer", "The organizer has globally muted the channel. You cannot unmute yourself at this time.");
            return;
        }
        setIsHoldToTalkActive(true);
        setIsMuted(false);
    };

    const handleHoldToTalkEnd = async () => {
        setIsHoldToTalkActive(false);
        setIsMuted(true);
    };

    const handleToggleMute = async () => {
        try {
            const nextState = !isMuted;
            
            // If the room is globally muted by the admin, participants cannot unmute themselves
            if (!nextState && isGlobalMuteActive && !isAdmin) {
                Alert.alert("Muted by Organizer", "The organizer has globally muted the channel. You cannot unmute yourself at this time.");
                return;
            }

            setIsMuted(nextState);
            
            if (isAdmin) {
                const orgId = tripData.orgId || tripData.org_id;
                const tripId = tripData.id || tripData.tripId;
                if (orgId && tripId) {
                    await update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                        adminMuted: nextState
                    });
                }
            }
        } catch (error) {
            console.log("Toggle mute error:", error);
            Alert.alert("Action Failed", "Could not update mute state. Please check your connection.");
        }
    };

    const handleParticipantMicPress = async (participant) => {
        try {
            if (participant.isLocal) {
                await handleToggleMute();
            } else if (isAdmin) {
                // Admin can mute/unmute others
                const shouldMute = participant.isMicrophoneEnabled;
                await sendMuteCommand(participant.identity, shouldMute);
            } else {
                // Participant clicked on another participant's mic icon
                Alert.alert("Action Not Allowed", "Only journey organizers can mute other participants.");
            }
        } catch (error) {
            console.log("Participant mic press error:", error);
        }
    };

    const handleMuteAll = async () => {
        const tripId = tripData.id || tripData.tripId;
        const orgId = tripData.orgId || tripData.org_id;
        if (!orgId || !tripId) return;

        const nextState = !isGlobalMuteActive;
        try {
            await update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                isAllMuted: nextState,
                lastUpdatedBy: auth.currentUser?.uid || null
            });
            // State will be updated by the listener
        } catch (error) {
            Alert.alert("Action Failed", "Could not update room state.");
        }
    };

    const SignalBars = ({ quality, networkType = 'cellular' }) => {
        // connectionQuality in LiveKit: Excellent (2), Good (1), Poor (0)
        // Some versions use: Excellent (3), Good (2), Poor (1) - we'll handle both
        const isGood = quality === 2 || quality === ConnectionQuality.Excellent;
        const isFair = quality === 1 || quality === ConnectionQuality.Good;
        const isPoor = quality === 0 || quality === ConnectionQuality.Poor;

        const color = isGood ? '#34C759' : isFair ? '#FFC107' : '#FF4B4B';
        const iconName = networkType === 'wifi' ? 'wifi' : 'cellular';
        
        return (
            <View style={styles.signalBars}>
                {/* <Ionicons name={iconName} size={12} color={color} style={{ marginRight: 2 }} /> */}
                <View style={[styles.signalBar, { height: 6, backgroundColor: color }]} />
                <View style={[styles.signalBar, { height: 10, backgroundColor: (isGood || isFair) ? color : 'rgba(255,255,255,0.1)' }]} />
                <View style={[styles.signalBar, { height: 14, backgroundColor: isGood ? color : 'rgba(255,255,255,0.1)' }]} />
            </View>
        );
    };



    // Detect and sync network type (Safe check for native module)
    useEffect(() => {
        const updateNetworkType = async () => {
            if (!room?.localParticipant) return;
            try {
                // Check if the native module is actually linked/available
                if (Network && typeof Network.getNetworkStateAsync === 'function') {
                    const state = await Network.getNetworkStateAsync();
                    const type = state.type === Network.NetworkType.WIFI ? 'wifi' : 'cellular';
                    
                    const currentAttributes = room.localParticipant.attributes || {};
                    if (currentAttributes.networkType !== type) {
                        if (typeof room.localParticipant.setAttributes === 'function') {
                            room.localParticipant.setAttributes({ ...currentAttributes, networkType: type });
                        }
                    }
                }
            } catch (e) {
                // Silently fail if native module is missing (common before a rebuild)
                // console.log("Network detection skipped: Native module not found yet.");
            }
        };

        updateNetworkType();
        const interval = setInterval(updateNetworkType, 15000);
        return () => clearInterval(interval);
    }, [room?.localParticipant]);

    const navigation = useNavigation();

    return (
        <View style={styles.container}>
            <View style={styles.topImageContainer}>
                <Image
                    source={require('../../../assets/VCIMG.png')}
                    style={styles.topImage}
                    resizeMode="cover"
                />
            </View>

            <SafeAreaView style={{ flex: 1, marginTop: 20 }}>
                <View style={[styles.header, { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 0 }]}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Voice Chat</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={[styles.topSection, { marginTop: 40 }]}>
                    <View style={styles.controlsGrid}>
                        {isAdmin ? (
                            <>
                                <View style={styles.controlRow}>
                                    <TouchableOpacity
                                        onPress={handleToggleMute}
                                        style={[
                                            styles.controlButtonOutline,
                                            { flex: 1 },
                                            !(isMuted || false) && { backgroundColor: '#23272A', borderColor: '#B99A4A' }
                                        ]}
                                    >
                                        <View style={{ marginRight: 8 }}>
                                            {/* {isMuted ? (
                                                <MicMutedIcon color="#FFF" size={20} />
                                            ) : (
                                                <MicUnmutedIcon color="#D66A77" size={20} />
                                            )} */}
                                        </View>
                                        <Text style={[styles.controlText, !isMuted && { color: '#FFFFFF' }]}>
                                            {isMuted ? 'Unmute Myself' : 'Mute Myself'}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={handleMuteAll}
                                        style={[
                                            styles.controlButtonOutline,
                                            { flex: 1 },
                                            isGlobalMuteActive && { backgroundColor: '#B99A4A', borderColor: '#B99A4A' }
                                        ]}
                                    >
                                        <Text style={styles.controlText}>
                                            {isGlobalMuteActive ? 'Unmute All' : 'Mute All'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity
                                    style={[
                                        styles.controlButtonOutline,
                                        { width: '100%', borderStyle: 'solid', backgroundColor: '#942F31', borderColor: '#942F31' }
                                    ]}
                                    onPress={staffInChatCount >= 2 ? onDisconnect : onStopChannel}
                                >
                                    <Ionicons name={staffInChatCount >= 2 ? "exit-outline" : "stop-circle-outline"} size={20} color="#FFF" style={{ marginRight: 8 }} />
                                    <Text style={[styles.controlText, { color: '#FFF' }]}>
                                        {staffInChatCount >= 2 ? 'Leave Channel' : 'Stop Voice Chat'}
                                    </Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <View style={styles.controlRow}>
                                    <TouchableOpacity
                                        onPressIn={handleHoldToTalkStart}
                                        onPressOut={handleHoldToTalkEnd}
                                        style={[
                                            styles.controlButtonOutline,
                                            { flex: 1 },
                                            isHoldToTalkActive && { backgroundColor: '#B99A4A', borderColor: '#B99A4A' },
                                            isGlobalMuteActive && { opacity: 0.6 }
                                        ]}
                                    >
                                        <Text style={[styles.controlText, isHoldToTalkActive && { color: '#FFFFFF' }]}>
                                            {isGlobalMuteActive ? 'Muted by Admin' : 'Hold to Talk'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity
                                    onPress={onDisconnect}
                                    style={[
                                        styles.controlButtonOutline,
                                        {
                                            width: '100%',
                                            borderStyle: 'solid',
                                            backgroundColor: '#942F31',
                                            borderColor: '#942F31',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }
                                    ]}
                                >
                                    <Ionicons name="refresh-outline" size={20} color="#FFF" style={{ marginRight: 8, transform: [{ scaleX: -1 }] }} />
                                    <Text style={[styles.controlText, { color: '#fff' }]}>Channel Leave</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>

                    <View style={styles.statusRow}>
                        <View style={styles.networkStatus}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={[styles.statusDot, { backgroundColor: '#34C759' }]} />
                                <Text style={[styles.statusText, { color: '#34C759' }]}>Live Connected</Text>
                            </View>
                            <Text style={styles.sectionTitle}>Participants</Text>
                        </View>

                        <View style={styles.avatarScrollContainer}>
                            <ScrollView 
                                horizontal 
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.headerAvatarsContent}
                            >
                                {sortedParticipants
                                    .filter(p => teamMemberUids.has(p.identity))
                                    .map((participant) => {
                                        const pData = participantMap[participant.identity];
                                        if (!pData) return null;
                                        const isSpeaking = speakingUids.includes(participant.identity);
                                        return (
                                            <View key={participant.identity} style={styles.smallAvatarWrapper}>
                                                <Image 
                                                    source={{ uri: pData.avatar }} 
                                                    style={[
                                                        styles.headerSmallAvatar,
                                                        { borderColor: isSpeaking ? '#34C759' : 'transparent' }
                                                    ]} 
                                                />
                                            </View>
                                        );
                                    })}
                            </ScrollView>
                        </View>
                    </View>
                </View>

                <ScrollView
                    style={styles.listSectionScroll}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.listSection}>
                        {sortedParticipants.map((participant, index) => {
                            const pData = participantMap[participant.identity] || { 
                                name: participant.name || 'User', 
                                avatar: 'https://randomuser.me/api/portraits/lego/1.jpg' 
                            };
                            const isSpeaking = speakingUids.includes(participant.identity);
                            const isLocal = participant.isLocal;

                            return (
                                <View key={participant.identity}>
                                    <View style={styles.participantRow}>
                                        <View style={styles.avatarContainer}>
                                            {isSpeaking && <SpeakerGlow />}
                                            <Image 
                                                source={{ uri: pData.avatar }} 
                                                style={[
                                                    styles.avatar,
                                                    { borderColor: isSpeaking ? '#34C759' : 'transparent' }
                                                ]} 
                                            />
                                        </View>

                                        <View style={styles.participantInfo}>
                                            <View style={styles.nameRow}>
                                                <Text style={styles.nameText}>{pData.name} {isLocal ? '(You)' : ''}</Text>
                                                <View style={styles.inlineStats}>
                                                    <SignalBars 
                                                        quality={participant.connectionQuality} 
                                                        networkType={participant.attributes?.networkType || 'cellular'}
                                                    />
                                                </View>
                                            </View>
                                            <Text style={styles.statusSubText}>{isSpeaking ? 'Speaking' : (participant.isMicrophoneEnabled ? 'Active' : 'Muted')}</Text>
                                        </View>

                                        <TouchableOpacity 
                                            style={styles.rightActions}
                                            onPress={() => handleParticipantMicPress(participant)}
                                        >
                                            {participant.isMicrophoneEnabled ? (
                                                <View style={styles.micCircle}>
                                                    <MicUnmutedIcon color="#FFF" size={20} />
                                                </View>
                                            ) : (
                                                <MicMutedIcon color="#D66A77" size={25} />
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                    {index < sortedParticipants.length - 1 && <View style={styles.rowSeparator} />}
                                </View>
                            );
                        })}
                        <View style={{ height: 100 }} />
                    </View>
                </ScrollView>

                <TripBottomTabBar activeRoute="VoiceChat" tripData={tripData} />
            </SafeAreaView>
        </View>
    );
};

const VoiceChatScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    let { trip: passedTrip, invitationCode: directCode, isAdmin: passedIsAdmin, userRole } = route.params || {};
    if (typeof passedIsAdmin === 'string') {
        passedIsAdmin = passedIsAdmin === 'true';
    }
    
    // Core state and trip data
    const tripData = passedTrip || { image: require('../../../assets/Makkah.png') };
    const tripId = route.params?.tripId || tripData.id || tripData.tripId;
    const orgId = route.params?.orgId || tripData.orgId || tripData.org_id;
    const invitationCode = directCode || tripData.invitationCode;
    const isAdmin = passedIsAdmin !== undefined ? passedIsAdmin : (passedTrip?.isAdmin !== undefined ? passedTrip.isAdmin : !invitationCode);
    const { autoStart } = route.params || {};

    const { 
        isConnected, 
        isChannelActive, 
        isGlobalMuteActive, 
        isMuted, 
        setIsMuted,
        loading,
        connect,
        disconnect,
        stopChannel,
        activeTripId,
        setActiveTrip,
        sendMuteCommand
    } = useVoice();

    useEffect(() => {
        if (tripId && orgId) {
            setActiveTrip(tripId, orgId);
        }
    }, [tripId, orgId]);

    const [isAdminState, setIsAdminState] = useState(isAdmin);
    const hasAutoStarted = useRef(false);
    const [tripParticipants, setTripParticipants] = useState([]);
    const [teamMemberUids, setTeamMemberUids] = useState(new Set());
    const [staffData, setStaffData] = useState({});
    const [participantUids, setParticipantUids] = useState([]);
    const [activeSpeaker, setActiveSpeaker] = useState(null);
    const [globalVisibilityConfig, setGlobalVisibilityConfig] = useState({});
    const [organizerId, setOrganizerId] = useState(null);

    useEffect(() => {
        if (!tripId || !orgId) return;

        // Check if the trip has expired and sync visibility config & organizer
        const tripRef = ref(database, `orgs/${orgId}/trips/${tripId}`);
        const unsubTrip = onValue(tripRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val() || {};
                setOrganizerId(data.organizer_id || null);
                if (data.visibility_config) {
                    setGlobalVisibilityConfig(data.visibility_config);
                }
                if (data.endDate) {
                    const endTime = typeof data.endDate === 'number'
                        ? data.endDate
                        : new Date(data.endDate).getTime();
                    if (Date.now() > endTime) {
                        Alert.alert("Trip Expired", "Voice chat is not available for this trip as it has expired.", [
                            { text: "OK", onPress: () => navigation.goBack() }
                        ]);
                    }
                }
            }
        });

        // Anchor current_trip in the DB so the Firebase rule
        // (trips_orgs/${current_trip} == $orgId) passes for participants
        // when they try to read orgs/${orgId}/staff
        if (auth.currentUser) {
            update(ref(database, `users/${auth.currentUser.uid}`), {
                current_trip: tripId
            }).catch(() => {});
        }

        let unsubscribeStaff = null;
        let active = true;

        const setupListeners = async () => {
            if (auth.currentUser) {
                try {
                    await update(ref(database, `users/${auth.currentUser.uid}`), {
                        current_trip: tripId
                    });
                } catch (e) {
                    console.log("Failed to update current_trip:", e);
                }
            }

            if (!active) return;

            const staffRef = ref(database, `orgs/${orgId}/staff`);
            unsubscribeStaff = onValue(staffRef, (snapshot) => {
                setStaffData(snapshot.val() || {});
            }, (err) => {
                console.log("Staff real-time subscription error:", err);
            });
        };

        setupListeners();

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

        return () => {
            active = false;
            unsubTrip();
            if (unsubscribeStaff) unsubscribeStaff();
            unsubscribeParticipants();
        };
    }, [tripId, orgId]);

    useEffect(() => {
        if (!tripId || !orgId) return;

        const staffUids = Object.keys(staffData).filter(uid => {
            const role = staffData[uid];
            return isStaffMember(uid, staffData, organizerId, role);
        });

        // Store team member UIDs for horizontal scroll filtering
        setTeamMemberUids(new Set(staffUids));

        // Combine normal participants and staff/admins
        const combinedUids = Array.from(new Set([...participantUids, ...staffUids]));

        if (combinedUids.length === 0) {
            setTripParticipants([]);
            return;
        }

        // Fetch profiles for these combined UIDs
        const promises = combinedUids.map(async (uid) => {
            try {
                const profileRef = ref(database, `users/${uid}/profile`);
                const fullNameRef = ref(database, `users/${uid}/full_name`);
                const visibilityRef = ref(database, `users/${uid}/participant_visibility/${tripId}`);

                const [profileSnap, nameSnap, visSnap, photoSnap] = await Promise.all([
                    get(profileRef),
                    get(fullNameRef),
                    get(visibilityRef),
                    get(ref(database, `users/${uid}/photo_url`)).catch(() => ({ val: () => null }))
                ]);

                const rawProfile = profileSnap.val() || {};
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

                return {
                    uid,
                    avatar: displayImage,
                    name: displayName
                };
            } catch (e) {
                console.log("Fetch participant profile error:", e);
            }
            return null;
        });

        Promise.all(promises).then((results) => {
            const validParticipants = results.filter(p => p !== null);
            setTripParticipants(validParticipants);
        });
    }, [staffData, participantUids, tripId, orgId, organizerId, globalVisibilityConfig, isAdminState, userRole]);

    useEffect(() => {
        if (!tripId || !orgId) return;

        // Listen to activeSpeaker in RTDB
        const speakerRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel/activeSpeaker`);
        const unsub = onValue(speakerRef, (snapshot) => {
            if (snapshot.exists()) {
                const speakerData = snapshot.val();
                if (speakerData && speakerData.name) {
                    setActiveSpeaker(speakerData);
                } else {
                    setActiveSpeaker(null);
                }
            } else {
                setActiveSpeaker(null);
            }
        });

        return () => unsub();
    }, [tripId, orgId]);

    // Update local admin state if prop or staff data changes
    useEffect(() => {
        if (passedIsAdmin !== undefined) {
            setIsAdminState(passedIsAdmin);
        } else if (auth.currentUser && staffData[auth.currentUser.uid]) {
            const role = staffData[auth.currentUser.uid];
            setIsAdminState(isStaffMember(auth.currentUser.uid, staffData, organizerId, role));
        }
    }, [passedIsAdmin, staffData, organizerId]);

    // Handle auto-start trigger if routed with autoStart
    useEffect(() => {
        const canAutoStart = (isAdminState || isAdmin || isChannelActive) && tripId && orgId;
        if (autoStart && !isConnected && !hasAutoStarted.current && canAutoStart) {
            hasAutoStarted.current = true;
            handleConnect(isAdminState !== undefined ? isAdminState : isAdmin);
        }
    }, [autoStart, isConnected, isChannelActive, isAdminState, isAdmin, tripId, orgId]);

    // Auto-disconnect if channel is stopped while connected
    useEffect(() => {
        if (isConnected && !isChannelActive && !isAdminState && activeTripId === tripId) {
            Alert.alert("Voice Channel Ended", "The organizer has ended the voice channel.");
            disconnect();
        }
    }, [isChannelActive, isConnected, isAdminState, activeTripId, tripId]);

    const handleConnect = (overrideAdmin) => {
        const roleToUse = overrideAdmin !== undefined ? overrideAdmin : (isAdminState || isAdmin);
        connect(tripId, orgId, roleToUse);
    };

    if (isConnected && activeTripId === tripId) {
        return (
            <VoiceChatContent 
                tripData={tripData} 
                tripId={tripId}
                orgId={orgId}
                isAdmin={isAdminState} 
                onDisconnect={disconnect}
                onStopChannel={stopChannel}
                fetchToken={handleConnect}
                loading={loading}
                isMuted={isMuted}
                setIsMuted={setIsMuted}
                isGlobalMuteActive={isGlobalMuteActive}
                sendMuteCommand={sendMuteCommand}
                teamMemberUids={teamMemberUids}
                staffData={staffData}
                organizerId={organizerId}
                globalVisibilityConfig={globalVisibilityConfig}
                userRole={userRole}
            />
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <View style={styles.topImageContainer}>
                <Image
                    source={require('../../../assets/VCIMG.png')}
                    style={styles.topImage}
                    resizeMode="cover"
                />
            </View>

            <SafeAreaView style={{ flex: 1, marginTop: 20 }}>
                    <View style={[styles.header, { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 0 }]}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                            <Ionicons name="arrow-back" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Voice Chat</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <View style={[styles.topSection, { marginTop: 40 }]}>
                        <View style={styles.controlsGrid}>
                            {isAdmin ? (
                                <>
                                    {isChannelActive && (
                                        <View style={styles.controlRow}>
                                            <View style={[styles.controlButtonOutline, { flex: 1, opacity: 0.5 }]}>
                                                <Text style={styles.controlText}> Mute Myself</Text>
                                            </View>
                                            <View style={[styles.controlButtonOutline, { flex: 1, opacity: 0.5 }]}>
                                                <Text style={styles.controlText}> Mute All</Text>
                                            </View>
                                        </View>
                                    )}
                                    <TouchableOpacity
                                        style={[
                                            styles.controlButtonOutline,
                                            { width: '100%', borderStyle: 'solid', backgroundColor: '#B99A4A', borderColor: '#B99A4A' }
                                        ]}
                                        onPress={() => handleConnect(true)}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                                <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                                                <Text style={[styles.controlText, { color: '#FFF' }]}>
                                                    Starting Channel...
                                                </Text>
                                            </View>
                                        ) : isChannelActive === null ? (
                                            <ActivityIndicator color="#FFF" size="small" />
                                        ) : (
                                            <>
                                                <Ionicons
                                                    name={isChannelActive ? "enter-outline" : "play-circle-outline"}
                                                    size={20}
                                                    color="#FFF"
                                                    style={{ marginRight: 8 }}
                                                />
                                                <Text style={[styles.controlText, { color: '#FFF' }]}>
                                                    {isChannelActive ? 'Channel Join' : 'Channel Start'}
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <TouchableOpacity
                                    onPress={() => handleConnect(false)}
                                    style={[
                                        styles.controlButtonOutline,
                                        {
                                            width: '100%',
                                            borderColor: isChannelActive ? '#B99A4A' : '#3F4346',
                                            backgroundColor: isChannelActive ? '#B99A4A' : '#23272A',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }
                                    ]}
                                    disabled={loading || !isChannelActive}
                                >
                                    {loading ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                            <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                                            <Text style={[styles.controlText, { color: '#FFF' }]}>
                                                Connecting...
                                            </Text>
                                        </View>
                                    ) : isChannelActive === null ? (
                                        <ActivityIndicator color="#FFF" size="small" />
                                    ) : (
                                        <>
                                            <Ionicons
                                                name={isChannelActive ? "enter-outline" : "play-circle-outline"}
                                                size={24}
                                                color="#FFF"
                                                style={{ marginRight: 8 }}
                                            />
                                            <Text style={[styles.controlText, { color: '#fff', opacity: isChannelActive ? 1 : 0.5 }]}>
                                                {isChannelActive ? 'Channel Join' : 'Channel Stopped'}
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}

                            
                        </View>

                        <View style={styles.statusRow}>
                            <View style={styles.networkStatus}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={[styles.statusDot, { backgroundColor: '#34C759' }]} />
                                    <Text style={[styles.statusText, { color: '#34C759' }]}>Network Stable</Text>
                                </View>
                                <Text style={styles.sectionTitle}>Participants</Text>
                            </View>

                            <View style={styles.avatarScrollContainer}>
                                <ScrollView 
                                    horizontal 
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.headerAvatarsContent}
                                >
                                    {tripParticipants
                                        .filter((p) => teamMemberUids.has(p.uid))
                                        .map((p) => {
                                            const isSpeaking = activeSpeaker && activeSpeaker.uid === p.uid;
                                            return (
                                                <View key={p.uid} style={styles.smallAvatarWrapper}>
                                                    <Image 
                                                        source={{ uri: p.avatar }} 
                                                        style={[
                                                            styles.headerSmallAvatar,
                                                            { borderColor: isSpeaking ? '#34C759' : 'transparent' }
                                                        ]} 
                                                    />
                                                </View>
                                            );
                                        })
                                    }
                                    {tripParticipants.filter((p) => teamMemberUids.has(p.uid)).length === 0 && (
                                        <Text style={{ color: '#888', fontSize: 12 }}>No team members yet</Text>
                                    )}
                                </ScrollView>
                            </View>
                        </View>
                    </View>

                    <ScrollView
                        style={styles.listSectionScroll}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.listSection}>
                            <Text style={{ color: '#888', textAlign: 'center', marginTop: 50 }}>
                                Join Channel to view live participants
                            </Text>
                        </View>
                    </ScrollView>

                    <TripBottomTabBar activeRoute="VoiceChat" tripData={tripData} />
                </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1E21',
    },
    topImageContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 310,
    },
    topImage: {
        width: '100%',
        height: '100%',
    },
    backgroundImage: {
        flex: 1,
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
        paddingBottom: 5,
    },
    headerTitle: {
        fontSize: responsiveFontSize(20),
        color: '#FFF',
        fontFamily: 'IBMPlexSans'
    },
    iconButton: {
        padding: 5,
    },
    topSection: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 5,
    },
    listSectionScroll: {
        flex: 1,
    },
    listContent: {
        flexGrow: 1,
    },
    listSection: {
        backgroundColor: '#1A1E21',
        paddingHorizontal: 20,
        paddingTop: 20,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        minHeight: '100%',
    },
    controlsGrid: {
        marginTop: 20,
        marginBottom: 20,
    },
    controlRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 15,
        marginBottom: 10,
        marginTop: 15,
    },
    controlButtonOutline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: '#B99A4A',
        backgroundColor: '#23272A',
    },
    controlText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontWeight: 'bold',
        fontFamily: Typography.sans.bold,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
    },
    networkStatus: {
        alignItems: 'flex-start',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    statusText: {
        fontSize: responsiveFontSize(14),
        fontWeight: '500',
    },
    headerAvatars: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    smallAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#1A1E21',
    },
    sectionTitle: {
        fontSize: responsiveFontSize(28),
        color: '#FFF',
        fontFamily: 'CormorantGaramond',
        marginTop: 5,
    },
    avatarScrollContainer: {
        backgroundColor: '#23272A',
        borderRadius: 25,
        paddingHorizontal: 10,
        height: 46,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        maxWidth: 140,
    },
    headerAvatarsContent: {
        alignItems: 'center',
        flexDirection: 'row',
    },
    smallAvatarWrapper: {
        marginHorizontal: 4,
        position: 'relative',
    },
    headerSmallAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    smallSpeakingDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#34C759',
        borderWidth: 1,
        borderColor: '#1A1E21',
    },
    participantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        marginBottom: 10,
    },
    avatarContainer: {
        width: 54,
        height: 54,
        borderRadius: 27,
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    glowCircle: {
        position: 'absolute',
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#34C759',
        zIndex: -1,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    participantInfo: {
        flex: 1,
    },
    nameText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
        marginBottom: 2,
        letterSpacing: 0.2
    },
    statusSubText: {
        color: '#9BA1A6',
        fontFamily: Typography.sans.regular,
        fontSize: responsiveFontSize(13),
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
    },
    micCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#34C759',
        justifyContent: 'center',
        alignItems: 'center',
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    inlineStats: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    miniDot: {
        width: 7,
        height: 7,
        borderRadius: 3,
    },
    signalBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
    },
    signalBar: {
        width: 3,
        borderRadius: 1,
    },
    rowSeparator: {
        height: 0.2,
        backgroundColor: '#34C759',
        marginVertical: 5,
        opacity: 0.5,
    },
});

export default VoiceChatScreen;
