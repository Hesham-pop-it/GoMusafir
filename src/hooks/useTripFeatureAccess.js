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
        let heard = 0;
        setAccess(null);
        const accept = value => {
            if (stopped || !value) return;
            anchor.current = performance.now();
            setAccess(value);
            setElapsed(0);
        };
        // The server writes this node only when something changes, so the listener is the source of truth.
        // A callable answer that was overtaken by a listener value is dropped.
        const refresh = async () => {
            if (fetching || stopped) return;
            fetching = true;
            const seen = heard;
            try {
                const data = (await httpsCallable(functions, 'getTripFeatureAccess')({ tripId })).data;
                if (heard === seen) accept(data);
            }
            catch (_) { /* Retain the last server state during a network interruption. */ }
            finally { fetching = false; }
        };
        let first = true;
        const unsubscribe = onValue(ref(database, `trip_feature_access/${orgId}/${tripId}`), snapshot => {
            heard += 1;
            accept(snapshot.val());
            // A trip whose node was never written is initialised by one callable.
            if (first && !snapshot.exists()) refresh();
            first = false;
        }, () => {});
        const appState = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
        const tick = setInterval(() => setElapsed((performance.now() - anchor.current) / 1000), 1000);
        return () => { stopped = true; unsubscribe(); appState.remove(); clearInterval(tick); };
    }, [tripId, orgId]);
    const remainingSeconds = access ? Math.max(0, Math.ceil(access.preTripVoiceRemainingSeconds -
        (access.session?.status === 'active' && access.voiceAccess === 'PRE_TRIP_LIMITED' ? elapsed : 0))) : null;
    return { access, remainingSeconds };
}
