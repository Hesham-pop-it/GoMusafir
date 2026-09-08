import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  LiveKitRoom,
  useTracks,
  useRoomContext,
  useParticipantContext,
  ParticipantContext,
  TrackReference,
  AudioSession,
  AndroidAudioTypePresets,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { Mic, MicOff, PhoneOff, Users, Volume2 } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { BlurView } from 'expo-blur';
import { setAudioModeAsync } from 'expo-audio';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

// --- Sub-component: Pulse Indicator for Speakers ---
const SpeakerPulse = ({ isSpeaking }) => {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isSpeaking) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 300 }),
          withTiming(1, { duration: 300 })
        ),
        -1,
        true
      );
    } else {
      scale.value = withTiming(1);
    }
  }, [isSpeaking]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [1, 1.2], [0, 0.4]),
  }));

  return (
    <Animated.View
      style={[
        styles.pulseCircle,
        animatedStyle,
        { backgroundColor: Colors.dark.primary },
      ]}
    />
  );
};

// --- Sub-component: Participant Tile ---
const ParticipantTile = () => {
  const participant = useParticipantContext();
  const isSpeaking = participant?.isSpeaking;

  return (
    <View style={styles.participantCard}>
      <View style={styles.avatarContainer}>
        <SpeakerPulse isSpeaking={isSpeaking} />
        <View style={[styles.avatarCircle, isSpeaking && styles.avatarCircleSpeaking]}>
          <Text style={styles.avatarText}>
            {participant.identity?.charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        {!participant.isMicrophoneEnabled && (
          <View style={styles.micOffBadge}>
            <MicOff size={10} color="white" />
          </View>
        )}
      </View>
      <Text style={styles.participantName} numberOfLines={1}>
        {participant.name || participant.identity}
      </Text>
      {isSpeaking && <Text style={styles.speakingTag}>Speaking...</Text>}
    </View>
  );
};

// --- Sub-component: Controls Bar ---
const ControlBar = ({ onDisconnect }) => {
  const room = useRoomContext();
  const [isMuted, setIsMuted] = useState(true);

  const toggleMute = async () => {
    const enabled = !isMuted;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setIsMuted(!enabled);
  };

  return (
    <BlurView intensity={30} style={styles.controlBar}>
      <TouchableOpacity
        style={[styles.controlButton, isMuted && styles.controlButtonMuted]}
        onPress={toggleMute}
      >
        {isMuted ? (
          <MicOff color="white" size={24} />
        ) : (
          <Mic color={Colors.dark.primary} size={24} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.controlButton, styles.hangupButton]}
        onPress={onDisconnect}
      >
        <PhoneOff color="white" size={24} />
      </TouchableOpacity>
    </BlurView>
  );
};

// --- Main VoiceRoom Content ---
const VoiceRoomContent = ({ onDisconnect }) => {
  const tracks = useTracks([Track.Source.Microphone]);

  return (
    <View style={styles.contentContainer}>
      <View style={styles.header}>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE VOICE</Text>
        </View>
        <View style={styles.statsContainer}>
          <Users size={16} color="#888" />
          <Text style={styles.statsText}>{tracks.length} Participants</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {tracks.map((trackRef) => (
          <ParticipantContext.Provider
            value={trackRef.participant}
            key={trackRef.participant.identity}
          >
            <ParticipantTile />
          </ParticipantContext.Provider>
        ))}
      </ScrollView>

      <ControlBar onDisconnect={onDisconnect} />
    </View>
  );
};

// --- Main Wrapper Component ---
const VoiceRoom = ({ url, token, onDisconnect }) => {
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
          interruptionMode: 'mixWithOthers',
        });

        await AudioSession.configureAudio({
          android: {
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
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
      } catch (e) {
        console.log('AudioSession setup error:', e);
      }
    };

    setupAudio();
    return () => {
      AudioSession.stopAudioSession().catch(e => console.warn('Stop AudioSession error:', e));
    };
  }, []);

  if (!url || !token) {
    return (
      <View style={styles.errorContainer}>
        <ActivityIndicator color={Colors.dark.primary} />
        <Text style={styles.errorText}>Connecting to voice server...</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={url}
      token={token}
      connect={true}
      audio={false}
      video={false}
      onDisconnected={onDisconnect}
      onError={(err) => {
        console.log('LiveKit Error:', err);
        Alert.alert('Connection Error', 'Failed to connect to voice room.');
      }}
    >
      <VoiceRoomContent onDisconnect={onDisconnect} />
    </LiveKitRoom>
  );
};

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
    backgroundColor: 'rgba(26, 30, 33, 0.95)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF4B4B',
    marginRight: 6,
  },
  liveText: {
    color: '#FF4B4B',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statsText: {
    color: '#888',
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    justifyContent: 'space-around',
  },
  participantCard: {
    width: width / 3 - 20,
    alignItems: 'center',
    marginBottom: 25,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2A3035',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 2,
  },
  avatarCircleSpeaking: {
    borderColor: Colors.dark.primary,
    borderWidth: 2,
  },
  pulseCircle: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    zIndex: 1,
  },
  avatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  participantName: {
    color: 'white',
    fontSize: 12,
    textAlign: 'center',
  },
  speakingTag: {
    color: Colors.dark.primary,
    fontSize: 8,
    marginTop: 2,
  },
  micOffBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: '#FF4B4B',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1A1E21',
    zIndex: 3,
  },
  controlBar: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(42, 48, 53, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 40,
    gap: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonMuted: {
    backgroundColor: '#FF4B4B',
  },
  hangupButton: {
    backgroundColor: '#FF4B4B',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1E21',
  },
  errorText: {
    color: '#888',
    marginTop: 15,
  },
});

export default VoiceRoom;
