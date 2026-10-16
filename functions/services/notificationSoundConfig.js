// Shared by the sender, mobile app and native build plugin. Channel IDs are
// versioned because Android does not let an app change an existing channel sound.
const STANDARD = { channelId: 'gomusafir_standard_v1', name: 'Standard notifications', sound: 'gomusafir_standard', file: 'gomusafir_standard.wav' };
const SOS = { channelId: 'gomusafir_sos_v1', name: 'SOS & Emergency', sound: 'gomusafir_sos', file: 'gomusafir_sos.wav' };
// Messages that arrive while the recipient is in a voice chat: visible, no sound.
const QUIET = { channelId: 'gomusafir_quiet_v1', name: 'Messages during voice chat', sound: null, file: null };

function notificationSound(data = {}, options = {}) {
    const type = String(data.type || options.type || '').toLowerCase();
    // Emergency classification wins even if a caller supplies a normal channel.
    if (['sos', 'emergency'].includes(type) ||
        [data.androidChannelId, options.androidChannelId].some(id => id === 'Safety' || id === SOS.channelId)) return SOS;
    return options.quiet || [data.androidChannelId, options.androidChannelId].includes(QUIET.channelId) ? QUIET : STANDARD;
}

module.exports = { STANDARD, SOS, QUIET, notificationSound };
