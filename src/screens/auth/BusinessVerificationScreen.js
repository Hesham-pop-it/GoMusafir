import { signInWithCustomToken } from 'firebase/auth';
import { beginEnrollment } from '../../utils/enrollmentSession';
import { completeTripJoin } from '../../utils/completeTripJoin';
import { verificationContinuation } from '../../utils/invitationOnboarding';
import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    TextInput,
    Pressable,
    Keyboard,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { responsiveFontSize } from '../../utils/responsive';
import { Typography } from '../../constants/Typography';
import { auth, database, functions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { ref, set, update } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeSignOut } from '../../utils/authUtils';

const BusinessVerificationScreen = ({ route }) => {
    const navigation = useNavigation();

    // Support being an initial route by falling back to auth.currentUser
    const userEmail = route?.params?.email || auth.currentUser?.email;
    const userUid = route?.params?.uid || auth.currentUser?.uid;

    const {
        title = "Check Your Email",
        description = `We’ve sent a secure code to your email. Please check your inbox.`,
        targetScreen = "Home",
        buttonText = "Continue",
        resendText = "Resend"
    } = route?.params || {};

    const [enrollmentChallenge, setEnrollmentChallenge] = useState(route?.params?.enrollmentChallenge);
    const [otp, setOtp] = useState('');
    const [isError, setIsError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendTimer, setResendTimer] = useState(route?.params?.resendDelay ?? 60);
    const inputRef = useRef(null);

    useEffect(() => {
        let interval = null;
        if (resendTimer > 0) {
            interval = setInterval(() => {
                setResendTimer((prev) => prev - 1);
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [resendTimer]);

    const [isKeyboardVisible, setKeyboardVisible] = useState(false);

    const [recoveredParams, setRecoveredParams] = useState(null);

    useEffect(() => {
        const recoverState = async () => {
            if (!route?.params?.invitationCode && !route?.params?.teamInviteToken && userUid) {

                try {
                    const { get, ref } = await import('firebase/database');
                    const snap = await get(ref(database, `users/${userUid}/join_flow_status`));
                    if (snap.exists()) {
                        setRecoveredParams(snap.val());
                    }
                } catch (e) {
                    console.log("[Verification] Recovery failed:", e);
                }
            }
        };
        recoverState();

        // Auto focus on mount
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 500);

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
            clearTimeout(timer);
            keyboardDidHideListener.remove();
            keyboardDidShowListener.remove();
        };
    }, []);

    const handleOtpChange = (value) => {
        // Only allow numbers and max 6 digits
        const numericValue = value.replace(/[^0-9]/g, '');
        if (numericValue.length <= 6) {
            setOtp(numericValue);
            setIsError(false);
        }
    };

    const enrollmentAuthenticated = useRef(false);
    const verifyingRef = useRef(false);
    const handleContinue = async () => {
        if (verifyingRef.current) return;
        if (otp.length === 6) {
            verifyingRef.current = true;
            setIsLoading(true);
            setIsError(false);
            try {
                if (enrollmentChallenge) {
                    if (!enrollmentAuthenticated.current) {
                        const complete = await httpsCallable(functions, 'completeParticipantEnrollment')({
                            challengeId: enrollmentChallenge, code: otp,
                        });
                        beginEnrollment();
                        await signInWithCustomToken(auth, complete.data.customToken);
                        enrollmentAuthenticated.current = true;
                    }
                    const joined = await completeTripJoin({
                        inviteCode: route.params.invitationCode, voiceConsent: true, locationConsent: true,
                    });
                    navigation.reset({ index: 0, routes: [{ name: 'TripOverview', params: {
                        tripId: joined.tripId, orgId: joined.orgId, isAdmin: false,
                    } }] });
                    return;
                }
                const verifyOTP = httpsCallable(functions, 'verifyCustomEmailOTP');
                await verifyOTP({
                    uid: userUid,
                    otp
                });

                // Use merged params (route or recovered)
                const activeParams = { ...recoveredParams, ...route?.params };

                // On success, handle navigation
                if (activeParams.isExistingUser) {
                    if (activeParams.isTeamInvite) {
                        const redeemInvite = httpsCallable(functions, 'redeemTeamInvitation');
                        const result = await redeemInvite({
                            token: activeParams.teamInviteToken,
                        });

                        const resData = result.data || {};
                        const newOrgId = resData.orgId;

                        // Clear security and flow flags ONLY after successful join
                        const cleanupUpdates = {};
                        cleanupUpdates[`users/${userUid}/mfa_pending`] = false;
                        cleanupUpdates[`users/${userUid}/join_flow_status`] = null;
                        await update(ref(database), cleanupUpdates);

                        // S2: Clear local security lock
                        await AsyncStorage.removeItem('mfa_lock');

                        // Navigate to Home
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Home' }],
                        });
                    } else if (activeParams.invitationCode) {
                        // S22: Accelerated path for existing users - Join trip immediately
                        const resData = await completeTripJoin({
                            inviteCode: activeParams.invitationCode,
                            voiceConsent: true, // Returning users assumed to have active consent or re-grant
                            locationConsent: true,
                        });

                        const newTripId = resData.tripId;
                        const newOrgId = resData.orgId;

                        // S22: Anchor this as the current trip and navigate
                        navigation.reset({
                            index: 0,
                            routes: [{
                                name: 'TripOverview',
                                params: {
                                    ...activeParams,
                                    tripId: newTripId,
                                    orgId: newOrgId,
                                    isAdmin: false
                                }
                            }],
                        });
                    } else {
                        // Standard business login flow (no invite code to redeem)
                        const cleanupUpdates = {};
                        cleanupUpdates[`users/${userUid}/mfa_pending`] = false;
                        cleanupUpdates[`users/${userUid}/join_flow_status`] = null;
                        await update(ref(database), cleanupUpdates);

                        // S2: Clear local security lock
                        await AsyncStorage.removeItem('mfa_lock');

                        // Navigate to Home / targetScreen
                        navigation.reset({
                            index: 0,
                            routes: [{ name: activeParams.targetScreen || targetScreen || 'Home', params: { ...activeParams } }],
                        });
                    }
                } else {
                    // For new users, clear mfa flag but keep join_flow_status active
                    const cleanupUpdates = {};
                    cleanupUpdates[`users/${userUid}/mfa_pending`] = false;
                    await update(ref(database), cleanupUpdates);

                    // S2: Clear local security lock
                    await AsyncStorage.removeItem('mfa_lock');

                    navigation.reset({
                        index: 0,
                        routes: [{ name: verificationContinuation(activeParams), params: { ...activeParams } }],
                    });
                }

            } catch (error) {
                console.warn("Verification/Join Error:", error);

                // If it's a join error (e.g. Trip Full), redirect to Welcome
                if (error.message && (error.message.includes("full") || error.message.includes("capacity"))) {
                    Alert.alert(
                        "Join Failed",
                        error.message,
                        [{ text: "OK", onPress: () => navigation.navigate('Welcome') }]
                    );
                } else {
                    // Standard OTP mismatch or network error
                    setIsError(true);
                }
            } finally {
                verifyingRef.current = false;
                setIsLoading(false);
            }
        }
    };

    const handleResend = async () => {
        if (resendLoading || resendTimer > 0 || !userEmail) return;
        setResendLoading(true);
        try {
            if (enrollmentChallenge) {
                const result = await httpsCallable(functions, 'beginParticipantEnrollment')({
                    email: userEmail, inviteCode: route.params.invitationCode,
                });
                setEnrollmentChallenge(result.data.challengeId);
                setOtp('');
                setResendTimer(60);
                return;
            }
            const sendOTP = httpsCallable(functions, 'sendCustomEmailOTP');
            await sendOTP({
                email: userEmail,
                uid: userUid,
                isMobile: true
            });
            Alert.alert("Code Sent", "A new verification code has been sent to your business email.");
            setResendTimer(60);
        } catch (error) {
            console.warn("OTP Resend Error:", error);
            const errMsg = error.message || "";
            if (error.code?.replace(/^functions\//, '') === 'resource-exhausted' || errMsg.includes('too-many-requests') || errMsg.includes('resource-exhausted')) {
                Alert.alert("Rate Limit Exceeded", "Please wait a minute before requesting another code.");
                setResendTimer(60);
            } else {
                Alert.alert("Error", error.message || "Failed to resend code. Please check your internet connection.");
            }
        } finally {
            setResendLoading(false);
        }
    };

    const getResendText = () => {
        if (resendLoading) return "Sending...";
        if (resendTimer > 0) return `Resend in ${resendTimer}s`;
        return resendText;
    };

    const renderDigit = (index) => {
        const digit = otp[index];
        return (
            <View key={index} style={styles.digitSlot}>
                {digit ? (
                    <Text style={styles.codeDigit}>{digit}</Text>
                ) : (
                    <View style={styles.dash} />
                )}
            </View>
        );
    };

    const handleBack = async () => {
        try {
            await AsyncStorage.removeItem('mfa_lock').catch(() => {});
            if (userUid) {
                await set(ref(database, `users/${userUid}/mfa_pending`), false).catch(() => {});
            }
            await safeSignOut(auth).catch(() => {});
        } catch (e) {}
        navigation.goBack();
    };

    return (
        <GlowBackground>
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.content}
                >
                    <ScrollView 
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="interactive"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Title */}
                        <Text style={styles.title}>{title}</Text>

                        <Text style={styles.description}>
                            {description}
                        </Text>

                        {/* Code Container with over-layered TextInput for reliability */}
                        <Pressable
                            style={styles.codeContainer}
                            onPress={() => inputRef.current?.focus()}
                        >
                            {/* Visual Code Input */}
                            <View style={[
                                styles.codeBox,
                                isError ? styles.codeBoxError : styles.codeBoxNormal,
                                otp.length === 0 && styles.codeBoxEmpty
                            ]}>
                                {[0, 1, 2, 3, 4, 5].map(renderDigit)}
                            </View>

                            {/* Over-layered hidden TextInput for focus handling */}
                            <TextInput
                                ref={inputRef}
                                value={otp}
                                onChangeText={handleOtpChange}
                                keyboardType="number-pad"
                                maxLength={6}
                                style={styles.hiddenInput}
                                caretHidden={true}
                                autoFocus={true} // Boost focus on load
                            />
                            {isError && <Text style={styles.errorText}>Wrong code</Text>}
                        </Pressable>

                    </ScrollView>

                    {/* Footer Buttons */}
                    <View style={[
                        styles.footer,
                        {
                            paddingBottom: isKeyboardVisible ? 16 : (Platform.OS === 'ios' ? 24 : 36),
                        }
                    ]}>
                        <GradientBorderButton
                            text={getResendText()}
                            onPress={handleResend}
                            innerBg="#1A1E21"
                            disabled={resendLoading || resendTimer > 0}
                        />

                        <TouchableOpacity
                            style={[
                                styles.primaryButton,
                                (otp.length !== 6 || isLoading) && { opacity: 0.5 },
                            ]}
                            onPress={handleContinue}
                            disabled={otp.length !== 6 || isLoading}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.primaryButtonText}>
                                {isLoading ? "Verifying..." : buttonText}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </GlowBackground>
    );
}


