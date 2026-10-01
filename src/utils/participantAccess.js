import { AppState } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { onValue, ref } from 'firebase/database';
import { database, functions } from '../config/firebase';
import { isAccessDeniedError } from './sessionErrors';
import { isEnrolling } from './enrollmentSession';

const accessListeners = new Set();
export function onAppAccessPublished(listener) {
    accessListeners.add(listener);
    return () => accessListeners.delete(listener);
}
export function publishAppAccess(uid, access) {
    for (const listener of accessListeners) listener(uid, access);
}

export async function fetchAppAccess() {
    const result = await httpsCallable(functions, 'getAppAccess')();
    return result.data;
}

export function watchParticipantAccess(user, deny, onAccess = () => {}) {
    let stopped = false;
    let inFlight = false;
    let timer;
    let access;
    let offset = 0;
    let hadAccess = false;
    let authTime = 0;
    let identityKnown = false;
    let staffIdentity = false;
    let accessVerified = false;
    const handleFailure = error => {
        // An unavailable entitlement service cannot prove that access ended.
        if (!stopped && isAccessDeniedError(error)) deny();
    };
    const check = () => {
        if (stopped || !access || !identityKnown) return;
        clearTimeout(timer);
        if (authTime && access.revoked_before > authTime) { deny(); return; }
        if (access.staff) return;
        // A persisted participant record may predate a promotion to staff.
        // Wait for the canonical response before applying trip restrictions.
        if (staffIdentity && !accessVerified) return;
        const remaining = access.expires_at - (Date.now() + offset);
        if (remaining <= 0) {
            // Once admitted, an enrollment UI flag cannot preserve a session.
            if (hadAccess || !isEnrolling()) deny();
            return;
        }
        hadAccess = true;
        onAccess(access);
        timer = setTimeout(check, Math.min(remaining + 10, 2147483647));
    };
    const applyAccess = latest => {
        if (stopped || !latest) return;
        // A pre-join RPC/cache snapshot must not overwrite a newer membership grant.
        if (Number.isFinite(access?.version) && Number.isFinite(latest.version) && latest.version < access.version) return;
        access = latest;
        check();
    };
    const onPublishedAccess = (uid, latest) => { if (uid === user.uid) applyAccess(latest); };
    accessListeners.add(onPublishedAccess);
    const refresh = async () => {
        if (stopped || inFlight) return;
        inFlight = true;
        try {
            const claims = (await user.getIdTokenResult()).claims;
            authTime = claims.auth_time;
            staffIdentity = ['admin', 'co-host', 'manager'].includes(claims.role);
            identityKnown = true;
            const latest = await fetchAppAccess();
            if (!stopped) { accessVerified = true; applyAccess(latest); }
        } catch (error) {
            handleFailure(error);
        } finally { inFlight = false; }
    };
    const unsubscribeOffset = onValue(ref(database, '.info/serverTimeOffset'), snapshot => {
        offset = snapshot.val() || 0;
        check();
    });
    const unsubscribe = onValue(ref(database, `app_access/${user.uid}`), snapshot => {
        if (!snapshot.exists()) return; // First login provisions the record below.
        applyAccess(snapshot.val());
    }, handleFailure);
    const unsubscribeConnection = onValue(ref(database, '.info/connected'), snapshot => {
        if (snapshot.val() === true) refresh();
    });
    const appState = AppState.addEventListener('change', state => {
        if (state === 'active') { check(); refresh(); }
    });
    const interval = setInterval(() => { check(); refresh(); }, 30000);
    refresh();
    return () => {
        stopped = true;
        accessListeners.delete(onPublishedAccess);
        clearTimeout(timer);
        clearInterval(interval);
        unsubscribe();
        unsubscribeOffset();
        unsubscribeConnection();
        appState.remove();
    };
}
