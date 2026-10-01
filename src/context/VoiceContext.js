import { updateLiveActivity, isMissingLiveActivity } from '../utils/liveActivityUpdates';
import { handleVoiceWidgetAction } from '../utils/voiceWidgetActions';
import { resolveVoiceWidgetSpeaker } from '../utils/voiceWidgetSpeaker';
import { configureIOSVoiceAudio } from '../utils/voiceAudioSession';
import { isVoiceStaff } from '../utils/voiceRole';
import { monitorVoiceSpeaking } from '../utils/voiceSpeakingMonitor';
import { watchVoiceChannelStatus } from '../utils/voiceChannelStatus';
import { requestVoiceToken } from '../utils/requestVoiceToken';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { database, functions, auth } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, onValue, update, get, onDisconnect, push } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { setAudioModeAsync } from 'expo-audio';
import { 
    AudioSession, 
    AndroidAudioTypePresets,
    LiveKitRoom
} from '@livekit/react-native';
import { Alert, Platform, PermissionsAndroid, AppState } from 'react-native';

import { Room, RoomEvent, ParticipantEvent } from 'livekit-client';
import { onAuthStateChanged } from 'firebase/auth';
import { MyLiveActivity } from '../components/Widget';
import { journeyWidget } from '../services/journeyWidgetService';
import { addUserInteractionListener, widgetsDirectory } from 'expo-widgets';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import VoiceInactivityMonitor from '../components/VoiceInactivityMonitor';

const VoiceContext = createContext();

const stringToUint8Array = (str) => {
    const arr = [];
    for (let i = 0; i < str.length; i++) {
        arr.push(str.charCodeAt(i));
    }
    return new Uint8Array(arr);
};

const uint8ArrayToString = (arr) => {
    let str = '';
    for (let i = 0; i < arr.length; i++) {
        str += String.fromCharCode(arr[i]);
    }
    return str;
};

const getWidgetsDir = () => {
    if (!widgetsDirectory) return null;
    let dir = widgetsDirectory;
    while (dir.endsWith('/')) {
        dir = dir.slice(0, -1);
    }
    return dir;
};

const downloadAvatarToWidgetsDir = async (uid, avatarUrl) => {
    const baseDir = getWidgetsDir();
    if (!baseDir || !avatarUrl || !uid) return null;

    const cleanUid = String(uid).replace(/[^a-zA-Z0-9_-]/g, '_');
    const localUri = `${baseDir}/speaker_${cleanUid}_widget_v2.jpg`;

    try {
        const fileInfo = await FileSystem.getInfoAsync(localUri);
        if (fileInfo.exists && fileInfo.size > 0) {
            return localUri;
        }

        if (typeof avatarUrl === 'string' && avatarUrl.startsWith('http')) {
            const res = await FileSystem.downloadAsync(avatarUrl, `${localUri}.download`);
            if (res && (res.status === 200 || res.status === 304)) {
                const thumbnail = await manipulateAsync(res.uri, [{ resize: { width: 96 } }], { compress: 0.8, format: SaveFormat.JPEG });
                await FileSystem.copyAsync({ from: thumbnail.uri, to: localUri });
                await FileSystem.deleteAsync(res.uri, { idempotent: true });
                await FileSystem.deleteAsync(thumbnail.uri, { idempotent: true });
                return localUri;
            }
        } else if (typeof avatarUrl === 'string' && avatarUrl.startsWith('file://') && avatarUrl !== localUri) {
            await FileSystem.copyAsync({ from: avatarUrl, to: localUri });
            return localUri;
        }
    } catch (e) {
        console.log("[VoiceContext] Error caching avatar to widgets dir:", e);
    }
    return null;
};

