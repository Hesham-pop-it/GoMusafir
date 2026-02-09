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

const ForgotPasswordVerifyScreen = () => {
    const navigation = useNavigation();

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
                        text="Resend Code"
                        onPress={() => { }}
                        innerBg="#1A1E21"
                        style={styles.resendButton}
                    />

                    <GradientBorderButton
                        text="Continue"
                        onPress={() => navigation.navigate('BusinessLogin')}
                    />
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
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
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
        paddingBottom: 40,
        gap: 16,
    },
    resendButton: {
        marginBottom: 0,
    },
});

export default ForgotPasswordVerifyScreen;
