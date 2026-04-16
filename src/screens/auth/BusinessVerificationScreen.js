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
    Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { responsiveFontSize } from '../../utils/responsive';
import { Typography } from '../../constants/Typography';
import { functions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';

const BusinessVerificationScreen = ({ route }) => {
    const navigation = useNavigation();
    const {
        title = "Check your business email",
        description = "We've sent a secure code to your business email. Please check your inbox.",
        targetScreen = "Home",
        buttonText = "Continue",
        resendText = "Resend Code"
    } = route?.params || {};

    const [otp, setOtp] = useState('');
    const [isError, setIsError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const inputRef = useRef(null);

    const [isKeyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
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

    const handleContinue = async () => {
        if (otp.length === 6) {
            setIsLoading(true);
            setIsError(false);
            try {
                const verifyOTP = httpsCallable(functions, 'verifyCustomEmailOTP');
                await verifyOTP({ 
                    uid: route.params?.uid,
                    otp 
                });

                // On success, handle navigation
                if (route.params?.isExistingUser) {
                    // S22: Accelerated path for existing users - Join trip immediately
                    const redeemInvite = httpsCallable(functions, 'redeemInvitation');
                    await redeemInvite({
                        inviteCode: route.params.invitationCode,
                        voiceConsent: true, // Returning users assumed to have active consent or re-grant
                        locationConsent: true,
                        // We don't have fname/lname here, but redeemInvitation now handles missing profile info gracefully
                    });

                    navigation.reset({
                        index: 0,
                        routes: [{ name: 'TripOverview', params: { ...route.params } }],
                    });
                } else {
                    // New users continue to their next signup step (e.g. JoinFirstName)
                    navigation.reset({
                        index: 0,
                        routes: [{ name: targetScreen, params: { ...route.params } }],
                    });
                }

            } catch (error) {
                console.warn("OTP Verification Error:", error);

                setIsError(true);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleResend = async () => {
        if (resendLoading || !route.params?.email) return;
        setResendLoading(true);
        try {
            const sendOTP = httpsCallable(functions, 'sendCustomEmailOTP');
            await sendOTP({ 
                email: route.params?.email, 
                uid: route.params?.uid,
                isMobile: true 
            });
            // Show toast or alert that it was sent
        } catch (error) {
            console.warn("OTP Resend Error:", error);

        } finally {
            setResendLoading(false);
        }
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
                    <ScrollView contentContainerStyle={styles.scrollContent}>
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
                    <View style={styles.footer}>
                        <GradientBorderButton
                            text={resendLoading ? "Sending..." : resendText}
                            onPress={handleResend}
                            innerBg="#1A1E21"
                            disabled={resendLoading}
                        />

                        <TouchableOpacity
                            style={[
                                styles.primaryButton,
                                (otp.length !== 6 || isLoading) && { opacity: 0.5 },
                                { marginBottom: isKeyboardVisible ? 20 : 100 }
                            ]}
                            onPress={handleContinue}
                            disabled={otp.length !== 6 || isLoading}
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
};

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
    },
    codeBoxNormal: {
        // borderColor: '#3A3A3A',
        backgroundColor: 'rgba(253, 253, 253, 0.10)',
    },
    codeBoxError: {
        borderColor: '#D66A77',
        backgroundColor: 'transparent',
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
        fontFamily: Typography.sans.bold,
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
