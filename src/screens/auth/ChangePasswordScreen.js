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
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { responsiveFontSize } from '../../utils/responsive';

const ChangePasswordScreen = () => {
    const navigation = useNavigation();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

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
                            <Ionicons name="chevron-back" size={24} color="#FFF" />
                        </TouchableOpacity>

                        <Text style={styles.title}>Change Password</Text>

                        {/* Current Password */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Current Password</Text>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your password"
                                    placeholderTextColor="#71717A"
                                    secureTextEntry={!showCurrent}
                                    value={currentPassword}
                                    onChangeText={setCurrentPassword}
                                />
                                <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)}>
                                    <Feather name={showCurrent ? "eye" : "eye-off"} size={20} color="#71717A" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* New Password */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>New Password</Text>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Confirm your new password"
                                    placeholderTextColor="#71717A"
                                    secureTextEntry={!showNew}
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                />
                                <TouchableOpacity onPress={() => setShowNew(!showNew)}>
                                    <Feather name={showNew ? "eye" : "eye-off"} size={20} color="#71717A" />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.hint}>Must be at least 8 characters long.</Text>
                        </View>

                        {/* Confirm New Password */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Confirm New Password</Text>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Confirm your new password"
                                    placeholderTextColor="#71717A"
                                    secureTextEntry={!showConfirm}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                />
                                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                                    <Feather name={showConfirm ? "eye" : "eye-off"} size={20} color="#71717A" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.forgotLink}
                            onPress={() => navigation.navigate('ForgotPassword')}
                        >
                            <Text style={styles.forgotText}>Forgot Password</Text>
                        </TouchableOpacity>

                    </ScrollView>

                    <View style={styles.footer}>
                        <GradientBorderButton
                            text="Save Changes"
                            onPress={() => navigation.goBack()}
                            style={{ width: '100%' }}
                        />
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
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        marginTop: 0,
        marginBottom: 35,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        color: '#FFFBF3',
        fontSize: responsiveFontSize(16),
        marginBottom: 12,
        fontFamily: 'Manrope',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#2C2E33',
    },
    input: {
        flex: 1,
        color: '#FFF',
        fontSize: responsiveFontSize(16),
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
});

export default ChangePasswordScreen;
