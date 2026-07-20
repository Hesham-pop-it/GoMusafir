import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

// Import organized screens
import WelcomeScreen from '../screens/welcome/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import HomeScreen from '../screens/home/HomeScreen';
import NotificationScreen from '../screens/notifications/NotificationScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import AudioKitsScreen from '../screens/settings/AudioKitsScreen';
import TripOverviewScreen from '../screens/trip/TripOverviewScreen';
import VoiceChatScreen from '../screens/trip/VoiceChatScreen';
import TripChatScreen from '../screens/trip/TripChatScreen';
import TripSettingsScreen from '../screens/trip/TripSettingsScreen';
import LiveLocationScreen from '../screens/trip/LiveLocationScreen';
import BusinessLoginScreen from '../screens/auth/BusinessLoginScreen';
import BusinessVerificationScreen from '../screens/auth/BusinessVerificationScreen';
import JourneyTeamScreen from '../screens/team/JourneyTeamScreen';
import InviteMemberScreen from '../screens/team/InviteMemberScreen';
import ChangePasswordScreen from '../screens/auth/ChangePasswordScreen';
import HelpSupportScreen from '../screens/support/HelpSupportScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ForgotPasswordVerifyScreen from '../screens/auth/ForgotPasswordVerifyScreen';
import ParticipantsScreen from '../screens/participants/ParticipantsScreen';
import TripParticipantsScreen from '../screens/trip/ParticipantsScreen';
import EditParticipantScreen from '../screens/trip/EditParticipantScreen';
import AlertHistoryScreen from '../screens/trip/AlertHistoryScreen';
import JourneySuccessScreen from '../screens/trip/JourneySuccessScreen';
import { VoiceProvider } from '../context/VoiceContext';


import JoinWithLinkScreen from '../screens/auth/JoinWithLinkScreen';
import ScanQrScreen from '../screens/auth/ScanQrScreen';
import {
    JoinFirstNameScreen,
    JoinLastNameScreen,
    JoinEmailScreen,
    JoinPhoneScreen,
    JoinProfilePictureScreen,
    JoinTermsScreen
} from '../screens/auth/JoinFlowScreens';

const STACK_LIMIT = 5;
let isTrimming = false;

export const navigationRef = createNavigationContainerRef();
const Stack = createNativeStackNavigator();

const webOnlyPaths = [
    'create-journey',
    'create-account',
    'payment-success',
    'payment-cancel',
    'increase-seats',
    'contact'
];

const checkAndOpenWebUrl = async (url) => {
    if (!url) return false;
    try {
        const parsed = Linking.parse(url);
        const path = parsed.path || '';
        const shouldOpenInBrowser = webOnlyPaths.some(keyword => 
            path.includes(keyword) || url.includes(keyword)
        );

        if (shouldOpenInBrowser) {
            // Dismiss existing browser to prevent duplicate stacked instances
            try {
                await WebBrowser.dismissBrowser();
            } catch (err) {
                // Ignore if there's no web browser to dismiss
            }
            await WebBrowser.openBrowserAsync(url, {
                presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
            });
            return true;
        }
    } catch (e) {
        console.error('Error checking deep link URL:', e);
    }
    return false;
};

const linking = {
    prefixes: [Linking.createURL('/'), 'https://app.gomusafir.app', 'https://www.app.gomusafir.app', 'gomusafir://'],
    async getInitialURL() {
        const url = await Linking.getInitialURL();
        if (url && await checkAndOpenWebUrl(url)) {
            return null;
        }
        return url;
    },
    subscribe(listener) {
        const onReceiveURL = async ({ url }) => {
            if (url && await checkAndOpenWebUrl(url)) {
                return;
            }
            try {
                await WebBrowser.dismissBrowser();
            } catch (err) {
                // Ignore if there's no web browser to dismiss
            }
            listener(url);
        };

        const subscription = Linking.addEventListener('url', onReceiveURL);
        return () => {
            subscription.remove();
        };
    },
    config: {
        screens: {
            JoinWithLink: 'link/:invitationCode',
            Home: 'home',
            TripOverview: 'trips',
        },
    },
};

export default function RootNavigator({ initialRouteName = "Welcome" }) {
    return (
        <VoiceProvider>
            <NavigationContainer
                ref={navigationRef}
                linking={linking}
                onStateChange={(state) => {
                    if (!state || isTrimming) return;

                    if (state.routes.length > STACK_LIMIT) {
                        isTrimming = true;
                        const newRoutes = state.routes.slice(-STACK_LIMIT);

                        // We use setTimeout to ensure the navigation transition completes 
                        // before we reset the state to trim the older routes.
                        setTimeout(() => {
                            navigationRef.current?.dispatch(
                                CommonActions.reset({
                                    ...state,
                                    routes: newRoutes,
                                    index: STACK_LIMIT - 1,
                                })
                            );
                            isTrimming = false;
                        }, 0);
                    }
                }}
            >
                <Stack.Navigator
                    initialRouteName={initialRouteName}
                    screenOptions={{
                        headerShown: false,
                    }}
                >
                    <Stack.Screen name="Welcome" component={WelcomeScreen} />
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Signup" component={SignupScreen} />
                    <Stack.Screen name="JoinWithLink" component={JoinWithLinkScreen} />
                    <Stack.Screen name="ScanQr" component={ScanQrScreen} />
                    <Stack.Screen name="JoinFirstName" component={JoinFirstNameScreen} />
                    <Stack.Screen name="JoinLastName" component={JoinLastNameScreen} />
                    <Stack.Screen name="JoinEmail" component={JoinEmailScreen} />
                    <Stack.Screen name="JoinPhone" component={JoinPhoneScreen} />
                    <Stack.Screen name="JoinProfilePicture" component={JoinProfilePictureScreen} />
                    <Stack.Screen name="JoinTerms" component={JoinTermsScreen} />
                    <Stack.Screen name="Home" component={HomeScreen} />
                    <Stack.Screen name="Notifications" component={NotificationScreen} />
                    <Stack.Screen name="Settings" component={SettingsScreen} />
                    <Stack.Screen name="AudioKits" component={AudioKitsScreen} />
                    <Stack.Screen name="TripOverview" component={TripOverviewScreen} />
                    <Stack.Screen name="VoiceChat" component={VoiceChatScreen} />
                    <Stack.Screen name="TripChat" component={TripChatScreen} />
                    <Stack.Screen name="TripSettings" component={TripSettingsScreen} />
                    <Stack.Screen name="LiveLocation" component={LiveLocationScreen} />
                    <Stack.Screen name="BusinessLogin" component={BusinessLoginScreen} />
                    <Stack.Screen name="BusinessVerification" component={BusinessVerificationScreen} />
                    <Stack.Screen name="JourneyTeam" component={JourneyTeamScreen} />
                    <Stack.Screen name="InviteMember" component={InviteMemberScreen} />
                    <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
                    <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
                    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                    <Stack.Screen name="ForgotPasswordVerify" component={ForgotPasswordVerifyScreen} />
                    <Stack.Screen name="Participants" component={ParticipantsScreen} />
                    <Stack.Screen name="TripParticipants" component={TripParticipantsScreen} />
                    <Stack.Screen name="EditParticipant" component={EditParticipantScreen} />
                    <Stack.Screen name="AlertHistory" component={AlertHistoryScreen} />
                    <Stack.Screen name="JourneySuccess" component={JourneySuccessScreen} />
                </Stack.Navigator>
            </NavigationContainer>
        </VoiceProvider>
    );
}