const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 30,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 20,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: -10,
    },
    title: {
        fontSize: responsiveFontSize(28),
        color: '#FFF',
        fontFamily: Typography.serif.regular, // Consistent font family
        marginBottom: 16,
    },
    description: {
        fontSize: responsiveFontSize(14),
        color: '#F7F7F7',
        lineHeight: 22,
        marginBottom: 40,
    },
    hiddenInput: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        opacity: 0.01, // Minimal opacity to be "visible" to system but invisible to user
        color: 'transparent',
    },

    codeContainer: {
        marginBottom: 40,
    },
    codeBox: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 54,
        height: 80,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    codeBoxNormal: {
        borderColor: 'transparent',
        backgroundColor: 'rgba(253, 253, 253, 0.10)',
    },
    codeBoxError: {
        borderColor: '#D66A77',
        backgroundColor: 'rgba(253, 253, 253, 0.10)',
    },
    codeBoxEmpty: {
        borderColor: 'transparent',
        backgroundColor: 'rgba(253, 253, 253, 0.10)',
    },
    digitSlot: {
        width: 30,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    codeDigit: {
        fontSize: responsiveFontSize(32),
        color: '#FFF',
        fontFamily: Typography.sans.semiBold,
        textAlign: 'center',
    },
    dash: {
        width: 14,
        height: 2,
        backgroundColor: '#FFF',
        borderRadius: 1,
        transform: [{ translateY: 10 }], // Adjusted to keep it at its "place" (lower than middle)
    },
    errorText: {
        color: '#D66A77',
        fontSize: responsiveFontSize(14),
        marginTop: 12,
    },
    footer: {
        paddingHorizontal: 24,
        gap: 16,
    },
    primaryButton: {
        backgroundColor: '#B99A4A',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    primaryButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontWeight: 'bold',
        fontFamily: 'Manrope',
    },
});

export default BusinessVerificationScreen;
