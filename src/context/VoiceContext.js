import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { database, functions, auth } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, onValue, update, get, onDisconnect } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { setAudioModeAsync } from 'expo-audio';
import { 
    AudioSession, 
    AndroidAudioTypePresets,
    LiveKitRoom
} from '@livekit/react-native';
import { Alert, Platform, PermissionsAndroid } from 'react-native';

import { Room } from 'livekit-client';
import { onAuthStateChanged } from 'firebase/auth';
import { MyWidget, MyLiveActivity } from '../components/Widget';
import { addUserInteractionListener } from 'expo-widgets';

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

export const VoiceProvider = ({ children }) => {
    const [connectionDetails, setConnectionDetails] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isChannelActive, setIsChannelActive] = useState(null); // null means loading
    const [isGlobalMuteActive, setIsGlobalMuteActive] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeTripId, setActiveTripId] = useState(null);
    const [activeOrgId, setActiveOrgId] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    
    const isFetchingToken = useRef(false);
    const activeActivity = useRef(null);
    const room = useRef(new Room({
        audioLevelInterval: 20, // More frequent updates for more responsive UI
    })).current;

    // Handle room disconnection events
    useEffect(() => {
        const handleRoomDisconnected = () => {
            setIsConnected(false);
            setConnectionDetails(null);
        };

        const onDataReceived = (payload, participant) => {
            try {
                const str = uint8ArrayToString(payload);
                const data = JSON.parse(str);
                
                if (data.targetIdentity === auth.currentUser?.uid) {
                    if (data.type === 'mute') {
                        setIsMuted(true);
                    } else if (data.type === 'unmute') {
                        setIsMuted(false);
                    }
                }
            } catch (e) {
                // Silently fail on non-JSON or malformed data
            }
        };

        room.on('disconnected', handleRoomDisconnected);
        room.on('dataReceived', onDataReceived);

        // Auto-disconnect on Logout
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            if (!user && isConnected) {
                disconnect();
            }
        });

        return () => {
            room.off('disconnected', handleRoomDisconnected);
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

        const voiceRef = ref(database, `trips_active/${orgIdToUse}/${tripIdToUse}/voice_channel`);
        const unsubscribe = onValue(voiceRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setIsChannelActive(data.isChannelStarted ?? false);
                setIsGlobalMuteActive(data.isAllMuted ?? false);
            } else {
                setIsChannelActive(false);
                setIsGlobalMuteActive(false);
            }
        });

        return () => unsubscribe();
    }, [activeTripId, activeOrgId]);

    const prevGlobalMute = useRef(null);

    // Force mute/unmute when global mute state changes (only for participants, not admin/organizers)
    useEffect(() => {
        if (isAdmin) return; // Admins are never force-muted globally

        if (prevGlobalMute.current !== null && prevGlobalMute.current !== isGlobalMuteActive) {
            setIsMuted(isGlobalMuteActive);
        } else if (prevGlobalMute.current === null && isGlobalMuteActive) {
            setIsMuted(true);
        }
        prevGlobalMute.current = isGlobalMuteActive;
    }, [isGlobalMuteActive, isAdmin]);

    // Sync local mute state with hardware
    useEffect(() => {
        if (room?.localParticipant && isConnected) {
            room.localParticipant.setMicrophoneEnabled(!isMuted).catch(err => {
                console.log("Failed to sync mic state:", err);
            });
        }
    }, [isMuted, room, isConnected]);

    // Session Persistence & Auto-Reconnect
    useEffect(() => {
        const checkPersistedSession = async () => {
            try {
                const sessionStr = await AsyncStorage.getItem('@voice_session');
                if (sessionStr) {
                    const session = JSON.parse(sessionStr);
                    // Only restore if we are not already connected to something else
                    if (!isConnected && !loading && session.tripId && session.orgId) {
                        setActiveTripId(session.tripId);
                        setActiveOrgId(session.orgId);
                        setIsAdmin(session.isAdmin || false);
                        
                        // If we restored a session, we'll wait for isChannelActive to become true 
                        // and then auto-connect in the next effect.
                    }
                }
            } catch (e) {}
        };
        checkPersistedSession();
    }, []);

    // Trigger Auto-Connect when channel becomes active
    useEffect(() => {
        const autoConnect = async () => {
            if (isChannelActive === true && !isConnected && !loading && activeTripId && activeOrgId) {
                const sessionStr = await AsyncStorage.getItem('@voice_session');
                if (sessionStr) {
                    const session = JSON.parse(sessionStr);
                    if (session.tripId === activeTripId && session.autoReconnect) {
                        connect(activeTripId, activeOrgId, isAdmin);
                    }
                }
            }
        };
        autoConnect();
    }, [isChannelActive, isConnected, loading, activeTripId]);

    // Widget Synchronization
    useEffect(() => {
        try {
            MyWidget.updateSnapshot({
                isAdmin,
                isConnected,
                isChannelActive: isChannelActive ?? false,
                isGlobalMuteActive,
                isMuted,
                activeChannelName: activeTripId ? `Trip Voice Room` : "No Channel",
            });
        } catch (e) {
            console.log("[VoiceContext] Failed to update widget snapshot:", e);
        }
    }, [isAdmin, isConnected, isChannelActive, isGlobalMuteActive, isMuted, activeTripId]);

    // Listen to Widget interactions
    useEffect(() => {
        const subscription = addUserInteractionListener(async (event) => {
            if (event.source !== 'MyWidget' && event.source !== 'MyLiveActivity') return;
            console.log("[VoiceContext] Widget interaction received:", event.source, event.target);
            
            const target = event.target;
            try {
                if (target === 'join_channel') {
                    if (activeTripId && activeOrgId) {
                        await connect(activeTripId, activeOrgId, isAdmin);
                    }
                } else if (target === 'leave_channel') {
                    await disconnect();
                } else if (target === 'mute_myself') {
                    setIsMuted(prev => !prev);
                } else if (target === 'mute_channel') {
                    if (activeTripId && activeOrgId && isAdmin) {
                        const nextState = !isGlobalMuteActive;
                        await update(ref(database, `trips_active/${activeOrgId}/${activeTripId}/voice_channel`), {
                            isAllMuted: nextState
                        });
                    }
                } else if (target === 'stop_channel') {
                    if (activeTripId && activeOrgId && isAdmin) {
                        await stopChannel(isAdmin, activeTripId, activeOrgId);
                    }
                } else if (target === 'hold_to_talk') {
                    setIsMuted(prev => !prev);
                }
            } catch (e) {
                console.error("[VoiceContext] Widget action failed:", e);
            }
        });

        return () => subscription.remove();
    }, [activeTripId, activeOrgId, isAdmin, isGlobalMuteActive, connect, disconnect, stopChannel]);

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

        if (isFetchingToken.current || (isConnected && activeTripId === tripId)) return;
        
        // If switching trips, disconnect first
        if (isConnected && activeTripId !== tripId) {
            await disconnect();
        }

        setActiveTripId(tripId);
        setActiveOrgId(orgId);
        setIsAdmin(isStaff);

        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
            Alert.alert("Permission Required", "Microphone access is required to use voice chat.");
            return;
        }

        try {
            isFetchingToken.current = true;
            setLoading(true);

            // Audio Setup
            try {
                await setAudioModeAsync({
                    allowsRecording: true,
                    playsInSilentMode: true,
                    shouldPlayInBackground: true,
                    shouldRouteThroughEarpiece: false,
                    interruptionMode: 'mixWithOthers',
                });
                await AudioSession.configureAudio({
                    android: { audioTypeOptions: AndroidAudioTypePresets.communication },
                    ios: { 
                        defaultOutput: 'speaker',
                        category: 'playAndRecord',
                        mode: 'voiceChat',
                        categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'allowBluetoothA2DP']
                    },
                });
                if (Platform.OS === 'ios') {
                    await AudioSession.setAppleAudioConfiguration({
                        audioCategory: 'playAndRecord',
                        audioMode: 'voiceChat',
                        audioCategoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'allowBluetoothA2DP', 'mixWithOthers']
                    });
                }
                await AudioSession.startAudioSession();
                await AudioSession.setDefaultRemoteAudioTrackVolume(1.0);
            } catch (e) {
                console.log("Audio setup error:", e);
            }

            // Admin Start Logic (Pre-emptively update DB to avoid race conditions)
            console.log("[VoiceContext] connect called with:", { tripId, orgId, isStaff });
            if (isStaff && !isChannelActive) {
                console.log("[VoiceContext] Toggling channel status to true for tripId:", tripId);
                const toggle = httpsCallable(functions, 'toggleChannelStatus');
                await toggle({ tripId, active: true });
                
                await update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                    isChannelStarted: true,
                    isAllMuted: false,
                    adminMuted: false
                });
            }

            const generateToken = httpsCallable(functions, 'generateLiveKitToken');
            const { data } = await generateToken({ tripId });

            if (data?.token && data?.url) {
                setConnectionDetails({
                    token: data.token,
                    url: data.url
                });
                
                // Connect the persistent room object
                await room.connect(data.url, data.token);
                setIsConnected(true);

                // If staff (host), register presence in active_hosts
                if (isStaff && auth.currentUser) {
                    const myHostRef = ref(database, `trips_active/${orgId}/${tripId}/voice_channel/active_hosts/${auth.currentUser.uid}`);
                    onDisconnect(myHostRef).remove();
                    await update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/active_hosts`), {
                        [auth.currentUser.uid]: true
                    });
                }

                // Persist session
                await AsyncStorage.setItem('@voice_session', JSON.stringify({
                    tripId,
                    orgId,
                    isAdmin: isStaff,
                    autoReconnect: true
                }));

                // Start Live Activity
                if (MyLiveActivity) {
                    try {
                        const widgetEnabled = await AsyncStorage.getItem('@lockscreen_widget_enabled');
                        if (widgetEnabled !== 'false') {
                            const instances = MyLiveActivity.getInstances();
                            if (instances.length > 0) {
                                activeActivity.current = instances[0];
                                activeActivity.current.update({
                                    tripName: `Trip Voice Room`,
                                    status: isStaff ? "Hosting" : "Connected",
                                    startTime: Date.now(),
                                    isAdmin: isStaff
                                });
                            } else {
                                activeActivity.current = MyLiveActivity.start({
                                    tripName: `Trip Voice Room`,
                                    status: isStaff ? "Hosting" : "Connected",
                                    startTime: Date.now(),
                                    isAdmin: isStaff
                                }, `gomusafir://voicechat?tripId=${tripId}`);
                            }
                        } else {
                            // If widget is disabled, make sure any remaining live activity is ended
                            const instances = MyLiveActivity.getInstances();
                            instances.forEach(instance => instance.end('immediate'));
                            activeActivity.current = null;
                        }
                    } catch (e) {
                        console.log("[VoiceContext] Live Activity start failed:", e);
                    }
                }
            } else {
                throw new Error("Failed to receive connection details from server.");
            }
        } catch (error) {
            let msg = error.message || "Failed to connect to the voice chat service.";
            if (error.code === 'failed-precondition') {
                msg = "The channel has not been started by the organizer yet.";
            } else if (msg.toLowerCase().includes('network request failed')) {
                msg = "Network request failed. Please check your internet connection and try again.";
            }
            
            Alert.alert("Voice Chat Error", msg);
            setActiveTripId(null);
            setActiveOrgId(null);
        } finally {
            setLoading(false);
            isFetchingToken.current = false;
        }
    };

    const disconnect = async () => {
        try {
            // Remove session first to prevent auto-reconnect loop
            await AsyncStorage.removeItem('@voice_session');
            setIsConnected(false);
            setConnectionDetails(null);

            // Clean up presence in database if we are host
            if (activeTripId && activeOrgId && auth.currentUser && isAdmin) {
                const myHostRef = ref(database, `trips_active/${activeOrgId}/${activeTripId}/voice_channel/active_hosts/${auth.currentUser.uid}`);
                await onDisconnect(myHostRef).cancel();
                await update(ref(database, `trips_active/${activeOrgId}/${activeTripId}/voice_channel/active_hosts`), {
                    [auth.currentUser.uid]: null
                });
            }

            if (activeActivity.current) {
                try {
                    activeActivity.current.end('immediate');
                } catch (e) {
                    console.log("[VoiceContext] Live Activity end failed:", e);
                }
                activeActivity.current = null;
            }

            await room.disconnect();
            await AudioSession.stopAudioSession();
        } catch (e) {
            console.log("Disconnect error:", e);
        }
    };

    const stopChannel = async (forceAdmin = null, forceTripId = null, forceOrgId = null) => {
        const tripIdToStop = forceTripId !== null ? forceTripId : activeTripId;
        const orgIdToStop = forceOrgId !== null ? forceOrgId : activeOrgId;
        const isUserAdmin = forceAdmin !== null ? forceAdmin : isAdmin;
        console.log("[VoiceContext] stopChannel called with:", { forceAdmin, forceTripId, forceOrgId, tripIdToStop, orgIdToStop, isUserAdmin });

        if (isUserAdmin && tripIdToStop && orgIdToStop) {
            try {
                console.log("[VoiceContext] Toggling channel status to false for tripId:", tripIdToStop);
                const toggle = httpsCallable(functions, 'toggleChannelStatus');
                await toggle({ tripId: tripIdToStop, active: false });
                
                await update(ref(database, `trips_active/${orgIdToStop}/${tripIdToStop}/voice_channel`), {
                    isChannelStarted: false
                });
                setIsChannelActive(false);
                setIsGlobalMuteActive(false);
            } catch (e) {
                console.log("Stop channel error:", e);
                Alert.alert("Error", "Failed to stop the channel. Please check your connection.");
            }
        } else {
            console.log("[VoiceContext] stopChannel skipping database write due to missing parameters or admin privileges:", { isUserAdmin, tripIdToStop, orgIdToStop });
        }
        await disconnect();
    };

    return (
        <VoiceContext.Provider value={{ 
            isConnected, 
            connectionDetails, 
            isChannelActive, 
            isGlobalMuteActive, 
            isMuted, 
            setIsMuted,
            loading,
            connect,
            disconnect,
            stopChannel,
            setActiveTrip: (tripId, orgId) => {
                setActiveTripId(tripId);
                setActiveOrgId(orgId);
            },
            isAdmin,
            activeTripId,
            activeOrgId,
            room, // Expose the room object if needed
            sendMuteCommand: async (targetIdentity, muteState = true) => {
                if (!room || !isConnected) return;
                try {
                    const data = stringToUint8Array(JSON.stringify({
                        type: muteState ? 'mute' : 'unmute',
                        targetIdentity: targetIdentity
                    }));
                    await room.localParticipant.publishData(data, {
                        destinationIdentities: [targetIdentity]
                    });
                } catch (e) {
                    console.log("Error sending mute/unmute command:", e);
                    Alert.alert("Action Failed", `Could not send ${muteState ? 'mute' : 'unmute'} command. Please check your connection.`);
                }
            }
        }}>
            <LiveKitRoom
                room={room}
                audio={true}
                onError={(error) => {
                    console.log("LiveKit Room Error:", error);
                    if (isConnected) {
                        disconnect();
                        Alert.alert("Connection Lost", "The voice chat was disconnected due to a network error.");
                    }
                }}
            >
                {children}
            </LiveKitRoom>
        </VoiceContext.Provider>
    );
};

export const useVoice = () => useContext(VoiceContext);
