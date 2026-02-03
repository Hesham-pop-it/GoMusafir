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
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';

const ForgotPasswordScreen = () => {
    const navigation = useNavigation();
    const [email, setEmail] = useState('');

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Header */}
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color="#FFF" />
                    </TouchableOpacity>

                    <Text style={styles.title}>Forgot Password</Text>

                    {/* Email Input */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Business email</Text>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter your business email"
                                placeholderTextColor="#636D77"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={email}
                                onChangeText={setEmail}
                            />
                        </View>
                    </View>

                </ScrollView>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.sendButton, !email && { opacity: 0.6 }]}
                        onPress={() => navigation.navigate('ForgotPasswordVerify')}
                        disabled={!email}
                    >
                        <Text style={styles.sendButtonText}>Send link</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121417',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    backButton: {
        marginTop: 10,
        marginLeft: -5,
        marginBottom: 20,
    },
    title: {
        fontSize: 32,
        color: '#FFF',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        marginBottom: 35,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 12,
    },
    inputWrapper: {
        backgroundColor: '#262626',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        justifyContent: 'center',
    },
    input: {
        color: '#FFF',
        fontSize: 16,
    },
    footer: {
        paddingHorizontal: 20,
        paddingBottom: 40,
        paddingTop: 10,
    },
    sendButton: {
        backgroundColor: '#B99A4A',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default ForgotPasswordScreen;
