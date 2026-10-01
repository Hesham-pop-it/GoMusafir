// Shared by the sender, mobile app and native build plugin. Channel IDs are
// versioned because Android does not let an app change an existing channel sound.
const STANDARD = { channelId: 'gomusafir_standard_v1', name: 'Standard notifications', sound: 'gomusafir_standard', file: 'gomusafir_standard.wav' };
const SOS = { channelId: 'gomusafir_sos_v1', name: 'SOS & Emergency', sound: 'gomusafir_sos', file: 'gomusafir_sos.wav' };

function notificationSound(data = {}, options = {}) {
    const type = String(data.type || options.type || '').toLowerCase();
    // Emergency classification wins even if a caller supplies a normal channel.
    return ['sos', 'emergency'].includes(type) ||
        [data.androidChannelId, options.androidChannelId].some(id => id === 'Safety' || id === SOS.channelId)
        ? SOS : STANDARD;
}

module.exports = { STANDARD, SOS, notificationSound };
