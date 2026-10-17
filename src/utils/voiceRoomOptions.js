import { AudioPresets } from 'livekit-client';

// Voice is speech: the speech preset (24 kbps) with discontinuous transmission,
// so silence costs almost nothing, and no redundant audio (RED) copies.
export const VOICE_PUBLISH_DEFAULTS = { audioPreset: AudioPresets.speech, dtx: true, red: false };

// Leaving a quiet channel on its own needs a real-phone proof first (listeners
// who are asleep must not be dropped by mistake). Nothing reads this yet; it
// stays off until that proof exists.
export const LEAVE_ON_SILENCE = false;

export const voiceRoomOptions = () => ({
    audioLevelInterval: 20, // More frequent updates for more responsive UI
    publishDefaults: VOICE_PUBLISH_DEFAULTS,
});
