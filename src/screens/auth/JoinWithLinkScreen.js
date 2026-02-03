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
    Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';

const JoinWithLinkScreen = ({ navigation }) => {
    const [invitationLink, setInvitationLink] = useState('');
    const [isValid, setIsValid] = useState(true);
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

    const handleContinue = () => {
        if (invitationLink.trim().length === 0) {
            setIsValid(false);
            return;
        }
        // Proceed with valid link logic here
        // Navigation to Join Flow Start
        navigation.navigate('JoinFirstName', { invitationCode: invitationLink });
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color="#FFF" />
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
                        <TouchableOpacity style={styles.copyIcon}>
                            <Ionicons name="copy-outline" size={20} color="#9BA1A6" />
                        </TouchableOpacity>
                    </View>
                    {!isValid && (
                        <Text style={styles.errorText}>Invalid link. Please check the link and try again</Text>
                    )}
                </View>

                {/* Spacer to push button to bottom */}
                <View style={{ flex: 1 }} />

                <GradientBorderButton
                    text="Continue"
                    onPress={handleContinue}
                    disabled={invitationLink.trim().length === 0}
                    style={{ marginBottom: isKeyboardVisible ? 0 : 100 }}
                />
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1E21',
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
        fontSize: 28,
        color: '#FFF',
        fontFamily: 'CormorantGaramond_700Bold',
        marginBottom: 40
    },
    inputContainer: {
        marginBottom: 30,
    },
    label: {
        color: '#FFFBF3',
        fontSize: 14,
        marginBottom: 10,
        fontFamily: 'Manrope',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2C2E33',
        height: 56,
        paddingHorizontal: 16,
    },
    input: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
    },
    copyIcon: {
        padding: 5,
    },
    errorText: {
        color: '#FF4B4B',
        fontSize: 12,
        marginTop: 8,
    },

});

export default JoinWithLinkScreen;
