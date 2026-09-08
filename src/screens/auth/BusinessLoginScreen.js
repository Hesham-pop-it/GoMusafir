import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Keyboard,
    ActivityIndicator,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import { responsiveFontSize } from '../../utils/responsive';
import GlowBackground from '../../components/GlowBackground';
import { Typography } from '../../constants/Typography';
import { auth, database, functions } from '../../config/firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, set } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';

import AsyncStorage from '@react-native-async-storage/async-storage';

const BusinessLoginScreen = () => {
    const navigation = useNavigation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

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

    const isFormValid = email.trim().length > 0 && password.trim().length > 0 && !isLoading;

    const handleLogin = async () => {
        if (!isFormValid) return;
        setIsLoading(true);
        try {
            // Pre-check: Verify if account is a business/staff account before signing in
            try {
                const checkUser = httpsCallable(functions, 'checkUserExistence');
                const result = await checkUser({ email: email.trim().toLowerCase() });
                if (result.data?.exists && result.data?.isStaff === false) {
                    Alert.alert("Access Denied", "This account is registered as a participant. Please log in using the 'Join as Participant' flow.");
                    setIsLoading(false);
                    return;
                }
            } catch (checkErr) {
                // If cloud pre-check is unavailable, fallback to post-sign-in RBAC verification below
                console.log("[BusinessLogin] Pre-check fallback:", checkErr?.message);
            }

            const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                await signOut(auth);
                await AsyncStorage.removeItem('mfa_lock').catch(() => {});
                Alert.alert("Email Not Verified", "Please verify your email address before logging in.");
                setIsLoading(false);
                return;
            }

            // RBAC: Check if user has business/staff access
            // S6: Role-Based Access Control - Double check both database and Custom Claims
            const userRef = ref(database, `users/${user.uid}`);
            const userSnap = await get(userRef);
            const userData = userSnap.val();

            const idTokenResult = await user.getIdTokenResult(true);
            const role = idTokenResult.claims.role;
            const hasStaffAccess = !!userData?.staff_org_id || ['admin', 'co-host', 'manager'].includes(role);

            if (!hasStaffAccess) {
                await signOut(auth);
                await AsyncStorage.removeItem('mfa_lock').catch(() => {});
                Alert.alert("Access Denied", "This account is registered as a participant. Please log in using the 'Join as Participant' flow.");
                setIsLoading(false);
                return;
            }

            // MFA: Trigger OTP for every business login
            // S2: Mandatory Multi-Factor Authentication
            try {
                // S2: Set a local lock to prevent App.js from flickering to Home screen
                await AsyncStorage.setItem('mfa_lock', 'true');
                // Set MFA pending flag to prevent App.js from auto-routing to Home
                await set(ref(database, `users/${user.uid}/mfa_pending`), true);

                const sendOTP = httpsCallable(functions, 'sendCustomEmailOTP');
                await sendOTP({ email: email.trim(), uid: user.uid, isMobile: true });

                navigation.navigate('BusinessVerification', {
                    title: "Check your business email",
                    description: `We’ve sent a secure code to your email. Please check your inbox.`,
                    targetScreen: 'Home',
                    email: email.trim(),
                    uid: user.uid,
                    isExistingUser: true
                });
            } catch (otpError) {
                Alert.alert("Verification Failed", "Could not send verification code. Please try again.");
                await signOut(auth);
                await AsyncStorage.removeItem('mfa_lock').catch(() => {});
            }

        } catch (error) {
            await AsyncStorage.removeItem('mfa_lock').catch(() => {});
            let message = "Invalid email or password.";
            switch (error.code) {
                case 'auth/invalid-email':
                    message = "Please enter a valid email address.";
                    break;
                case 'auth/user-disabled':
                    message = "This user account has been disabled.";
                    break;
                case 'auth/user-not-found':
                    message = "No account found with this email.";
                    break;
                case 'auth/wrong-password':
                    message = "Incorrect password. Please try again.";
                    break;
                case 'auth/invalid-credential':
                    message = "Invalid email or password.";
                    break;
                case 'auth/too-many-requests':
                    message = "Too many unsuccessful login attempts. Please try again later.";
                    break;
                case 'auth/network-request-failed':
                    message = "Network error. Please check your internet connection.";
                    break;
                default:
                    if (error.message) {
                        message = error.message;
                    }
                    break;
            }
            Alert.alert("Login Failed", message);
        } finally {
            setIsLoading(false);
        }
    };

    // Eye SVG Icon Component
    const EyeIcon = () => (
        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <G clipPath="url(#clip0_1369_1914)">
                <Path d="M9.342 18.7821L7.411 18.2641L8.198 15.3251C7.01997 14.8906 5.92512 14.2575 4.961 13.4531L2.808 15.6071L1.393 14.1921L3.547 12.0391C2.33107 10.5829 1.51409 8.83587 1.176 6.96911L3.144 6.61011C3.903 10.8121 7.579 14.0001 12 14.0001C16.42 14.0001 20.097 10.8121 20.856 6.61011L22.824 6.96811C22.4864 8.83512 21.6697 10.5825 20.454 12.0391L22.607 14.1921L21.192 15.6071L19.039 13.4531C18.0749 14.2575 16.98 14.8906 15.802 15.3251L16.589 18.2651L14.658 18.7821L13.87 15.8421C12.6324 16.0542 11.3676 16.0542 10.13 15.8421L9.342 18.7821Z" fill="#71717A" />
            </G>
            <Defs>
                <ClipPath id="clip0_1369_1914">
                    <Rect width="24" height="24" fill="white" />
                </ClipPath>
            </Defs>
        </Svg>
    );

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
                    <ScrollView 
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="interactive"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Title */}
                        <Text style={styles.title}>Log in with your business account</Text>

                        {/* Form */}
                        <View style={styles.form}>
                            {/* Company Name */}
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>Business email</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter your business email"
                                        placeholderTextColor="#71717A"
                                        value={email}
                                        onChangeText={setEmail}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />
                                </View>
                            </View>

                            {/* Password */}
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>Password</Text>
                                <View style={styles.inputWrapper}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter your password"
                                        placeholderTextColor="#71717A"
                                        secureTextEntry={!isPasswordVisible}
                                        value={password}
                                        onChangeText={setPassword}
                                    />
                                    <TouchableOpacity
                                        onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                                        style={styles.eyeIcon}
                                    >
                                        {isPasswordVisible ? (
                                            <Ionicons name="eye-off-outline" size={24} color="#71717A" />
                                        ) : (
                                            <EyeIcon />
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Forgot Password */}
                            <TouchableOpacity
                                style={styles.forgotPassword}
                                onPress={() => navigation.navigate('ForgotPassword')}
                            >
                                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>

                    {/* Login Button - Inside KeyboardAvoidingView to stay fixed above keyboard */}
                    <View style={[
                        styles.footer,
                        {
                            paddingBottom: isKeyboardVisible ? 16 : (Platform.OS === 'ios' ? 24 : 36),
                        }
                    ]}>
                        <TouchableOpacity
                            style={[styles.loginButton, (!isFormValid || isLoading) && { opacity: 0.5 }]}
                            onPress={handleLogin}
                            disabled={!isFormValid || isLoading}
                            activeOpacity={0.8}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.loginButtonText}>Log in</Text>
                            )}
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
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: -10,
    },
    content: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 20,
    },
    title: {
        fontSize: responsiveFontSize(28),
        color: '#FFF',
        fontFamily: 'CormorantGaramond',
        marginBottom: 40,
        lineHeight: 36,
    },
    form: {
        gap: 24,
    },
    inputContainer: {
        marginBottom: 0,
    },
    label: {
        color: '#FFFBF3',
        fontSize: responsiveFontSize(14),
        marginBottom: 10,
        fontFamily: 'Manrope',
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
    input: {
        flex: 1,
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    eyeIcon: {
        padding: 5,
    },
    forgotPassword: {
        alignSelf: 'flex-end',
    },
    forgotPasswordText: {
        color: '#B99A4A',
        fontSize: responsiveFontSize(14),
        fontWeight: '500',
    },
    footer: {
        paddingHorizontal: 24,
        paddingTop: 8,
        backgroundColor: 'transparent',
    },
    loginButton: {
        backgroundColor: '#B99A4A',
        height: 56,
        borderRadius: 28, // Fully rounded
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    loginButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
    },
});

export default BusinessLoginScreen;
