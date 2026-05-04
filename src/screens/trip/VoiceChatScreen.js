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
import { Audio } from 'expo-av';
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
    AudioSession,
    AndroidAudioTypePresets,
    useIOSAudioManagement
} from '@livekit/react-native';
import { Track, ParticipantEvent, ConnectionQuality, setLogLevel } from 'livekit-client';

// Silence LiveKit and WebRTC logs for a cleaner console
setLogLevel('error');
import * as Network from 'expo-network';
import { database, functions, auth } from '../../config/firebase';
import { ref, onValue, off, update } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import { responsiveFontSize } from '../../utils/responsive';
import { Typography } from '../../constants/Typography';

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

const VoiceChatContent = ({ tripData, isAdmin, onDisconnect, fetchToken, loading, isMuted, setIsMuted, isGlobalMuteActive }) => {
    const room = useRoomContext();
    // Include local track so users can see their own signal bars (helps debugging)
    const tracks = useTracks([Track.Source.Microphone], { onlyRemote: false });
    const [participantMap, setParticipantMap] = useState({});

    // iOS specific audio management (v2)
    useIOSAudioManagement(room);

    // Sync local mute state with hardware
    useEffect(() => {
        if (room?.localParticipant) {
            room.localParticipant.setMicrophoneEnabled(!isMuted);
        }
    }, [isMuted, room]);



    // Fetch User Profiles for participants
    useEffect(() => {
        tracks.forEach(async (trackRef) => {
            const uid = trackRef.participant.identity;
            if (uid && !participantMap[uid]) {
                const userRef = ref(database, `users/${uid}`);
                onValue(userRef, (snap) => {
                    const userData = snap.val() || {};
                    const profile = userData.profile || {};
                    
                    let displayName = 'User';
                    if (profile.firstName || profile.lastName) {
                        displayName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
                    } else if (userData.full_name) {
                        displayName = userData.full_name;
                    } else {
                        displayName = 'Traveler';
                    }

                    const displayImage = profile.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName[0] || 'U')}&background=B99A4A&color=fff`;

                    setParticipantMap(prev => ({
                        ...prev,
                        [uid]: {
                            name: displayName,
                            avatar: displayImage
                        }
                    }));
                }, { onlyOnce: true });
            }
        });
    }, [tracks]);

    // Report active speaker to Firebase
    useEffect(() => {
        if (!room?.localParticipant || !auth.currentUser) return;

        const onSpeakingChanged = (speaking) => {
            if (speaking) {
                const orgId = tripData.orgId || tripData.org_id;
                const tripId = tripData.id || tripData.tripId;
                const myUid = auth.currentUser.uid;
                const myInfo = participantMap[myUid];
                
                if (orgId && tripId && myInfo) {
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                        activeSpeaker: {
                            name: myInfo.name,
                            avatar: myInfo.avatar,
                            uid: myUid
                        }
                    });
                }
            }
        };

        room.localParticipant.on(ParticipantEvent.IsSpeakingChanged, onSpeakingChanged);
        return () => {
            room.localParticipant.off(ParticipantEvent.IsSpeakingChanged, onSpeakingChanged);
        };
    }, [room?.localParticipant, participantMap, tripData]);

    const handleToggleMute = async () => {
        const nextState = !isMuted;
        setIsMuted(nextState);
        
        if (isAdmin) {
            const orgId = tripData.orgId || tripData.org_id;
            const tripId = tripData.id || tripData.tripId;
            if (orgId && tripId) {
                update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                    adminMuted: nextState
                });
            }
        }
    };

    const handleMuteAll = async () => {
        const tripId = tripData.id || tripData.tripId;
        const orgId = tripData.orgId || tripData.org_id;
        if (!orgId || !tripId) return;

        const nextState = !isGlobalMuteActive;
        try {
            await update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                isAllMuted: nextState
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

    const SpeakerGlow = () => {
        const pulseAnim = useRef(new Animated.Value(1)).current;
        const opacityAnim = useRef(new Animated.Value(0.6)).current;

        useEffect(() => {
            Animated.loop(
                Animated.parallel([
                    Animated.sequence([
                        Animated.timing(pulseAnim, {
                            toValue: 1.4,
                            duration: 1000,
                            useNativeDriver: true,
                        }),
                        Animated.timing(pulseAnim, {
                            toValue: 1,
                            duration: 1000,
                            useNativeDriver: true,
                        })
                    ]),
                    Animated.sequence([
                        Animated.timing(opacityAnim, {
                            toValue: 0.2,
                            duration: 1000,
                            useNativeDriver: true,
                        }),
                        Animated.timing(opacityAnim, {
                            toValue: 0.6,
                            duration: 1000,
                            useNativeDriver: true,
                        })
                    ])
                ])
            ).start();
        }, []);

        return (
            <Animated.View 
                style={[
                    styles.glowCircle, 
                    { 
                        transform: [{ scale: pulseAnim }],
                        opacity: opacityAnim
                    }
                ]} 
            />
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
        <ImageBackground
            source={typeof tripData.image === 'string' ? { uri: tripData.image } : tripData.image}
            style={styles.backgroundImage}
            resizeMode="cover"
        >
            <LinearGradient
                colors={['rgba(0,0,0,0.6)', '#1A1E21']}
                style={styles.gradientOverlay}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.4 }}
            />

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
                                            !(isMuted || false) && { backgroundColor: '#2D2528', borderColor: '#2D2528' }
                                        ]}
                                    >
                                        <View style={{ marginRight: 8 }}>
                                            {/* {isMuted ? (
                                                <MicMutedIcon color="#FFF" size={20} />
                                            ) : (
                                                <MicUnmutedIcon color="#D66A77" size={20} />
                                            )} */}
                                        </View>
                                        <Text style={[styles.controlText, !isMuted && { color: '#D66A77' }]}>
                                            {isMuted ? 'Unmute Myself' : 'Mute Myself'}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={handleMuteAll}
                                        style={[
                                            styles.controlButtonOutline,
                                            { flex: 1 },
                                            isGlobalMuteActive && { backgroundColor: '#2D2528', borderColor: '#2D2528' }
                                        ]}
                                    >
                                        {/* <View style={{ marginRight: 8 }}>
                                            {!isGlobalMuteActive ? (
                                                <MicMutedIcon color="#FFF" size={20} />
                                            ) : (
                                                <MicUnmutedIcon color="#D66A77" size={20} />
                                            )}
                                        </View> */}
                                        <Text style={[styles.controlText, isGlobalMuteActive && { color: '#D66A77' }]}>
                                            {isGlobalMuteActive ? 'Unmute All' : 'Mute All'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity
                                    style={[
                                        styles.controlButtonOutline,
                                        { width: '100%', borderStyle: 'solid', backgroundColor: '#942F31', borderColor: '#942F31' }
                                    ]}
                                    onPress={onDisconnect}
                                >
                                    <Ionicons name="stop-circle-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                                    <Text style={[styles.controlText, { color: '#FFF' }]}>
                                        Stop Channel
                                    </Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <View style={styles.controlRow}>
                                <TouchableOpacity
                                    onPress={() => !(isGlobalMuteActive || false) && setIsMuted(!(isMuted || false))}
                                    style={[
                                        styles.controlButtonOutline,
                                        { flex: 1, opacity: (isGlobalMuteActive || false) ? 0.6 : 1 },
                                        !(isMuted || false) && { backgroundColor: '#2D2528', borderColor: '#2D2528' }
                                    ]}
                                    disabled={(isGlobalMuteActive || false)}
                                >
                                    <View style={{ marginRight: 8 }}>
                                        {/* {(isMuted || false) ? (
                                            <MicMutedIcon color="#FFF" size={20} />
                                        ) : (
                                            <MicUnmutedIcon color="#D66A77" size={20} />
                                        )} */}
                                    </View>
                                    <Text style={[styles.controlText, !isMuted && { color: '#D66A77' }]}>
                                        {isGlobalMuteActive ? 'Muted by Admin' : (isMuted ? 'UnMute Myself' : 'Mute Myself')}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={onDisconnect}
                                    style={[
                                        styles.controlButtonOutline,
                                        {
                                            borderColor: '#942F31',
                                            backgroundColor: '#942F31',
                                            flex: 1
                                        }
                                    ]}
                                >
                                    <Text style={[styles.controlText, { color: '#fff' }]}>Channel Leave</Text>
                                </TouchableOpacity>
                            </View>
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
                    </View>
                </View>

                <ScrollView
                    style={styles.listSectionScroll}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.listSection}>
                        {tracks.map((trackRef, index) => {
                            const pData = participantMap[trackRef.participant.identity] || { 
                                name: trackRef.participant.name || 'User', 
                                avatar: 'https://randomuser.me/api/portraits/lego/1.jpg' 
                            };
                            const isSpeaking = trackRef.participant.isSpeaking;
                            const isLocal = trackRef.participant.isLocal;

                            return (
                                <View key={trackRef.participant.identity}>
                                    <View style={styles.participantRow}>
                                        <View style={styles.avatarContainer}>
                                            {isSpeaking && <SpeakerGlow />}
                                            <Image source={{ uri: pData.avatar }} style={styles.avatar} />
                                        </View>

                                        <View style={styles.participantInfo}>
                                            <View style={styles.nameRow}>
                                                <Text style={styles.nameText}>{pData.name} {isLocal ? '(You)' : ''}</Text>
                                                <View style={styles.inlineStats}>
                                                    <SignalBars 
                                                        quality={trackRef.participant.connectionQuality} 
                                                        networkType={trackRef.participant.attributes?.networkType || 'cellular'}
                                                    />
                                                </View>
                                            </View>
                                            <Text style={styles.statusSubText}>{isSpeaking ? 'Speaking' : (trackRef.participant.isMicrophoneEnabled ? 'Active' : 'Muted')}</Text>
                                        </View>

                                        <View style={styles.rightActions}>
                                            {isSpeaking ? (
                                                <View style={styles.micCircle}>
                                                    <MicUnmutedIcon color="#FFF" size={25} />
                                                </View>
                                            ) : (
                                                <MicMutedIcon color={trackRef.participant.isMicrophoneEnabled ? "#FFF" : "#D66A77"} size={25} />
                                            )}
                                        </View>
                                    </View>
                                    {index < tracks.length - 1 && <View style={styles.rowSeparator} />}
                                </View>
                            );
                        })}
                        <View style={{ height: 100 }} />
                    </View>
                </ScrollView>

                <TripBottomTabBar activeRoute="VoiceChat" tripData={tripData} />
            </SafeAreaView>
        </ImageBackground>
    );
};

const VoiceChatScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { trip: passedTrip, invitationCode: directCode, isAdmin: passedIsAdmin } = route.params || {};
    
    // Core state and trip data
    const tripData = passedTrip || { image: require('../../../assets/Madinah.png') };
    const tripId = tripData.id || tripData.tripId;
    const invitationCode = directCode || tripData.invitationCode;
    const isAdmin = passedIsAdmin !== undefined ? passedIsAdmin : (passedTrip?.isAdmin !== undefined ? passedTrip.isAdmin : !invitationCode);
    const { autoStart } = route.params || {};

    // LiveKit Connection States
    const [connectionDetails, setConnectionDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isChannelActive, setIsChannelActive] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isGlobalMuteActive, setIsGlobalMuteActive] = useState(false);
    const [userRole, setUserRole] = useState('participant');
    const [isAdminState, setIsAdminState] = useState(isAdmin);

    useEffect(() => {
        const fetchRole = async () => {
            if (auth.currentUser) {
                const token = await auth.currentUser.getIdTokenResult();
                const role = token.claims.role || 'participant';
                setUserRole(role);
                const isStaff = role === 'admin' || role === 'co-host' || role === 'manager';
                setIsAdminState(isStaff);

                // Auto-start if requested by navigation
                if (autoStart && isStaff && !isConnected && !loading) {
                    fetchToken();
                }
            }
        };
        fetchRole();
    }, [autoStart]);

    // Listener for Global Mute & Channel Status (Consolidated)
    useEffect(() => {
        const orgId = tripData.orgId || tripData.org_id;
        if (!tripId || !orgId) return;

        const voiceRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel`);
        const unsubscribe = onValue(voiceRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const active = data.isChannelStarted ?? false;
                setIsChannelActive(active);
                setIsGlobalMuteActive(data.isAllMuted ?? false);
                
                if (data.isAllMuted && !isAdminState) {
                    setIsMuted(true);
                } else if (isAdminState && data.adminMuted !== undefined) {
                    setIsMuted(data.adminMuted);
                }

                // S21: Auto-leave for participants when channel is stopped
                if (!active && isConnected && !isAdminState) {
                    handleDisconnect();
                }
            } else {
                setIsChannelActive(false);
                if (isConnected && !isAdminState) {
                    handleDisconnect();
                }
            }
        });
        return () => unsubscribe();
    }, [tripId, tripData.orgId, tripData.org_id, isAdminState, isConnected]);

    // Audio Session Lifecycle
    useEffect(() => {
        if (isConnected) {
            const setupAudio = async () => {
                try {
                    await AudioSession.configureAudio({
                        android: { 
                            audioTypeOptions: AndroidAudioTypePresets.communication,
                        },
                        ios: { defaultOutput: 'speaker' },
                    });
                    await AudioSession.startAudioSession();
                    // Set volume high for walkie-talkie
                    await AudioSession.setDefaultRemoteAudioTrackVolume(1.0);
                } catch (e) {
                }
            };
            setupAudio();
            return () => {
                AudioSession.stopAudioSession().catch(e => {});
            };
        }
    }, [isConnected]);

    const requestMicrophonePermission = async () => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    {
                        title: "Microphone Permission",
                        message: "GoMusafir needs access to your microphone for voice chat.",
                        buttonNeutral: "Ask Me Later",
                        buttonNegative: "Cancel",
                        buttonPositive: "OK"
                    }
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            } catch (err) {
                return false;
            }
        }
        return true; // iOS handles this within the library/Info.plist
    };

    // Fetch Token logic
    const fetchToken = async () => {
        if (!tripId) {
            Alert.alert("Error", "No trip information found.");
            return;
        }

        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
            Alert.alert("Permission Required", "Microphone access is required to use voice chat.");
            return;
        }

        try {
            setLoading(true);

            // S22: Prepare audio environment BEFORE connecting
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: true,
                    shouldRouteThroughEarpieceAndroid: false,
                });
            } catch (audioErr) {
            }

            // If admin is starting, toggle status first and reset mute states
            if (isAdminState && !isChannelActive) {
                const toggle = httpsCallable(functions, 'toggleChannelStatus');
                await toggle({ tripId, active: true });
                
                // Reset global mute state when starting fresh
                const orgId = tripData.orgId || tripData.org_id;
                if (orgId) {
                    await update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                        isAllMuted: false,
                        adminMuted: false,
                        isChannelStarted: true
                    });
                }
                setIsMuted(false); // Ensure local state is also unmuted
            }

            const generateToken = httpsCallable(functions, 'generateLiveKitToken');
            const { data } = await generateToken({ tripId });

            if (data?.token && data?.url) {
                setConnectionDetails({
                    token: data.token,
                    url: data.url
                });
                setIsConnected(true);
                // Initialize local mute state based on global status
                setIsMuted(isGlobalMuteActive);
            }
 else {
                throw new Error("Failed to receive connection details from server.");
            }
        } catch (error) {
            const msg = error.code === 'failed-precondition' 
                ? "The channel has not been started by the organizer yet."
                : (error.message || "Failed to connect to the voice chat service.");
            Alert.alert("Voice Chat Unavailable", msg);
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (isAdmin && isConnected) {
            try {
                if (isAdminState) {
                    const toggle = httpsCallable(functions, 'toggleChannelStatus');
                    await toggle({ tripId, active: false });
                    
                    const orgId = tripData.orgId || tripData.org_id;
                    if (orgId) {
                        await update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                            isChannelStarted: false
                        });
                    }
                }
            } catch (e) {
            }
        }
        setIsConnected(false);
        setConnectionDetails(null);
    };

    if (isConnected && connectionDetails) {
        return (
            <View style={styles.container}>
                <LiveKitRoom
                    serverUrl={connectionDetails.url}
                    token={connectionDetails.token}
                    connect={true}
                    audio={true}
                    onDisconnected={handleDisconnect}
                >
                    <VoiceChatContent 
                        tripData={tripData} 
                        isAdmin={isAdminState} 
                        onDisconnect={handleDisconnect}
                        fetchToken={fetchToken}
                        loading={loading}
                        isMuted={isMuted}
                        setIsMuted={setIsMuted}
                        isGlobalMuteActive={isGlobalMuteActive}
                    />
                </LiveKitRoom>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <ImageBackground
                source={typeof tripData.image === 'string' ? { uri: tripData.image } : tripData.image}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <LinearGradient
                    colors={['rgba(0,0,0,0.6)', '#1A1E21']}
                    style={styles.gradientOverlay}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.4 }}
                />

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
                                        <View style={[styles.controlButtonOutline, { flex: 1, opacity: 0.5 }]}>
                                            <Text style={styles.controlText}> Mute Myself</Text>
                                        </View>
                                        <View style={[styles.controlButtonOutline, { flex: 1, opacity: 0.5 }]}>
                                            <Text style={styles.controlText}> Mute All</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={[
                                            styles.controlButtonOutline,
                                            { width: '100%', borderStyle: 'solid', backgroundColor: '#B99A4A', borderColor: '#B99A4A' }
                                        ]}
                                        onPress={fetchToken}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="#FFF" size="small" />
                                        ) : (
                                            <>
                                                <Ionicons
                                                    name="play-circle-outline"
                                                    size={20}
                                                    color="#FFF"
                                                    style={{ marginRight: 8 }}
                                                />
                                                <Text style={[styles.controlText, { color: '#FFF' }]}>
                                                    Channel Start
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <View style={styles.controlRow}>
                                    <View style={[styles.controlButtonOutline, { flex: 1, opacity: (isMuted || isGlobalMuteActive || false) ? 0.7 : 1 }]}>
                                        <TouchableOpacity
                                            style={{ flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' }}
                                            onPress={() => !(isGlobalMuteActive || false) && setIsMuted(!(isMuted || false))}
                                            disabled={(isGlobalMuteActive || false)}
                                        >
                                            {/* {(isMuted || isGlobalMuteActive || false) ? <MicMutedIcon color="#FFF" size={20} /> : <MicUnmutedIcon color="#FFF" size={20} />} */}
                                            <Text style={styles.controlText}> {(isGlobalMuteActive || false) ? ' Force Muted' : ((isMuted || false) ? ' Unmute' : ' Mute')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <TouchableOpacity
                                        onPress={fetchToken}
                                        style={[
                                            styles.controlButtonOutline,
                                            {
                                                borderColor: isChannelActive ? '#B99A4A' : '#3F4346',
                                                backgroundColor: isChannelActive ? '#B99A4A' : '#23272A',
                                                flex: 1
                                            }
                                        ]}
                                        disabled={loading || !isChannelActive}
                                    >
                                        {loading ? (
                                            <ActivityIndicator color="#FFF" size="small" />
                                        ) : (
                                            <Text style={[styles.controlText, { color: '#fff', opacity: isChannelActive ? 1 : 0.5 }]}>
                                                Channel Join
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
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
            </ImageBackground>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1E21',
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
        marginTop: 10,
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
    },
    participantInfo: {
        flex: 1,
    },
    nameText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
        marginBottom: 2,
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
