import { onValue, ref } from 'firebase/database';

// A trip's server-owned session is authoritative. Keep the legacy flag as a
// fallback only for trips which do not yet have a feature-access record.
export function watchVoiceChannelStatus(database, orgId, tripId, onStatus) {
    let stopped = false;
    let featuresLoaded = false;
    let legacyLoaded = false;
    let features = null;
    let legacyStarted = false;
    const publish = () => {
        if (stopped) return;
        if (!featuresLoaded) return onStatus(null);
        if (features) {
            if (features.session?.status === 'pending') return onStatus(null);
            return onStatus(features.voiceAccess !== 'EXPIRED' && features.session?.status === 'active');
        }
        onStatus(legacyLoaded ? legacyStarted : null);
    };
    onStatus(null);
    const stopFeatures = onValue(ref(database, `trip_feature_access/${orgId}/${tripId}`), snapshot => {
        featuresLoaded = true;
        features = snapshot.val();
        publish();
    }, () => { if (!stopped) onStatus(null); });
    const stopLegacy = onValue(ref(database, `trips_active/${orgId}/${tripId}/voice_channel/isChannelStarted`), snapshot => {
        legacyLoaded = true;
        legacyStarted = snapshot.val() === true;
        publish();
    }, () => { if (!features && !stopped) onStatus(null); });
    return () => { stopped = true; stopFeatures(); stopLegacy(); };
}
