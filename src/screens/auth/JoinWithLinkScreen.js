import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Image,
    Modal,
    Keyboard,
    ActivityIndicator,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import { functions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';

const JoinWithLinkScreen = ({ navigation }) => {
    const [invitationLink, setInvitationLink] = useState('');
    const [isValid, setIsValid] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);

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

    const handleLinkChange = (text) => {
        setInvitationLink(text);
        setIsValid(true); // Reset error on change
    };

    const handleContinue = async () => {
        if (invitationLink.trim().length === 0) {
            setIsValid(false);
            return;
        }

        setIsLoading(true);

        try {
            // Extract code from link (e.g. gomusafir.app/join?code=XYZ or gomusafir.app/invite/XYZ or just XYZ)
            let codeInput = invitationLink.trim();
            if (codeInput.includes('?code=')) {
                codeInput = codeInput.split('?code=').pop().split('&')[0];
            } else if (codeInput.includes('/')) {
                codeInput = codeInput.split('/').pop();
            }

            // Call getInviteMetadata
            const getMetadata = httpsCallable(functions, 'getInviteMetadata');
            const result = await getMetadata({ inviteCode: codeInput });

            // If we are here, it's valid
            const tripDetails = result.data;
            // Navigate to Join Flow Start - Now starting with Email
            navigation.navigate('JoinEmail', { invitationCode: codeInput, tripDetails });

        } catch (error) {
            setIsValid(false);
        } finally {
            setIsLoading(false);
        }
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
                    <Text style={styles.title}>Join as Participant</Text>

                    <View style={styles.inputContainer}>
                        <Text style={styles.label}>Invitation Link</Text>
                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.input}
                                placeholder="Paste your invitation link here"
                                placeholderTextColor="#71717A"
                                value={invitationLink}
                                onChangeText={handleLinkChange}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />                           
                        </View>
                        {!isValid && (
                            <Text style={styles.errorText}>Invalid link. Please check the link and try again</Text>
                        )}
                    </View>

                    {/* Spacer to push button to bottom */}
                    <View style={{ flex: 1 }} />

                    <GradientBorderButton
                        text={isLoading ? "Validating..." : "Continue"}
                        onPress={handleContinue}
                        disabled={invitationLink.trim().length === 0 || isLoading}
                        style={{ marginBottom: isKeyboardVisible ? 20 : 100 }}
                    />
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
        paddingHorizontal: 24,
        paddingTop: 20,
    },
    title: {
        fontSize: responsiveFontSize(28),
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        marginBottom: 40
    },
    inputContainer: {
        marginBottom: 30,
    },
    label: {
        color: '#FFFBF3',
        fontSize: responsiveFontSize(14),
        marginBottom: 10,
        fontFamily: Typography.sans.regular,
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
    copyIcon: {
        padding: 5,
    },
    errorText: {
        color: '#FF4B4B',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
        marginTop: 8,
    },
});

export default JoinWithLinkScreen;
