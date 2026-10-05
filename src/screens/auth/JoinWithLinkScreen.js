import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Image,
    Modal,
    Keyboard,
    ActivityIndicator,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import { functions, auth } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { parseInvitationCode, invitationErrorMessage } from '../../utils/invitationLink';

const ErrorIcon = () => (
    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
            stroke="#EF4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Path
            d="M12 8V12"
            stroke="#EF4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <Path
            d="M12 16H12.01"
            stroke="#EF4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

const JoinWithLinkScreen = ({ navigation, route }) => {
    const [invitationLink, setInvitationLink] = useState('');
    const [isValid, setIsValid] = useState(true);
    const [errorMsg, setErrorMsg] = useState('Invalid link. Please check the link and try again');
    const [isLoading, setIsLoading] = useState(false);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const keyboardDidShowListener = Keyboard.addListener(
            showEvent,
            () => setKeyboardVisible(true)
        );
        const keyboardDidHideListener = Keyboard.addListener(
            hideEvent,
            () => setKeyboardVisible(false)
        );

        return () => {
            keyboardDidHideListener.remove();
            keyboardDidShowListener.remove();
        };
    }, []);

    useEffect(() => {
        const code = route.params?.invitationCode;
        if (code) {
            setInvitationLink(code);
            // We need a small delay or use a separate function to ensure state is updated
            // But handleContinue can take the code directly if we refactor it slightly
            autoJoin(code);
        }
    }, [route.params?.invitationCode]);

    const autoJoin = async (code) => {
        setIsLoading(true);
        try {
            code = parseInvitationCode(code);
            if (!code) throw { code: 'invalid-argument' };
            const getMetadata = httpsCallable(functions, 'getInviteMetadata');
            const result = await getMetadata({ inviteCode: code });
            const tripDetails = result.data;
            const user = auth.currentUser;
            const alreadyJoined = tripDetails.alreadyJoined;

            if (tripDetails.isFull && !alreadyJoined && user) {
                Alert.alert("Trip Full", `Sorry, this trip has reached its maximum capacity.`, [{ text: "OK" }]);
                setIsLoading(false);
                return;
            }

            if (tripDetails.endDate) {
                const now = Date.now();
                const end = typeof tripDetails.endDate === 'number' ? tripDetails.endDate : new Date(tripDetails.endDate).getTime();
                if (now > end) {
                    setErrorMsg('invalid link, event is over');
                    setIsValid(false);
                    setIsLoading(false);
                    return;
                }
            }
            navigation.navigate('JoinEmail', { invitationCode: code, tripDetails });
        } catch (error) {
            setErrorMsg(invitationErrorMessage(error));
            setIsValid(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLinkChange = (text) => {
        setInvitationLink(text);
        setIsValid(true); // Reset error on change
    };

    const handleContinue = async () => {
        if (invitationLink.trim().length === 0) {
            setErrorMsg('Please enter your invitation link.');
            setIsValid(false);
            return;
        }

        setIsLoading(true);

        try {
            const codeInput = parseInvitationCode(invitationLink);
            if (!codeInput) throw { code: 'invalid-argument' };

            // Call getInviteMetadata
            const getMetadata = httpsCallable(functions, 'getInviteMetadata');
            const result = await getMetadata({ inviteCode: codeInput });
            // If we are here, it's valid
            const tripDetails = result.data;

            // Check if trip is full
            // logic: Only block if trip is full AND (user is logged in but NOT already a participant)
            // If user is logged out, we let them proceed to login/signup because they might be an existing participant.
            const user = auth.currentUser;
            const alreadyJoined = tripDetails.alreadyJoined;

            if (tripDetails.isFull && !alreadyJoined && user) {
                Alert.alert(
                    "Trip Full",
                    `Sorry, this trip has reached its maximum capacity of ${tripDetails.totalSeats} participants.`,
                    [{ text: "OK" }]
                );
                setIsLoading(false);
                return;
            }

            // --- End Date Check ---
            // If the end date has passed, block everyone (even existing participants)
            if (tripDetails.endDate) {
                const now = Date.now();
                const end = typeof tripDetails.endDate === 'number'
                    ? tripDetails.endDate
                    : new Date(tripDetails.endDate).getTime();

                // Add a small buffer (e.g., end of the day) if needed, 
                // but here we follow exact timestamp comparison
                if (now > end) {
                    setErrorMsg('invalid link, event is over');
                    setIsValid(false);
                    setIsLoading(false);
                    return;
                }
            }
            // --- End Check ---

            // Navigate to Join Flow Start - Now starting with Email
            navigation.navigate('JoinEmail', { invitationCode: codeInput, tripDetails });

        } catch (error) {
            console.warn('[JoinWithLink] Invitation validation failed:', error.code);
            setErrorMsg(invitationErrorMessage(error));
            setIsValid(false);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <GlowBackground>
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.content}
                >
                    <Text style={styles.title}>Join as Participant</Text>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Invitation Link</Text>
                        <View style={[styles.inputWrapper, !isValid && styles.inputWrapperError]}>
                            <TextInput
                                style={styles.input}
                                placeholder="Paste your invitation link here"
                                placeholderTextColor="#71717A"
                                value={invitationLink}
                                onChangeText={handleLinkChange}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            {!isValid && (
                                <View style={styles.errorIconWrapper}>
                                    <ErrorIcon />
                                </View>
                            )}
                        </View>
                        {!isValid && (
                            <Text style={styles.errorText}>{errorMsg}</Text>
                        )}
                    </View>

                    {/* Spacer to push button to bottom */}
                    <View style={{ flex: 1 }} />

                    <GradientBorderButton
                        text={isLoading ? "Validating..." : "Continue"}
                        onPress={handleContinue}
                        disabled={isLoading}
                        style={{ marginBottom: isKeyboardVisible ? 16 : (Platform.OS === 'ios' ? 24 : 36) }}
                    />
                </KeyboardAvoidingView>
            </SafeAreaView>
        </GlowBackground>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 30,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: -10,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 20,
    },
    title: {
        fontSize: responsiveFontSize(28),
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        marginBottom: 40
    },
    inputContainer: {
        marginBottom: 30,
    },
    label: {
        color: '#FFFBF3',
        fontSize: responsiveFontSize(14),
        marginBottom: 10,
        fontFamily: Typography.sans.regular,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#23272A',
        height: 56,
        paddingHorizontal: 16,
    },
    inputWrapperError: {
        borderColor: '#EF4444',
    },
    errorIconWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    input: {
        flex: 1,
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    copyIcon: {
        padding: 5,
    },
    errorText: {
        color: '#EF4444',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
        marginTop: 8,
        marginLeft: 4,
    },
});

export default JoinWithLinkScreen;
