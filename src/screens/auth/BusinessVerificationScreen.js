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
    const inputRef = useRef(null);

    const CORRECT_CODE = '822815';
    const WRONG_CODE_TRIGGER = '216634';

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

            // Check for specific demo triggers
            if (numericValue === WRONG_CODE_TRIGGER) {
                setIsError(true);
            } else {
                setIsError(false);
            }
        }
    };

    const handleContinue = () => {
        if (otp.length === 6) {
            navigation.reset({
                index: 0,
                routes: [{ name: targetScreen, params: { ...route.params } }],
            });
        }
    };

    const renderDigit = (index) => {
        const digit = otp[index];
        if (!digit) {
            return <View key={index} style={styles.dash} />;
        }
        return <Text key={index} style={styles.codeDigit}>{digit}</Text>;
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

                        {/* Hidden TextInput for OTP handling */}
                        <TextInput
                            ref={inputRef}
                            value={otp}
                            onChangeText={handleOtpChange}
                            keyboardType="number-pad"
                            maxLength={6}
                            style={styles.hiddenInput}
                            caretHidden={true}
                        />

                        {/* Visual Code Input */}
                        <Pressable
                            style={styles.codeContainer}
                            onPress={() => inputRef.current?.focus()}
                        >
                            <View style={[
                                styles.codeBox,
                                isError ? styles.codeBoxError : styles.codeBoxNormal,
                                otp.length === 0 && styles.codeBoxEmpty
                            ]}>
                                {[0, 1, 2, 3, 4, 5].map(renderDigit)}
                            </View>
                            {isError && <Text style={styles.errorText}>Wrong code</Text>}
                        </Pressable>
                    </ScrollView>

                    {/* Footer Buttons */}
                    <View style={styles.footer}>
                        <GradientBorderButton
                            text={resendText}
                            onPress={() => { }}
                            innerBg="#1A1E21"
                        />

                        <TouchableOpacity
                            style={[
                                styles.primaryButton,
                                otp.length !== 6 && { opacity: 0.5 },
                                { marginBottom: isKeyboardVisible ? 0 : 100 }
                            ]}
                            onPress={handleContinue}
                            disabled={otp.length !== 6}
                        >
                            <Text style={styles.primaryButtonText}>{buttonText}</Text>
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
        fontFamily: 'CormorantGaramond_700Bold', // Consistent font family
        marginBottom: 16,
    },
    description: {
        fontSize: responsiveFontSize(14),
        color: '#9BA1A6',
        lineHeight: 22,
        marginBottom: 40,
    },
    hiddenInput: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
    },
    codeContainer: {
        marginBottom: 40,
    },
    codeBox: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 24,
        paddingHorizontal: 30,
        minHeight: 90,
    },
    codeBoxNormal: {
        borderColor: '#3A3A3A',
        backgroundColor: '#23272A',
    },
    codeBoxError: {
        borderColor: '#FF7D7D',
        backgroundColor: 'transparent',
    },
    codeBoxEmpty: {
        borderColor: 'transparent',
        backgroundColor: '#23272A',
    },
    codeDigit: {
        fontSize: responsiveFontSize(32),
        color: '#FFF',
        fontWeight: '500',
        width: 25,
        textAlign: 'center',
    },
    dash: {
        width: 14,
        height: 2,
        backgroundColor: '#FFF',
        borderRadius: 1,
    },
    errorText: {
        color: '#FF7D7D',
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
