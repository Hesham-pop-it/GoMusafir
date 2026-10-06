import React from 'react';
import { AppState, ActivityIndicator, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { protectedSession } from '../services/protectedSessionService';

// The child (including its data subscriptions and auto-start effects) cannot
// mount until the server has accepted this session.
export function withProtectedSession(Screen) {
    return function ProtectedScreen(props) {
        const [admitted, setAdmitted] = React.useState(() => protectedSession.hasAdmission());
        useFocusEffect(React.useCallback(() => {
            let revision = 0;
            let disposed = false;
            let previousAppState = AppState.currentState;
            const check = async () => {
                const attempt = ++revision;
                if (protectedSession.hasAdmission()) {
                    setAdmitted(true);
                    return;
                }
                setAdmitted(false);
                const user = auth.currentUser;
                const valid = await protectedSession.validate();
                if (disposed || attempt !== revision) return;
                if (valid && auth.currentUser === user) setAdmitted(true);
                else props.navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            };
            const unsubscribe = onAuthStateChanged(auth, check);
            const unsubscribeInvalidation = protectedSession.subscribe(check);
            const subscription = AppState.addEventListener('change', state => {
                if (state === 'active' && previousAppState === 'background') check();
                if (state === 'background') {
                    revision++;
                    protectedSession.clearAdmission();
                    setAdmitted(false);
                }
                // Permission dialogs briefly make iOS inactive; preserve the screen.
                if (state !== 'inactive') previousAppState = state;
            });
            return () => {
                disposed = true;
                revision++;
                unsubscribe();
                unsubscribeInvalidation();
                subscription.remove();
            };
        }, [props.navigation]));
        if (!admitted || !protectedSession.hasAdmission()) {
            return (
                <View style={{ flex: 1, backgroundColor: '#1A1E21', justifyContent: 'center' }}>
                    <ActivityIndicator />
                </View>
            );
        }
        return <Screen {...props} />;
    };
}
