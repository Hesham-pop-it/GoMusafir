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
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';

const ForgotPasswordVerifyScreen = () => {
    const navigation = useNavigation();

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header */}
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={28} color="#FFF" />
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
                    innerBg="#121417"
                    style={styles.resendButton}
                />

                <TouchableOpacity
                    style={styles.continueButton}
                    onPress={() => navigation.navigate('BusinessLogin')}
                >
                    <Text style={styles.continueButtonText}>Continue</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121417',
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 10,
    },
    backButton: {
        marginLeft: -5,
        marginBottom: 20,
    },
    title: {
        fontSize: 32,
        color: '#FFF',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        lineHeight: 40,
        marginBottom: 16,
    },
    description: {
        fontSize: 16,
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
    continueButton: {
        backgroundColor: '#B99A4A',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default ForgotPasswordVerifyScreen;
