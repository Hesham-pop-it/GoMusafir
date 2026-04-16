import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { responsiveFontSize } from '../../utils/responsive';
import { Typography } from '../../constants/Typography';
import { auth } from '../../config/firebase';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { Alert } from 'react-native';

const ChangePasswordScreen = () => {
    const navigation = useNavigation();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Error states
    const [currentPasswordError, setCurrentPasswordError] = useState('');
    const [newPasswordError, setNewPasswordError] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const validatePassword = (pwd) => {
        // S3: Strong password policy - at least 8 chars, 1 number, 1 uppercase
        const hasNumber = /\d/;
        const hasUpper = /[A-Z]/;
        if (pwd.length < 8) return "Must be at least 8 characters.";
        if (!hasNumber.test(pwd)) return "Must contain at least 1 number.";
        if (!hasUpper.test(pwd)) return "Must contain at least 1 uppercase letter.";
        return "";
    };

    const handleSaveChanges = async () => {
        let hasError = false;
        if (!currentPassword) {
            setCurrentPasswordError('Current password is required');
            hasError = true;
        }

        const pwdError = validatePassword(newPassword);
        if (pwdError) {
            setNewPasswordError(pwdError);
            hasError = true;
        }

        if (newPassword && newPassword !== confirmPassword) {
            setConfirmPasswordError('Passwords do not match');
            hasError = true;
        }

        if (hasError) return;

        setIsLoading(true);
        try {
            const user = auth.currentUser;
            if (!user || (!user.email && !user.phoneNumber)) throw new Error("User not authenticated properly.");

            // Re-authenticate (S3/S7)
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            // Update Password via Firebase
            await updatePassword(user, newPassword);

            Alert.alert("Success", "Your password has been changed successfully.", [
                { text: "OK", onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                setCurrentPasswordError('Incorrect password.');
            } else {
                Alert.alert("Error", error.message);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Custom Eye SVG Icon
    const EyeIcon = () => (
        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <G clipPath="url(#clip0_1408_8588)">
                <Path
                    d="M9.34203 18.7819L7.41103 18.2639L8.19803 15.3249C7.01999 14.8904 5.92514 14.2572 4.96103 13.4529L2.80803 15.6069L1.39303 14.1919L3.54703 12.0389C2.3311 10.5826 1.51411 8.83563 1.17603 6.96886L3.14403 6.60986C3.90303 10.8119 7.57903 13.9999 12 13.9999C16.42 13.9999 20.097 10.8119 20.856 6.60986L22.824 6.96786C22.4864 8.83488 21.6697 10.5822 20.454 12.0389L22.607 14.1919L21.192 15.6069L19.039 13.4529C18.0749 14.2572 16.9801 14.8904 15.802 15.3249L16.589 18.2649L14.658 18.7819L13.87 15.8419C12.6324 16.0539 11.3677 16.0539 10.13 15.8419L9.34203 18.7819Z"
                    fill="#71717A"
                />
            </G>
            <Defs>
                <ClipPath id="clip0_1408_8588">
                    <Rect width="24" height="24" fill="white" />
                </ClipPath>
            </Defs>
        </Svg>
    );

    return (
        <GlowBackground>
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {/* Header */}
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={22} color="#FFF" />
                        </TouchableOpacity>

                        <Text style={styles.title}>Change Password</Text>

                        {/* Current Password */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Current Password</Text>
                            <View style={[
                                styles.inputWrapper,
                                currentPasswordError ? styles.inputWrapperError : null
                            ]}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your password"
                                    placeholderTextColor="#71717A"
                                    secureTextEntry={!showCurrent}
                                    value={currentPassword}
                                    onChangeText={(text) => {
                                        setCurrentPassword(text);
                                        setCurrentPasswordError('');
                                    }}
                                />
                                <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={styles.eyeIcon}>
                                    {showCurrent ? (
                                        <Ionicons name="eye-off-outline" size={24} color="#71717A" />
                                    ) : (
                                        <EyeIcon />
                                    )}
                                </TouchableOpacity>
                            </View>
                            {currentPasswordError ? (
                                <Text style={styles.errorTextBold}>{currentPasswordError}</Text>
                            ) : null}
                        </View>

                        {/* New Password */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>New Password</Text>
                            <View style={[
                                styles.inputWrapper,
                                newPasswordError ? styles.inputWrapperError : null
                            ]}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your new password"
                                    placeholderTextColor="#71717A"
                                    secureTextEntry={!showNew}
                                    value={newPassword}
                                    onChangeText={(text) => {
                                        setNewPassword(text);
                                        setNewPasswordError('');
                                    }}
                                />
                                <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.eyeIcon}>
                                    {showNew ? (
                                        <Ionicons name="eye-off-outline" size={24} color="#71717A" />
                                    ) : (
                                        <EyeIcon />
                                    )}
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.hint}>Must be at least 8 characters long.</Text>
                            {newPasswordError ? (
                                <Text style={styles.errorTextBold}>{newPasswordError}</Text>
                            ) : null}
                        </View>

                        {/* Confirm New Password */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Confirm New Password</Text>
                            <View style={[
                                styles.inputWrapper,
                                confirmPasswordError ? styles.inputWrapperError : null
                            ]}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Confirm your new password"
                                    placeholderTextColor="#71717A"
                                    secureTextEntry={!showConfirm}
                                    value={confirmPassword}
                                    onChangeText={(text) => {
                                        setConfirmPassword(text);
                                        setConfirmPasswordError('');
                                    }}
                                />
                                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeIcon}>
                                    {showConfirm ? (
                                        <Ionicons name="eye-off-outline" size={24} color="#71717A" />
                                    ) : (
                                        <EyeIcon />
                                    )}
                                </TouchableOpacity>
                            </View>
                            {confirmPasswordError ? (
                                <Text style={styles.errorTextBold}>{confirmPasswordError}</Text>
                            ) : null}
                        </View>

                        <TouchableOpacity
                            style={styles.forgotLink}
                            onPress={() => navigation.navigate('ForgotPassword')}
                        >
                            <Text style={styles.forgotText}>Forgot Password</Text>
                        </TouchableOpacity>

                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={{
                                backgroundColor: '#B99A4A',
                                padding: 16,
                                borderRadius: 50,
                                alignItems: 'center',
                                marginBottom: 20,
                                opacity: isLoading ? 0.7 : 1
                            }}
                            onPress={handleSaveChanges}
                            disabled={isLoading}
                        >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                                {isLoading ? "Saving..." : "Save Changes"}
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
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 30, // Consistent with others
    },
    backButton: {
        marginTop: 0,
        marginLeft: -10,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20
    },
    title: {
        fontSize: responsiveFontSize(32),
        color: '#FFF',
        fontFamily: 'CormorantGaramond_Bold',
        marginTop: 0,
        marginBottom: 35,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        color: '#FFFBF3',
        fontSize: responsiveFontSize(14),
        marginBottom: 12,
        fontFamily: 'IBMPlexSans',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#23272A',
    },
    input: {
        flex: 1,
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    hint: {
        color: '#9BA1A6',
        fontSize: responsiveFontSize(14),
        marginTop: 8,
    },
    forgotLink: {
        alignSelf: 'flex-end',
        marginTop: -8,
        marginBottom: 20,
    },
    forgotText: {
        color: '#B99A4A',
        fontSize: responsiveFontSize(14),
        fontWeight: '500',
    },
    footer: {
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 10,
    },
    eyeIcon: {
        padding: 4,
    },
    inputWrapperError: {
        borderColor: '#D66A77',
    },
    errorTextBold: {
        color: '#D66A77',
        fontSize: responsiveFontSize(14),
        marginTop: 8,
        fontWeight: 'bold',
    },
});

export default ChangePasswordScreen;
