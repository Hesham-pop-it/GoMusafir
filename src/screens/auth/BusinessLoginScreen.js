import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';

const BusinessLoginScreen = () => {
    const navigation = useNavigation();
    const [companyName, setCompanyName] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.content}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Back Button */}
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Ionicons name="chevron-back" size={28} color="#FFF" />
                    </TouchableOpacity>

                    {/* Title */}
                    <Text style={styles.title}>Log in with your business account</Text>

                    {/* Form */}
                    <View style={styles.form}>
                        {/* Company Name */}
                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>Company name</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter your company name"
                                placeholderTextColor="#666"
                                value={companyName}
                                onChangeText={setCompanyName}
                            />
                        </View>

                        {/* Password */}
                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>Password</Text>
                            <View style={styles.passwordInputWrapper}>
                                <TextInput
                                    style={styles.passwordInput}
                                    placeholder="Enter your password"
                                    placeholderTextColor="#666"
                                    secureTextEntry={!isPasswordVisible}
                                    value={password}
                                    onChangeText={setPassword}
                                />
                                <TouchableOpacity
                                    onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                                >
                                    <Ionicons
                                        name={isPasswordVisible ? "eye-outline" : "eye-off-outline"}
                                        size={24}
                                        color="#666"
                                    />
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

                {/* Login Button */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.loginButton}
                        onPress={() => navigation.navigate('BusinessVerification')}
                    >
                        <Text style={styles.loginButtonText}>Log in</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
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
        alignItems: 'flex-start',
        marginBottom: 30,
    },
    title: {
        fontSize: 32,
        color: '#FFF',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        lineHeight: 40,
        marginBottom: 40,
    },
    form: {
        gap: 24,
    },
    inputContainer: {
        gap: 8,
    },
    label: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '500',
    },
    input: {
        backgroundColor: '#262626',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        color: '#FFF',
        fontSize: 16,
    },
    passwordInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#262626',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
    },
    passwordInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
    },
    forgotPassword: {
        alignSelf: 'flex-end',
    },
    forgotPasswordText: {
        color: '#B99A4A',
        fontSize: 14,
        fontWeight: '500',
    },
    footer: {
        paddingHorizontal: 24,
        paddingBottom: 40,
    },
    loginButton: {
        backgroundColor: '#B99A4A',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loginButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default BusinessLoginScreen;
