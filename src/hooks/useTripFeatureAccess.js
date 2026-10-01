import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { onValue, ref } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { database, functions } from '../config/firebase';

// Display-only interpolation. Admission, transitions and shutdown remain server-owned.
export default function useTripFeatureAccess(tripId, orgId) {
    const [access, setAccess] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    const anchor = useRef(0);
    useEffect(() => {
        if (!tripId || !orgId) return;
        let stopped = false;
        let fetching = false;
        let newest = 0;
        setAccess(null);
        const accept = value => {
            if (stopped || !value || value.serverNow < newest) return;
            newest = value.serverNow;
            anchor.current = performance.now();
            setAccess(value);
            setElapsed(0);
        };
        const refresh = async () => {
            if (fetching || stopped) return;
            fetching = true;
            try { accept((await httpsCallable(functions, 'getTripFeatureAccess')({ tripId })).data); }
            catch (_) { /* Retain the last server state during a network interruption. */ }
            finally { fetching = false; }
        };
        const unsubscribe = onValue(ref(database, `trip_feature_access/${orgId}/${tripId}`), snapshot => {
            accept(snapshot.val());
        }, () => {});
        refresh();
        const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
        const poll = setInterval(refresh, 30000);
        const tick = setInterval(() => setElapsed((performance.now() - anchor.current) / 1000), 1000);
        return () => { stopped = true; unsubscribe(); appState.remove(); clearInterval(poll); clearInterval(tick); };
    }, [tripId, orgId]);
    const remainingSeconds = access ? Math.max(0, Math.ceil(access.preTripVoiceRemainingSeconds -
        (access.session?.status === 'active' && access.voiceAccess === 'PRE_TRIP_LIMITED' ? elapsed : 0))) : null;
    return { access, remainingSeconds };
}
