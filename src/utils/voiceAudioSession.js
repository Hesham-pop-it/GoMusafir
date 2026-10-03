import { AudioSession } from '@livekit/react-native';

// Supply the complete configuration: LiveKit's default getUserMedia wrapper
// changes only the category and inherits WebRTC's other session options.
export function configureIOSVoiceAudio() {
    return AudioSession.setAppleAudioConfiguration({
        audioCategory: 'playAndRecord',
        audioMode: 'videoChat',
        audioCategoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
    });
}

export async function restoreIOSVoiceAudio() {
    await configureIOSVoiceAudio();
    await AudioSession.startAudioSession();
}

export function installVoiceMicrophoneConfiguration(mediaDevices, configure = configureIOSVoiceAudio) {
    const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.getUserMedia = async constraints => {
        if (constraints?.audio) await configure();
        return getUserMedia(constraints);
    };
}