export const VoiceProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(auth.currentUser);
    const [connectionDetails, setConnectionDetails] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [localSpeaking, setLocalSpeaking] = useState(false);
    const [isChannelActive, setIsChannelActive] = useState(null); // null means loading
    const [isGlobalMuteActive, setIsGlobalMuteActive] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [loading, setLoading] = useState(false);
    const [stopping, setStopping] = useState(false);
    const stoppingRef = useRef(false);
    const [activeTripId, setActiveTripId] = useState(null);
    const [activeOrgId, setActiveOrgId] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [activeSpeakerData, setActiveSpeakerData] = useState(null);
    const [activeTripName, setActiveTripName] = useState(null);
    const [activeTripImage, setActiveTripImage] = useState(null);
    const [participantCount, setParticipantCount] = useState(0);
    const [widgetLogoPath, setWidgetLogoPath] = useState(null);
    const [speakingUids, setSpeakingUids] = useState([]);
    const [activeSpeakerAvatarUri, setActiveSpeakerAvatarUri] = useState('');
    const avatarCacheMap = useRef({});
    const widgetProfiles = useRef({});
    const [widgetProfileVersion, setWidgetProfileVersion] = useState(0);
    const lastActivityPayload = useRef(null);
    
    const currentUserRef = useRef(currentUser);
    const currentUserProfileRef = useRef({ name: '', avatar: '' });
    const isFetchingToken = useRef(false);
    const activeActivity = useRef(null);
    const activityDataRef = useRef(null);
    const activeTripIdRef = useRef(activeTripId);
    const activeOrgIdRef = useRef(activeOrgId);
    const isConnectedRef = useRef(isConnected);
    const isAdminRef = useRef(isAdmin);
    const isMutedRef = useRef(isMuted);
    const appStateRef = useRef(AppState.currentState);

    useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
    useEffect(() => { activeTripIdRef.current = activeTripId; }, [activeTripId]);
    useEffect(() => { activeOrgIdRef.current = activeOrgId; }, [activeOrgId]);
    useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
    useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);
    useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
    const room = useRef(new Room({
        audioLevelInterval: 20, // More frequent updates for more responsive UI
    })).current;

    // React to Firebase Auth state changes globally
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            if (!user) {
                setActiveTripId(null);
                setActiveOrgId(null);
                setIsAdmin(false);
                setIsConnected(false);
                setConnectionDetails(null);
                setActiveSpeakerData(null);
                setActiveTripName(null);
                setActiveTripImage(null);
                setSpeakingUids([]);
                currentUserProfileRef.current = { name: '', avatar: '' };
                avatarCacheMap.current = {};
                widgetProfiles.current = {};
                lastActivityPayload.current = null;
                setActiveSpeakerAvatarUri('');
                setIsMuted(true);
                setIsChannelActive(false);
                if (activeActivity.current) {
                    try { activeActivity.current.end('immediate').catch(() => {}); } catch (e) {}
                    activeActivity.current = null;
                    activityDataRef.current = null;
                }
                // When logged out, clean up room and reset all trip states
                if (isConnectedRef.current) {
                    try { await room.disconnect(); } catch (e) {}
                    try { await AudioSession.stopAudioSession(); } catch (e) {}
                } else if (room?.state === 'connected' || room?.state === 'connecting') {
                    try { await room.disconnect(); } catch (e) {}
                    try { await AudioSession.stopAudioSession(); } catch (e) {}
                }

            }
        });

        return () => unsubscribeAuth();
    }, [room]);

    // Cache current user profile for instant active speaker reporting
    useEffect(() => {
        const myUid = currentUser?.uid || auth.currentUser?.uid;
        if (!myUid) {
            currentUserProfileRef.current = { name: '', avatar: '', localAvatar: '' };
            return;
        }

        // Fast fallback immediately so name is NEVER empty
        const authName = auth.currentUser?.displayName || currentUser?.displayName || 'Hesham';
        const authAvatar = auth.currentUser?.photoURL || currentUser?.photoURL || '';
        currentUserProfileRef.current = {
            name: authName,
            avatar: authAvatar,
            localAvatar: currentUserProfileRef.current?.localAvatar || ''
        };

        const fetchUserProfile = async () => {
            try {
                // DO NOT fetch root users/${myUid}! Fetch only profile, full_name, photo_url
                const [profileSnap, nameSnap, photoSnap] = await Promise.all([
                    get(ref(database, `users/${myUid}/profile`)).catch(() => null),
                    get(ref(database, `users/${myUid}/full_name`)).catch(() => null),
                    get(ref(database, `users/${myUid}/photo_url`)).catch(() => null),
                ]);

                const profile = profileSnap?.val() || {};
                const fullName = nameSnap?.val();
                const photoUrl = photoSnap?.val();

                let displayName = authName;
                const firstName = profile.firstName || profile.first_name || '';
                const lastName = profile.lastName || profile.last_name || '';
                if (firstName || lastName) {
                    displayName = `${firstName} ${lastName}`.trim();
                } else if (fullName) {
                    displayName = fullName;
                }

                const displayImage = profile.photoURL 
                    || profile.photo_url 
                    || photoUrl 
                    || profile.photo 
                    || profile.profile_photo 
                    || profile.image 
                    || profile.avatar 
                    || authAvatar;

                if (auth.currentUser?.uid !== myUid) return;
                currentUserProfileRef.current = {
                    name: displayName,
                    avatar: displayImage || '',
                    localAvatar: currentUserProfileRef.current?.localAvatar || ''
                };
                setWidgetProfileVersion(version => version + 1);

                // Pre-cache current user's avatar to widgets directory
                if (displayImage && typeof displayImage === 'string' && displayImage.startsWith('http')) {
                    downloadAvatarToWidgetsDir(myUid, displayImage).then((localUri) => {
                        if (localUri && auth.currentUser?.uid === myUid) {
                            currentUserProfileRef.current.localAvatar = localUri;
                            avatarCacheMap.current[myUid] = localUri;
                            setActiveSpeakerAvatarUri(localUri);
                        }
                    }).catch(() => {});
                }
            } catch (e) {
                console.log("[VoiceContext] Error fetching user profile:", e);
            }
        };
        fetchUserProfile();
    }, [currentUser]);

    const reportSpeakingState = React.useCallback(async (speaking) => {
        const orgId = activeOrgIdRef.current;
        const tripId = activeTripIdRef.current;
        const myUid = auth.currentUser?.uid;
        if (!orgId || !tripId || !myUid) return;

        const speakerRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel/activeSpeaker`);
        if (speaking) {
            const myInfo = currentUserProfileRef.current;
            const displayName = myInfo.name || auth.currentUser?.displayName || 'Hesham';
            const displayAvatar = myInfo.avatar || auth.currentUser?.photoURL || '';

            if (myInfo.localAvatar) {
                setActiveSpeakerAvatarUri(myInfo.localAvatar);
            } else if (avatarCacheMap.current[myUid]) {
                setActiveSpeakerAvatarUri(avatarCacheMap.current[myUid]);
            }

            try {
                await update(speakerRef, {
                    name: displayName,
                    avatar: displayAvatar,
                    uid: myUid,
                    speaking: true,
                    timestamp: Date.now()
                });
            } catch (err) {}
        } else {
            try {
                const snap = await get(speakerRef);
                if (snap.exists() && snap.val()?.uid === myUid) {
                    await update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                        activeSpeaker: null
                    });
                }
            } catch (err) {}
        }
    }, []);

    // Keep track of active speakers in the room
    useEffect(() => {
        if (!room) return;

        const handleActiveSpeakersChanged = (speakers) => {
            const uids = (speakers || []).map(s => s.identity);
            setSpeakingUids(previous => previous.length === uids.length && previous.every((uid, index) => uid === uids[index]) ? previous : uids);

            // The local monitor owns Firebase reporting and its silence grace
            // period; a second writer here would clear it between syllables.
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
    }, [room, reportSpeakingState]);

    // Global active speaker reporting to Firebase from localParticipant
    useEffect(() => {
        setLocalSpeaking(false);
        if (!room?.localParticipant || !isConnected || isMuted || !auth.currentUser || !activeTripId || !activeOrgId) return;

        const onSpeakingChanged = (speaking) => {
            setLocalSpeaking(speaking);
            reportSpeakingState(speaking && !isMutedRef.current);
        };
        const monitor = monitorVoiceSpeaking(room.localParticipant, onSpeakingChanged);
        room.localParticipant.on(ParticipantEvent.IsSpeakingChanged, monitor.update);

        return () => {
            monitor.stop();
            room.localParticipant.off(ParticipantEvent.IsSpeakingChanged, monitor.update);
            const myUid = auth.currentUser?.uid;
            const orgId = activeOrgIdRef.current || activeOrgId;
            const tripId = activeTripIdRef.current || activeTripId;
            if (myUid && orgId && tripId) {
                const speakerRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel/activeSpeaker`);
                get(speakerRef).then((snap) => {
                    if (snap.exists() && snap.val()?.uid === myUid) {
                        update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                            activeSpeaker: null
                        }).catch(() => {});
                    }
                }).catch(() => {});
            }
        };
    }, [room?.localParticipant, isConnected, isMuted, auth.currentUser, activeTripId, activeOrgId, reportSpeakingState]);

    useEffect(() => {
        const prepareWidgetLogo = async () => {
            const baseDir = getWidgetsDir();
            if (!baseDir) return;
            try {
                // Version the cache so existing installs stop using the 5158px logo.
                const logoPath = `${baseDir}/widget_logo_v2.png`;
                const fileInfo = await FileSystem.getInfoAsync(logoPath);
                if (!fileInfo.exists || fileInfo.size === 0) {
                    const asset = Asset.fromModule(require('../../assets/widget_logo.png'));
                    await asset.downloadAsync();
                    if (asset.localUri) {
                        const thumbnail = await manipulateAsync(asset.localUri, [{ resize: { width: 420 } }], { format: SaveFormat.PNG });
                        await FileSystem.copyAsync({ from: thumbnail.uri, to: logoPath });
                        await FileSystem.deleteAsync(thumbnail.uri, { idempotent: true });
                    } else {
                        return;
                    }
                }
                setWidgetLogoPath(logoPath);
            } catch (err) {
                console.error('[VoiceContext] Error preparing widget logo:', err);
            }
        };
        prepareWidgetLogo();
    }, []);

    // Handle room disconnection events
    useEffect(() => {
        const handleRoomDisconnected = () => {
            setIsConnected(false);
            setConnectionDetails(null);
            setIsMuted(true);
            AsyncStorage.removeItem('@voice_session').catch(() => {});
            AudioSession.stopAudioSession().catch(() => {});
            if (activeActivity.current) {
                try { activeActivity.current.end('immediate').catch(() => {}); } catch (_) {}
                activeActivity.current = null;
            }
        };

        const handleRoomReconnected = async () => {
            console.log("[VoiceContext] LiveKit Room reconnected, ensuring mic state. isMuted:", isMutedRef.current);
            if (room?.localParticipant) {
                await room.localParticipant.setMicrophoneEnabled(!isMutedRef.current).catch(() => {});
            }
        };

        const onDataReceived = (payload, participant) => {
            try {
                const str = uint8ArrayToString(payload);
                const data = JSON.parse(str);
                
                if (data.targetIdentity === auth.currentUser?.uid) {
                    if (data.type === 'mute') {
                        setIsMuted(true);
                        Alert.alert("Microphone Muted", "You have been muted by the organizer.");
                    } else if (data.type === 'unmute') {
                        setIsMuted(false);
                        Alert.alert("Microphone Unmuted", "You have been unmuted by the organizer.");
                    }
                }
            } catch (e) {
                // Silently fail on non-JSON or malformed data
            }
        };

        room.on('disconnected', handleRoomDisconnected);
        room.on('reconnected', handleRoomReconnected);
        room.on('dataReceived', onDataReceived);

        // Auto-disconnect on Logout
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (!user && isConnected) {
                disconnect();
            }
        });

        return () => {
            room.off('disconnected', handleRoomDisconnected);
            room.off('reconnected', handleRoomReconnected);
            room.off('dataReceived', onDataReceived);
            unsubscribeAuth();
        };
    }, [room, isConnected]);

    // Sync isChannelActive for the active trip
    useEffect(() => {
        const orgIdToUse = activeOrgId;
        const tripIdToUse = activeTripId;

        if (!tripIdToUse || !orgIdToUse) {
            return;
        }

        setIsChannelActive(null); // Reset to loading when trip changes

        const unsubscribeStatus = watchVoiceChannelStatus(database, orgIdToUse, tripIdToUse, setIsChannelActive);
        const voiceRef = ref(database, `trips_active/${orgIdToUse}/${tripIdToUse}/voice_channel`);
        let observedEnd;
        let receivedInitialState = false;
        const unsubscribe = onValue(voiceRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (receivedInitialState && data.endedSessionId !== observedEnd && data.endReason === 'pre_trip_exhausted' && isAdminRef.current) {
                    Alert.alert('Pre-trip Voice allowance used', 'Pre-trip Voice has been used. Full Voice will become available 24 hours before your journey starts.');
                }
                if (receivedInitialState && data.endedSessionId !== observedEnd && data.endReason === 'alone_timeout' && data.endRecipientUid === auth.currentUser?.uid) {
                    Alert.alert('Voice Chat automatically stopped', 'The Voice Chat was automatically stopped because you were the only connected person for 5 minutes.');
                }
                observedEnd = data.endedSessionId;
                receivedInitialState = true;
                setIsGlobalMuteActive(data.isAllMuted ?? false);
            } else {
                setIsGlobalMuteActive(false);
            }
        });

        const speakerRef = ref(database, `trips_active/${orgIdToUse}/${tripIdToUse}/voice_channel/activeSpeaker`);
        const unsubscribeSpeaker = onValue(speakerRef, (snapshot) => {
            if (snapshot.exists()) {
                setActiveSpeakerData(snapshot.val());
            } else {
                setActiveSpeakerData(null);
            }
        });

        return () => {
            unsubscribe();
            unsubscribeStatus();
            unsubscribeSpeaker();
        };
    }, [activeTripId, activeOrgId]);

    // Confirm media connectivity through the backend immediately after joining.
    // This recovers missing/delayed webhooks without letting a client start the
    // allowance timer or publish channel status itself.
    useEffect(() => {
        if (!isConnected || !activeTripId || !activeOrgId || isChannelActive === true) return;
        let stopped = false;
        let checking = false;
        const confirm = async () => {
            if (stopped || checking) return;
            checking = true;
            try {
                await httpsCallable(functions, 'getTripFeatureAccess')({ tripId: activeTripId });
            } catch (error) {
                if (!stopped) console.warn('[VoiceContext] Channel status confirmation failed:', error.code);
            } finally {
                checking = false;
            }
        };
        confirm();
        const retry = setInterval(confirm, 3000);
        return () => { stopped = true; clearInterval(retry); };
    }, [isConnected, activeTripId, activeOrgId, isChannelActive]);

    // Fetch Trip Title and Image for UI
    useEffect(() => {
        if (!activeTripId || !activeOrgId) return;

        const tripRef = ref(database, `orgs/${activeOrgId}/trips/${activeTripId}`);
        get(tripRef).then(async (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                if (data.title) {
                    setActiveTripName(data.title);
                }
                const baseDir = getWidgetsDir();
                if (data.image && typeof data.image === 'string' && baseDir) {
                    try {
                        const localUri = `${baseDir}/trip_image_${activeTripId}_widget_v2.jpg`;
                        const fileInfo = await FileSystem.getInfoAsync(localUri);
                        if (!fileInfo.exists || fileInfo.size === 0) {
                            const download = await FileSystem.downloadAsync(data.image, `${localUri}.download`);
                            try {
                                if (download.status !== 200) throw new Error(`Trip image download failed: ${download.status}`);
                                const thumbnail = await manipulateAsync(download.uri, [
                                    { resize: { width: 390 } },
                                ], { compress: 0.8, format: SaveFormat.JPEG });
                                await FileSystem.copyAsync({ from: thumbnail.uri, to: localUri });
                                await FileSystem.deleteAsync(thumbnail.uri, { idempotent: true });
                            } finally {
                                await FileSystem.deleteAsync(`${localUri}.download`, { idempotent: true });
                            }
                        }
                        setActiveTripImage(localUri);
                    } catch (err) {
                        console.error('[VoiceContext] Failed to download widget image', err);
                    }
                }
            }
        }).catch(() => {});
    }, [activeTripId, activeOrgId]);

    // Fetch Participants Count
    useEffect(() => {
        if (!activeTripId || !activeOrgId) return;

        const participantsRef = ref(database, `trips_participants/${activeTripId}`);
        const unsubscribe = onValue(participantsRef, (snapshot) => {
            if (snapshot.exists()) {
                const val = snapshot.val();
                let uids = [];
                if (Array.isArray(val)) {
                    uids = val.filter(v => v !== null);
                } else if (typeof val === 'object') {
                    uids = Object.keys(val);
                }
                setParticipantCount(uids.length);
            } else {
                setParticipantCount(0);
            }
        });

        return () => unsubscribe();
    }, [activeTripId, activeOrgId]);

    const prevGlobalMute = useRef(null);

    // Force mute when global mute state is active (only for participants, not admin/organizers)
    useEffect(() => {
        if (isAdmin) return; // Admins are never force-muted globally

        if (isGlobalMuteActive) {
            setIsMuted(true);
        }
        prevGlobalMute.current = isGlobalMuteActive;
    }, [isGlobalMuteActive, isAdmin]);

    // Sync local mute state with hardware
    useEffect(() => {
        let cancelled = false;
        if (room?.localParticipant && isConnected) {
            room.localParticipant.setMicrophoneEnabled(!isMuted).catch(err => {
                console.log("Failed to sync mic state:", err);
                if (!cancelled && !isMuted) {
                    setIsMuted(true);
                    Alert.alert('Microphone unavailable', 'Unable to turn on your microphone. Please try again.');
                }
            });
        }
        return () => { cancelled = true; };
    }, [isMuted, room, isConnected]);

    // Clear any legacy auto-reconnect session flag on startup
    useEffect(() => {
        const clearPersistedSession = async () => {
            try {
                await AsyncStorage.removeItem('@voice_session');
            } catch (e) {}
        };
        clearPersistedSession();
    }, []);

    // AppState lifecycle listener: keep voice chat connected in background without leaving
    useEffect(() => {
        const handleAppStateChange = async (nextAppState) => {
            const previousAppState = appStateRef.current;
            appStateRef.current = nextAppState;

            console.log(`[VoiceContext] AppState changed: ${previousAppState} -> ${nextAppState}`);

            const currentTripId = activeTripIdRef.current;
            const currentOrgId = activeOrgIdRef.current;
            const myUid = auth.currentUser?.uid;

            if (nextAppState === 'background') {
                // When moving to background, keep voice chat connected and preserve user's microphone state.
                // Do not force-mute so the user can continue talking seamlessly while in background.
                if (isConnectedRef.current) {
                    try {
                        if (myUid && currentTripId && currentOrgId) {
                            // Keep voice presence and active_hosts alive across backgrounding:
                            // Cancel onDisconnect removal so OS socket suspension in background does not purge presence/hosts
                            const myPresenceRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence/${myUid}`);
                            onDisconnect(myPresenceRef).cancel().catch(() => {});
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence`), {
                                [myUid]: true
                            }).catch(() => {});

                            if (isAdminRef.current) {
                                const myHostRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts/${myUid}`);
                                onDisconnect(myHostRef).cancel().catch(() => {});
                                update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts`), {
                                    [myUid]: true
                                }).catch(() => {});
                            }
                        }
                    } catch (e) {
                        console.log("[VoiceContext] Error handling background voice state:", e);
                    }
                }

                // Mark app_presence (foreground UI activity) as null when backgrounded
                if (myUid && currentTripId && currentOrgId) {
                    try {
                        const myAppPresenceRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/app_presence`);
                        await update(myAppPresenceRef, {
                            [myUid]: null
                        });
                    } catch (e) {
                        console.log("[VoiceContext] Error clearing app_presence on app background:", e);
                    }
                }
            } else if (nextAppState === 'active') {
                // When app becomes active in foreground, restore app_presence
                if (myUid && currentTripId && currentOrgId) {
                    try {
                        const myAppPresenceRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/app_presence`);
                        const itemRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/app_presence/${myUid}`);
                        onDisconnect(itemRef).remove().catch(() => {});
                        update(myAppPresenceRef, {
                            [myUid]: true
                        }).catch(() => {});

                        // If connected to voice chat, re-arm presence and active_hosts onDisconnect for when app is terminated
                        if (isConnectedRef.current) {
                            const myPresenceRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence/${myUid}`);
                            onDisconnect(myPresenceRef).remove().catch(() => {});
                            update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence`), {
                                [myUid]: true
                            }).catch(() => {});

                            if (isAdminRef.current) {
                                const myHostRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts/${myUid}`);
                                onDisconnect(myHostRef).remove().catch(() => {});
                                update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts`), {
                                    [myUid]: true
                                }).catch(() => {});
                            }
                        }
                    } catch (e) {
                        console.log("[VoiceContext] Error setting app presence active:", e);
                    }
                }
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
        };
    }, [room]);

    // Sync app_presence for the current trip in real-time
    useEffect(() => {
        const currentUid = currentUser?.uid || auth.currentUser?.uid;
        if (!currentUid || !activeTripId || !activeOrgId) return;

        const currentOrgId = activeOrgId;
        const currentTripId = activeTripId;

        const connectedRef = ref(database, ".info/connected");
        const myAppPresenceRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/app_presence`);
        const itemRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/app_presence/${currentUid}`);

        const markPresenceOnline = () => {
            if (appStateRef.current === 'active') {
                onDisconnect(itemRef).remove().catch(() => {});
                update(myAppPresenceRef, {
                    [currentUid]: true
                }).catch((err) => {
                    console.log("[VoiceContext] Error updating app_presence online:", err);
                });
            }
        };

        // Immediately mark online
        markPresenceOnline();

        const unsubscribeConnected = onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                markPresenceOnline();
                if (isConnectedRef.current && auth.currentUser?.uid) {
                    const presenceUid = auth.currentUser.uid;
                    const isForeground = appStateRef.current === 'active';
                    const myPresenceRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence/${presenceUid}`);
                    if (isForeground) {
                        onDisconnect(myPresenceRef).remove().catch(() => {});
                    }
                    update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence`), {
                        [presenceUid]: true
                    }).catch(() => {});

                    if (isAdminRef.current) {
                        const myHostRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts/${presenceUid}`);
                        if (isForeground) {
                            onDisconnect(myHostRef).remove().catch(() => {});
                        }
                        update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts`), {
                            [presenceUid]: true
                        }).catch(() => {});
                    }
                }
            }
        });

        return () => {
            if (unsubscribeConnected) unsubscribeConnected();
            // If still authenticated as this user, cleanly mark offline on unmount/trip exit
            if (auth.currentUser?.uid === currentUid) {
                update(myAppPresenceRef, {
                    [currentUid]: null
                }).catch(() => {});
            }
        };
    }, [currentUser?.uid, activeTripId, activeOrgId]);

    // Warm profile images before speech starts; never wait for the shared
    // Firebase activeSpeaker record to learn the current speaker's photo.
    useEffect(() => {
        if (!isConnected) return;
        let cancelled = false;
        const participants = [...room.remoteParticipants.values()];
        Promise.all(participants.map(async participant => {
            const uid = participant.identity;
            if (!uid || widgetProfiles.current[uid]) return;
            try {
                const [profileSnap, photoSnap, nameSnap] = await Promise.all([
                    get(ref(database, `users/${uid}/profile`)),
                    get(ref(database, `users/${uid}/photo_url`)),
                    get(ref(database, `users/${uid}/full_name`)),
                ]);
                const profile = profileSnap.val() || {};
                const name = [profile.firstName || profile.first_name, profile.lastName || profile.last_name].filter(Boolean).join(' ') || nameSnap.val() || participant.name;
                const photo = profile.photoURL || profile.photo_url || photoSnap.val() || profile.photo || profile.profile_photo || profile.image || profile.avatar;
                const avatar = photo ? await downloadAvatarToWidgetsDir(uid, photo) : null;
                if (cancelled) return;
                widgetProfiles.current[uid] = { name };
                if (avatar) avatarCacheMap.current[uid] = avatar;
                setWidgetProfileVersion(version => version + 1);
            } catch (error) {
                console.warn('[VoiceContext] Widget profile unavailable:', error.code);
            }
        }));
        return () => { cancelled = true; };
    }, [isConnected, room, participantCount, activeTripId]);

    // Cache active speaker avatar for widgets
    useEffect(() => {
        const avatarUrl = activeSpeakerData?.avatar;
        const speakerUid = activeSpeakerData?.uid;

        if (!avatarUrl || !speakerUid) {
            return;
        }

        // 1. Current user instant cache
        if (speakerUid === auth.currentUser?.uid && currentUserProfileRef.current?.localAvatar) {
            setActiveSpeakerAvatarUri(currentUserProfileRef.current.localAvatar);
            return;
        }

        // 2. Memory cache map
        if (avatarCacheMap.current[speakerUid]) {
            setActiveSpeakerAvatarUri(avatarCacheMap.current[speakerUid]);
            return;
        }

        // 3. Download to widgetsDirectory
        downloadAvatarToWidgetsDir(speakerUid, avatarUrl).then((localUri) => {
            if (localUri) {
                avatarCacheMap.current[speakerUid] = localUri;
                setActiveSpeakerAvatarUri(localUri);
            }
        });
    }, [activeSpeakerData?.avatar, activeSpeakerData?.uid]);

    // Widget Synchronization
    useEffect(() => {
        const currentTripName = activeTripName || "Trip Voice Room";
        const channelActiveBool = isChannelActive === true || isChannelActive === 'true' || isChannelActive === 1;

        const myUid = auth.currentUser?.uid;
        const myInfo = currentUserProfileRef.current;
        const { name: speakerName, avatar: speakerAvatar, isSpeaking } = resolveVoiceWidgetSpeaker({
            connected: isConnected,
            muted: isMuted,
            localSpeaking,
            localUid: myUid,
            localName: widgetProfiles.current[myUid]?.name || myInfo.name || auth.currentUser?.displayName || 'You',
            localAvatar: myInfo.localAvatar || avatarCacheMap.current[myUid] || '',
            speakingUids,
            remoteParticipants: room.remoteParticipants,
            activeSpeaker: activeSpeakerData,
            avatarCache: avatarCacheMap.current,
            profiles: widgetProfiles.current,
        });

        // CRITICAL: WidgetKit and ActivityKit run in an isolated extension process where
        // network requests are blocked. ONLY valid file:// URIs located in the shared App Group
        // can be passed to activeSpeakerAvatar. Never pass remote http/https URLs.
        const validSpeakerAvatar = (speakerAvatar && speakerAvatar.startsWith('file://')) ? speakerAvatar : "";

        // Use the text logo until the bounded image is ready; never load the old full-size cache.
        const fallbackLogo = "";

        try {
            journeyWidget.updateSnapshot({
                isAdmin,
                isConnected,
                isChannelActive: channelActiveBool,
                isGlobalMuteActive,
                isMuted,
                activeChannelName: activeTripId ? currentTripName : "No Channel",
                activeChannelImageURL: activeTripImage || "",
                activeSpeakerName: speakerName,
                activeSpeakerAvatar: validSpeakerAvatar,
                isSpeaking: isSpeaking,
                participantCount: participantCount || 0,
                tripId: activeTripId || "",
                orgId: activeOrgId || "",
                widgetLogoURL: widgetLogoPath || fallbackLogo
            });
        } catch (e) {
            console.log("[VoiceContext] Failed to update widget snapshot:", e);
        }

        if (MyLiveActivity && isConnected && !stoppingRef.current) {
            if (!activeActivity.current) {
                try {
                    const instances = MyLiveActivity.getInstances();
                    if (instances && instances.length > 0) {
                        activeActivity.current = instances[0];
                    }
                } catch (e) {}
            }

            if (activeActivity.current) {
                try {
                    activityDataRef.current = {
                        ...activityDataRef.current,
                        widgetLogoURL: widgetLogoPath || "",
                        isAdmin,
                        isConnected,
                        isChannelActive: channelActiveBool,
                        isGlobalMuteActive,
                        isMuted,
                        activeChannelName: activeTripId ? currentTripName : "No Channel",
                        activeChannelImageURL: activeTripImage || "",
                        activeSpeakerName: speakerName,
                        activeSpeakerAvatar: validSpeakerAvatar,
                        isSpeaking: isSpeaking,
                        participantCount: participantCount || 0
                    };
                    updateLiveActivity(activeActivity.current, activityDataRef.current,
                        activeActivity, lastActivityPayload).catch(error => {
                        console.warn('[VoiceContext] Live Activity update rejected:', error);
                    });
                } catch (e) {
                    console.log("[VoiceContext] Live Activity update failed:", e);
                }
            }
        }
    }, [isAdmin, isConnected, isChannelActive, isGlobalMuteActive, isMuted, activeTripId, activeSpeakerData, activeSpeakerAvatarUri, activeTripName, activeTripImage, participantCount, speakingUids, localSpeaking, room, widgetLogoPath, widgetProfileVersion]);

    const requestMicrophonePermission = async () => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    {
                        title: "Microphone Permission",
                        message: "GoMusafir needs access to your microphone for voice chat.",
                        buttonPositive: "OK"
                    }
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            } catch (err) {
                return false;
            }
        }
        return true;
    };

    const connect = async (tripId, orgId, isStaff) => {
        if (!tripId || !orgId) {
            console.error("[VoiceContext] Cannot connect: missing tripId or orgId", { tripId, orgId, isStaff });
            Alert.alert("Voice Chat Error", "Connection parameters are missing. Please try again.");
            return;
        }

        if (stoppingRef.current || isFetchingToken.current || (isConnected && activeTripId === tripId)) return;

        // If switching trips, disconnect first
        if (isConnected && activeTripId !== tripId) {
            await disconnect();
        }

        setActiveTripId(tripId);
        setActiveOrgId(orgId);
        setIsMuted(true);

        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
            Alert.alert("Permission Required", "Microphone access is required to use voice chat.");
            return;
        }

        try {
            isFetchingToken.current = true;
            setLoading(true);

            // Widget URLs can outlive a session and contain a stale role hint.
            // Resolve the current trip's role before configuring host controls,
            // presence, and the Live Activity. The token endpoint authorizes access.
            const uid = auth.currentUser?.uid;
            if (!uid) throw new Error('Please sign in to use voice chat.');
            const roleSnapshot = await get(ref(database, `orgs/${orgId}/staff/${uid}`)).catch(error => {
                // Participants may not yet have access to the staff directory
                // during a cold deep link. Never infer host status on denial.
                if (String(error.code).toLowerCase().includes('permission')) return null;
                throw error;
            });
            isStaff = isVoiceStaff(roleSnapshot?.val());
            setIsAdmin(isStaff);

            console.log("[VoiceContext] connect called with:", { tripId, orgId, isStaff });

            // The backend admits the session and LiveKit confirms channel activation.
            // ── Phase 2: Audio setup + LiveKit Token generation in parallel ───────
            const audioSetup = async () => {
                try {
                    if (Platform.OS !== 'ios') await setAudioModeAsync({
                        allowsRecording: true,
                        playsInSilentMode: true,
                        shouldPlayInBackground: true,
                        shouldRouteThroughEarpiece: false,
                        interruptionMode: 'mixWithOthers',
                    });
                    await AudioSession.configureAudio({
                        android: { audioTypeOptions: AndroidAudioTypePresets.communication },
                        ios: { defaultOutput: 'speaker' },
                    });
                    if (Platform.OS === 'ios') {
                        await configureIOSVoiceAudio();
                    }
                    await AudioSession.startAudioSession();
                    await AudioSession.setDefaultRemoteAudioTrackVolume(1.0);
                } catch (e) {
                    console.log("[VoiceContext] Audio setup error:", e);
                    throw e;
                }
            };

            const tokenPromise = requestVoiceToken(functions, httpsCallable, tripId);

            // Run audio hardware preparation and token generation concurrently
            const [, tokenResult] = await Promise.all([audioSetup(), tokenPromise]);
            const { data } = tokenResult;

            if (data?.token && data?.url) {
                setConnectionDetails({
                    token: data.token,
                    url: data.url
                });

                // Connect the persistent room object with timeout protection
                const roomTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Voice room connection timed out. Please try again.')), 8000)
                );
                await Promise.race([room.connect(data.url, data.token), roomTimeout]);
                setIsConnected(true);

                // Enforce muted state upon room connection across all roles
                if (room.localParticipant) {
                    await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
                }
                setIsMuted(true);

                // If staff (host), register presence in active_hosts (fire and forget)
                if (isStaff && auth.currentUser?.uid) {
                    const hostUid = auth.currentUser.uid;
                    const myHostRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel/active_hosts/${hostUid}`);
                    onDisconnect(myHostRef).remove().catch(() => {});
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/active_hosts`), {
                        [hostUid]: true
                    }).catch(() => {});
                }

                // Register presence in active presence list for ALL users in the voice chat
                if (auth.currentUser?.uid) {
                    const presenceUid = auth.currentUser.uid;
                    const myPresenceRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel/presence/${presenceUid}`);
                    onDisconnect(myPresenceRef).remove().catch(() => {});
                    update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/presence`), {
                        [presenceUid]: true
                    }).catch(() => {});
                }

                // Start Live Activity
                if (MyLiveActivity) {
                    try {
                        const widgetEnabled = await AsyncStorage.getItem('@lockscreen_widget_enabled');
                        const currentTripName = activeTripName || "Trip Voice Room";
                        if (widgetEnabled !== 'false') {
                            const instances = MyLiveActivity.getInstances();
                            if (instances.length > 0) {
                                activeActivity.current = instances[0];
                                activityDataRef.current = {
                                    widgetLogoURL: widgetLogoPath || "",
                                    tripName: currentTripName,
                                    status: isStaff ? "Hosting" : "Connected",
                                    startTime: Date.now(),
                                    isAdmin: isStaff,
                                    activeSpeakerName: "",
                                    activeSpeakerAvatar: "",
                                    isSpeaking: false,
                                    isConnected: true,
                                    isChannelActive: isStaff ? true : (isChannelActive === true || isChannelActive === 'true'),
                                    isGlobalMuteActive: isGlobalMuteActive ?? false,
                                    isMuted: true,
                                    activeChannelName: currentTripName,
                                    participantCount
                                };
                                try {
                                    await activeActivity.current.update(activityDataRef.current);
                                } catch (error) {
                                    if (!isMissingLiveActivity(error)) throw error;
                                    activeActivity.current = null;
                                    lastActivityPayload.current = null;
                                    if (!stoppingRef.current && room.state === 'connected') {
                                        activeActivity.current = MyLiveActivity.start(activityDataRef.current,
                                            `gomusafir://voicechat?tripId=${tripId}&orgId=${orgId}`);
                                    }
                                }
                            } else {
                                activityDataRef.current = {
                                    widgetLogoURL: widgetLogoPath || "",
                                    tripName: currentTripName,
                                    status: isStaff ? "Hosting" : "Connected",
                                    startTime: Date.now(),
                                    isAdmin: isStaff,
                                    activeSpeakerName: "",
                                    activeSpeakerAvatar: "",
                                    isSpeaking: false,
                                    isConnected: true,
                                    isChannelActive: isStaff ? true : (isChannelActive === true || isChannelActive === 'true'),
                                    isGlobalMuteActive: isGlobalMuteActive ?? false,
                                    isMuted: true,
                                    activeChannelName: currentTripName,
                                    participantCount
                                };
                                activeActivity.current = MyLiveActivity.start(
                                    activityDataRef.current,
                                    `gomusafir://voicechat?tripId=${tripId}&orgId=${orgId}`
                                );
                            }
                        } else {
                            // If widget is disabled, make sure any remaining live activity is ended
                            const instances = MyLiveActivity.getInstances();
                            instances.forEach(instance => instance.end('immediate'));
                            activeActivity.current = null;
                        }
                    } catch (e) {
                        console.log("[VoiceContext] Live Activity start failed:", e);
                        Alert.alert('Lock Screen Card Unavailable', 'Voice chat is connected, but its lock-screen card could not be shown. Check that Live Activities are enabled for GoMusafir in iPhone Settings, then reconnect.');
                    }
                }
            } else {
                throw new Error("Failed to receive connection details from server.");
            }
        } catch (error) {
            if (error.message === 'TRIP_EXPIRED') {
                Alert.alert("Trip Expired", "Voice chat is not available for this trip as it has expired.");
            } else {
                let msg = error.message || "Failed to connect to the voice chat service.";
                if (error.code === 'failed-precondition' && !error.message) {
                    msg = "The channel has not been started by the organizer yet.";
                } else if (msg.toLowerCase().includes('network request failed')) {
                    msg = "Network request failed. Please check your internet connection and try again.";
                }
                Alert.alert("Voice Chat Error", msg);
            }
            setActiveTripId(null);
            setActiveOrgId(null);
        } finally {
            setLoading(false);
            isFetchingToken.current = false;
        }
    };

    const disconnectRoom = async () => {
        try {
            // Remove session first to prevent auto-reconnect loop
            await AsyncStorage.removeItem('@voice_session');
            setIsConnected(false);
            setConnectionDetails(null);
            setIsMuted(true);

            if (room?.localParticipant) {
                await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
            }

            const currentTripId = activeTripIdRef.current || activeTripId;
            const currentOrgId = activeOrgIdRef.current || activeOrgId;
            const myUid = auth.currentUser?.uid;

            // Clean up presence in database for current user across hosts and presence
            if (currentTripId && currentOrgId && myUid) {
                const myHostRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts/${myUid}`);
                onDisconnect(myHostRef).cancel().catch(() => {});
                update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/active_hosts`), {
                    [myUid]: null
                }).catch(() => {});

                const myPresenceRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence/${myUid}`);
                onDisconnect(myPresenceRef).cancel().catch(() => {});
                update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/presence`), {
                    [myUid]: null
                }).catch(() => {});

                // Clean up activeSpeaker if current user was speaking
                const speakerRef = ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel/activeSpeaker`);
                try {
                    const snap = await get(speakerRef);
                    if (snap.exists() && snap.val()?.uid === myUid) {
                        await update(ref(database, `trips_active/${currentOrgId}/${currentTripId}/voice_channel`), {
                            activeSpeaker: null
                        });
                    }
                } catch (e) {}
            }

            if (activeActivity.current) {
                try {
                    activeActivity.current.end('immediate').catch(() => {});
                } catch (e) {
                    console.log("[VoiceContext] Live Activity end failed:", e);
                }
                activeActivity.current = null;
            }

            await room.disconnect().catch(() => {});
            await AudioSession.stopAudioSession().catch(() => {});
        } catch (e) {
            console.log("Disconnect error:", e);
        }
    };

    const disconnect = async () => {
        if (stoppingRef.current) return;
        stoppingRef.current = true;
        setStopping(true);
        try {
            await disconnectRoom();
        } finally {
            stoppingRef.current = false;
            setStopping(false);
        }
    };

    const stopChannel = async (forceAdmin = null, forceTripId = null, forceOrgId = null) => {
        if (stoppingRef.current) return;
        stoppingRef.current = true;
        setStopping(true);
        try {
            const tripIdToStop = forceTripId !== null ? forceTripId : activeTripId;
            const orgIdToStop = forceOrgId !== null ? forceOrgId : activeOrgId;
            const isUserAdmin = forceAdmin !== null ? forceAdmin : isAdmin;

            setIsMuted(true);

            if (isUserAdmin && tripIdToStop && orgIdToStop) {
                try {
                    console.log("[VoiceContext] Toggling channel status to false for tripId:", tripIdToStop);
                    const toggle = httpsCallable(functions, 'toggleChannelStatus');
                    await toggle({ tripId: tripIdToStop, active: false });

                    setIsChannelActive(false);
                    setIsGlobalMuteActive(false);
                } catch (e) {
                    console.log("Stop channel error:", e);
                    Alert.alert("Error", "Failed to stop the channel. Please check your connection.");
                }
            } else {
                console.log("[VoiceContext] stopChannel skipping database write due to missing parameters or admin privileges:", { isUserAdmin, tripIdToStop, orgIdToStop });
            }
            await disconnectRoom();
        } finally {
            stoppingRef.current = false;
            setStopping(false);
        }
    };

    // Keep the native subscription attached while speaking/mute state changes.
    // The ref supplies current handlers without dropping events during resubscription.
    const widgetActionsRef = useRef(null);
    widgetActionsRef.current = async (event) => {
        await handleVoiceWidgetAction(event, {
            connected: isConnectedRef.current,
            admin: isAdminRef.current,
            muted: isMutedRef.current,
            globallyMuted: isGlobalMuteActive,
            tripId: activeTripIdRef.current,
            orgId: activeOrgIdRef.current,
            connect,
            disconnect,
            stop: stopChannel,
            setMuted: async muted => {
                await room.localParticipant.setMicrophoneEnabled(!muted);
                isMutedRef.current = muted;
                setIsMuted(muted);
            },
            setGlobalMuted: async muted => {
                await update(ref(database, `trips_active/${activeOrgIdRef.current}/${activeTripIdRef.current}/voice_channel`), {
                    isAllMuted: muted,
                    lastUpdatedBy: auth.currentUser?.uid || null,
                });
                setIsGlobalMuteActive(muted);
            },
        });
    };
    useEffect(() => {
        let pending = Promise.resolve();
        const subscription = addUserInteractionListener(event => {
            pending = pending.then(() => widgetActionsRef.current?.(event)).catch(error => {
                console.error('[VoiceContext] Widget action failed:', event.target, error);
                Alert.alert('Voice Control Failed', 'The lock-screen action could not be completed. Open voice chat and try again.');
            });
        });
        return () => subscription.remove();
    }, []);

    const setActiveTrip = React.useCallback((tId, oId) => {
        setActiveTripId(prev => (prev !== tId ? tId : prev));
        setActiveOrgId(prev => (prev !== oId ? oId : prev));
    }, []);

    const sendMuteCommand = React.useCallback(async (targetIdentity, muteState = true) => {
        if (!room || !isConnected) return;
        try {
            const data = stringToUint8Array(JSON.stringify({
                type: muteState ? 'mute' : 'unmute',
                targetIdentity: targetIdentity
            }));
            await room.localParticipant.publishData(data, {
                destinationIdentities: [targetIdentity]
            });

            // Also record in-app notification in RTDB for the target participant
            const tId = activeTripIdRef.current || activeTripId;
            const oId = activeOrgIdRef.current || activeOrgId;
            if (tId && oId && targetIdentity) {
                const notifType = muteState ? 'voice_muted' : 'voice_unmuted';
                const title = muteState ? 'Microphone Muted' : 'Microphone Unmuted';
                const message = muteState ? 'You were muted by the organizer.' : 'You were unmuted by the organizer.';
                const timestamp = Date.now();

                push(ref(database, `trips_active/${oId}/${tId}/notifications/${targetIdentity}`), {
                    type: notifType,
                    title: title,
                    message: message,
                    name: 'Organizer',
                    senderUid: auth.currentUser?.uid || null,
                    tripId: tId,
                    orgId: oId,
                    timestamp: timestamp,
                }).catch(e => console.log('[VoiceContext] Error saving mute notification:', e));
            }
        } catch (e) {
            console.log("Error sending mute/unmute command:", e);
            Alert.alert("Action Failed", `Could not send ${muteState ? 'mute' : 'unmute'} command. Please check your connection.`);
        }
    }, [room, isConnected, activeTripId, activeOrgId]);

    const clearPresence = React.useCallback(async (forceUid = null, forceTripId = null, forceOrgId = null) => {
        const myUid = forceUid || auth.currentUser?.uid;
        const tripId = forceTripId || activeTripIdRef.current;
        const orgId = forceOrgId || activeOrgIdRef.current;

        if (!myUid) return;

        const promises = [];
        if (tripId && orgId) {
            promises.push(
                update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/app_presence`), { [myUid]: null }).catch(() => {}),
                update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/presence`), { [myUid]: null }).catch(() => {}),
                update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/active_hosts`), { [myUid]: null }).catch(() => {})
            );
        }
        await Promise.all(promises);
    }, []);

    const contextValue = React.useMemo(() => ({
        isConnected, 
        connectionDetails, 
        isChannelActive, 
        isGlobalMuteActive, 
        isMuted, 
        setIsMuted,
        loading: loading || stopping,
        stopping,
        connect,
        disconnect,
        stopChannel,
        setActiveTrip,
        clearPresence,
        isAdmin,
        activeTripId,
        activeOrgId,
        activeSpeakerData,
        speakingUids,
        room,
        sendMuteCommand,
    }), [
        isConnected, 
        connectionDetails, 
        isChannelActive, 
        isGlobalMuteActive, 
        isMuted, 
        setIsMuted,
        loading,
        stopping,
        connect,
        disconnect,
        stopChannel,
        setActiveTrip,
        clearPresence,
        isAdmin,
        activeTripId,
        activeOrgId,
        activeSpeakerData,
        speakingUids,
        room,
        sendMuteCommand,
    ]);

    return (
        <VoiceContext.Provider value={contextValue}>
            <LiveKitRoom
                room={room}
                audio={false}
                onError={(error) => {
                    console.log("LiveKit Room Error:", error);
                    if (isConnected) {
                        disconnect();
                        Alert.alert("Connection Lost", "The voice chat was disconnected due to a network error.");
                    }
                }}
            >
                {children}
                <VoiceInactivityMonitor room={room} connected={isConnected && isChannelActive === true}
                    tripId={activeTripId} orgId={activeOrgId} uid={currentUser?.uid} />
            </LiveKitRoom>
        </VoiceContext.Provider>
    );
};

export const useVoice = () => useContext(VoiceContext);
