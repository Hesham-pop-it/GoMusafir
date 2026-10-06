import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { fetchAppAccess } from '../utils/participantAccess';
import { isAccessDeniedError } from '../utils/sessionErrors';
import { createProtectedSessionValidator } from '../utils/protectedSession';

export const protectedSession = createProtectedSessionValidator({
    auth,
    fetchAccess: fetchAppAccess,
    readMfaLock: () => AsyncStorage.getItem('mfa_lock'),
    signOut,
    isDenied: isAccessDeniedError,
});

// This also runs while a public screen is focused, so navigating back into a
// protected screen after backgrounding cannot reuse an old admission.
let previousAppState = AppState.currentState;
AppState.addEventListener('change', state => {
    if (state === 'background' || (state === 'active' && previousAppState === 'background')) {
        // Widget controls may validate in the background; that admission must
        // not skip the app's foreground revalidation either.
        protectedSession.clearAdmission();
    }
    if (state !== 'inactive') previousAppState = state;
});
