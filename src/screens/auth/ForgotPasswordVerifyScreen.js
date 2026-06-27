import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { responsiveFontSize } from '../../utils/responsive';
import { auth } from '../../config/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useState } from 'react';

const ForgotPasswordVerifyScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const email = route.params?.email;
    const [resendLoading, setResendLoading] = useState(false);

    const handleResend = async () => {
        if (!email) {
            Alert.alert("Error", "No email address found to resend to.");
            return;
        }
        if (resendLoading) return;
        setResendLoading(true);
        try {
            await sendPasswordResetEmail(auth, email);
            Alert.alert("Link Resent", `A new password reset link has been sent to ${email}.`);
        } catch (error) {
            console.warn("Password reset resend error:", error);
            Alert.alert("Resend Failed", "Failed to resend the reset email. Please try again later.");
        } finally {
            setResendLoading(false);
        }
    };

    return (
        <GlowBackground>
            <SafeAreaView style={styles.safeArea}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Header */}
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>

                    <Text style={styles.title}>Check your business email</Text>

                    <Text style={styles.description}>
                        We've sent a secure password reset link to your email. Please check your inbox.
                    </Text>

                </ScrollView>

                <View style={styles.footer}>
                    <GradientBorderButton
                        text={resendLoading ? "Resending..." : "Resend Link"}
                        onPress={handleResend}
                        innerBg="#1A1E21"
                        style={styles.resendButton}
                        disabled={resendLoading}
                    />

                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={() => navigation.navigate('BusinessLogin')}
                    >
                        <Text style={styles.primaryButtonText}>Continue</Text>
                    </TouchableOpacity>
                </View>
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
        paddingTop: 30, // Consistent with others (was 10)
    },
    backButton: {
        marginLeft: -10,
        marginBottom: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: responsiveFontSize(32),
        color: '#FFF',
        fontFamily: 'CormorantGaramond',
        marginBottom: 16,
    },
    description: {
        fontSize: responsiveFontSize(16),
        color: '#9BA1A6',
        lineHeight: 24,
        marginTop: 10,
    },
    footer: {
        paddingHorizontal: 24,
        // paddingBottom: 40,
        gap: 16,
    },
    resendButton: {
        marginBottom: 0,
    },
    primaryButton: {
        backgroundColor: '#B99A4A',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        marginBottom: 100,
    },
    primaryButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontWeight: 'bold'
    },
});

export default ForgotPasswordVerifyScreen;
