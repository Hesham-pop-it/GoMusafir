import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { responsiveFontSize } from '../../utils/responsive';
import { Typography } from '../../constants/Typography';
import { auth } from '../../config/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Alert, ActivityIndicator } from 'react-native';

const ForgotPasswordScreen = () => {
    const navigation = useNavigation();
    const [email, setEmail] = useState('');
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async () => {
        if (email.trim().length === 0 || isLoading) return;
        setIsLoading(true);
        try {
            await sendPasswordResetEmail(auth, email.trim());
            navigation.navigate('ForgotPasswordVerify', { email: email.trim() });
        } catch (error) {
            console.warn("Password reset error:", error);
            let msg = "Failed to send password reset email. Please verify the email address is registered.";
            if (error.code === 'auth/user-not-found') {
                msg = "This email is not registered with us.";
            } else if (error.code === 'auth/invalid-email') {
                msg = "Please enter a valid email address.";
            }
            Alert.alert("Request Failed", msg);
        } finally {
            setIsLoading(false);
        }
    };

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

    return (
        <GlowBackground>
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1 }}
                >
                    <ScrollView 
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="interactive"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Header */}
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={22} color="#FFF" />
                        </TouchableOpacity>

                        <Text style={styles.title}>Forgot Password</Text>

                        {/* Email Input */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Business email</Text>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your business email"
                                    placeholderTextColor="#71717A"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    value={email}
                                    onChangeText={setEmail}
                                />
                            </View>
                        </View>
                    </ScrollView>

                    <View style={[
                        styles.footer,
                        {
                            paddingBottom: isKeyboardVisible ? 16 : (Platform.OS === 'ios' ? 24 : 36),
                        }
                    ]}>
                        <TouchableOpacity
                            style={[
                                styles.loginButton,
                                (email.trim().length === 0 || isLoading) && { opacity: 0.5 },
                            ]}
                            onPress={handleSend}
                            disabled={email.trim().length === 0 || isLoading}
                            activeOpacity={0.8}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.loginButtonText}>Send link</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </GlowBackground >
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 30, // Consistent with others
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: -10,
        marginBottom: 20,
    },
    title: {
        fontSize: responsiveFontSize(32),
        color: '#FFF',
        fontFamily: 'CormorantGaramond',
        marginBottom: 35,
    },
    inputGroup: {
        marginBottom: 24,
    },
    loginButton: {
        backgroundColor: '#B99A4A',
        height: 56,
        borderRadius: 28, // Fully rounded
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    label: {
        color: '#FFFBF3',
        fontSize: responsiveFontSize(14),
        fontWeight: '500',
        marginBottom: 12,
        fontFamily: 'Manrope',
    },
    inputWrapper: {
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#23272A',
    },
    input: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    footer: {
        paddingHorizontal: 24,
        // paddingBottom: 40,
        paddingTop: 10,
    },
    loginButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontWeight: 'bold',
        fontFamily: 'Manrope', // Consistent font
    }
});

export default ForgotPasswordScreen;
