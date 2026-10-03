import { createAudioPlayer } from 'expo-audio';
import { notificationSound, SOS } from '../../functions/services/notificationSoundConfig';

const sources = {
    gomusafir_standard: require('../../assets/sounds/gomusafir_standard.wav'),
    gomusafir_sos: require('../../assets/sounds/gomusafir_sos.wav'),
};
let current = null;

export function stopNotificationSound() {
    const previous = current;
    current = null;
    if (!previous) return;
    clearTimeout(previous.timer);
    previous.subscription?.remove();
    previous.player.remove();
}

export function playNotificationSound(notification) {
    const profile = notificationSound(notification);
    // A normal update must never interrupt a currently playing SOS.
    if (current?.sound === SOS.sound && profile.sound !== SOS.sound) return;
    stopNotificationSound();
    try {
        // Expo otherwise deactivates the shared iOS audio session when this
        // effect finishes, silencing an ongoing LiveKit call as well.
        const player = createAudioPlayer(sources[profile.sound], { keepAudioSessionActive: true });
        const entry = { player, sound: profile.sound };
        current = entry;
        const cleanup = () => { if (current === entry) stopNotificationSound(); };
        entry.subscription = player.addListener('playbackStatusUpdate', status => {
            if (status.didJustFinish) cleanup();
        });
        entry.timer = setTimeout(cleanup, 10000);
        player.play();
    } catch (error) {
        stopNotificationSound();
        console.warn('[Notification] Unable to play sound', error);
    }
}
