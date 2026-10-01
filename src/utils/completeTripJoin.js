import { auth, functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beginEnrollment, finishEnrollment } from './enrollmentSession';
import { fetchAppAccess, publishAppAccess } from './participantAccess';

const joins = new Map();
export async function prepareTripJoinSession() {
    beginEnrollment();
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) throw new Error('Please verify your account before joining.');
    await user.reload();
    await user.getIdToken(true);
    if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Please try again.');
    return user;
}

export function completeTripJoin(data) {
    const key = `${auth.currentUser?.uid}:${data.inviteCode}`;
    if (joins.has(key)) return joins.get(key);
    const operation = (async () => {
        const user = await prepareTripJoinSession();
        const redeem = httpsCallable(functions, 'redeemInvitation');
        let result;
        for (let attempt = 0; attempt < 2; attempt++) {
            try { result = await redeem(data); break; }
            catch (error) {
                // The backend may have committed before the response was lost.
                // Its per-user seat reservation makes the retry safe.
                if (attempt || !['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded', 'functions/aborted'].includes(error.code)) throw error;
            }
        }
        const joined = result.data;
        if (!joined?.tripId || !joined?.orgId) throw new Error('Could not confirm the joined trip. Please retry.');
        const access = joined.access || await fetchAppAccess();
        if (!access?.trips?.[joined.tripId]) throw new Error('Your trip access is still updating. Please retry.');
        if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Please try again.');
        publishAppAccess(user.uid, access);
        finishEnrollment();
        // Local housekeeping must not turn a confirmed join into a failure.
        AsyncStorage.removeItem('mfa_lock').catch(() => {});
        user.reload().catch(() => {});
        return joined;
    })();
    joins.set(key, operation);
    operation.finally(() => { if (joins.get(key) === operation) joins.delete(key); }).catch(() => {});
    return operation;
}
