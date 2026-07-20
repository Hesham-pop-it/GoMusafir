import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    KeyboardAvoidingView,
    ScrollView,
    Platform
} from 'react-native';
import Modal from '../../components/CompatModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { functions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { Alert } from 'react-native';

const InviteMemberScreen = () => {
    const navigation = useNavigation();
    const [email, setEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState('Co-host');
    const [successModalVisible, setSuccessModalVisible] = useState(false);
    const [isInviting, setIsInviting] = useState(false);

    const handleSendInvite = async () => {
        if (!email) return;

        setIsInviting(true);
        try {
            const inviteTeamMember = httpsCallable(functions, 'inviteTeamMember');
            await inviteTeamMember({ email, role: selectedRole.toLowerCase() });
            setSuccessModalVisible(true);
        } catch (error) {
            console.warn("Invite Error:", error);
            Alert.alert(
                "Failed to send invite",
                error.message || "Something went wrong while dispatching the invitation."
            );
        } finally {
            setIsInviting(false);
        }
    };

    const RoleCard = ({ title, description }) => {
        const isSelected = selectedRole === title;
        return (
            <TouchableOpacity
                style={[styles.roleCard, isSelected && styles.roleCardActive]}
                onPress={() => setSelectedRole(title)}
                activeOpacity={0.7}
            >
                <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
                    {isSelected && <View style={styles.radioInner} />}
                </View>
                <View style={styles.roleContent}>
                    <Text style={[styles.roleTitle, isSelected && styles.roleTitleActive]}>{title}</Text>
                    <Text style={[styles.roleDescription, isSelected && styles.roleDescriptionActive]}>
                        {description}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <GlowBackground>
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                                <Ionicons name="chevron-back" size={22} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.title}>Invite Team Member</Text>

                        <View style={styles.inputSection}>
                            <Text style={styles.label}>Email address</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter your team email address"
                                placeholderTextColor="#71717A"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </View>

                        <View style={styles.roleSection}>
                            <Text style={styles.sectionTitle}>Select a Role</Text>

                            <RoleCard
                                title="Co-host"
                                description="Has all rights except deleting the organization account."
                            />

                            <RoleCard
                                title="Manager"
                                description="cannot delete trips or the account, cannot buy seats and cannot invite new members."
                            />
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.inviteButton, (!email || isInviting) && { opacity: 0.5 }]}
                            onPress={handleSendInvite}
                            disabled={!email || isInviting}
                        >
                            <Text style={styles.inviteButtonText}>{isInviting ? "Sending..." : "Send Invite"}</Text>
                        </TouchableOpacity>

                    </View>
                </KeyboardAvoidingView>

                {/* Success Bottom Sheet */}
                <Modal
                    isVisible={successModalVisible}
                    onBackdropPress={() => setSuccessModalVisible(false)}
                    onSwipeComplete={() => setSuccessModalVisible(false)}
                    swipeDirection="down"
                    style={{ margin: 0, justifyContent: 'flex-end' }}
                    useNativeDriver={true}
                    hideModalContentWhileAnimating={true}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalIndicator} />
                        <Text style={styles.successMessage}>
                            An invitation email has been sent
                        </Text>
                        <Text style={[styles.successMessage, { marginBottom: 40 }]}>to your new team member</Text>

                        <GradientBorderButton
                            text="Continue"
                            onPress={() => {
                                setSuccessModalVisible(false);
                                navigation.navigate('JourneyTeam');
                            }}
                            innerBg="#1E2124"
                        />
                    </View>
                </Modal>
            </SafeAreaView>
        </GlowBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    header: {
        paddingTop: 10,
    },
    backButton: {
        alignSelf: 'flex-start',
        marginLeft: -10,
        padding: 10,
    },
    title: {
        fontSize: 32,
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        marginTop: 20,
        marginBottom: 40,
    },
    inputSection: {
        marginBottom: 32,
    },
    label: {
        color: '#FFFBF3',
        fontSize: 16,
        marginBottom: 12,
        fontFamily: Typography.sans.regular,
    },
    input: {
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
    },
    roleSection: {
        gap: 16,
    },
    sectionTitle: {
        color: '#FFF',
        fontSize: 18,
        fontFamily: Typography.sans.semiBold,
        marginBottom: 8,
    },
    roleCard: {
        flexDirection: 'row',
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    roleCardActive: {
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    radioOuter: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#8E949A',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
        marginTop: -4,
    },
    radioOuterActive: {
        backgroundColor: '#B99A4A',
    },
    radioInner: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#B99A4A',
    },
    roleContent: {
        flex: 1,
    },
    roleTitle: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.regular,
        marginBottom: 8,
    },
    roleTitleActive: {
        color: '#FFF',

    },
    roleDescription: {
        color: '#fff',
        opacity: 0.5,
        fontSize: 16,
        fontFamily: Typography.sans.regular,
        lineHeight: 20,
    },
    roleDescriptionActive: {
        color: '#fff',
        opacity: 0.5,
        fontSize: 16,
        fontFamily: Typography.sans.regular,
    },
    footer: {
        padding: 24,
        paddingBottom: 40,
    },
    inviteButton: {
        height: 56,
        backgroundColor: '#B99A4A',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inviteButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontFamily: Typography.sans.bold,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingTop: 4,
        padding: 24,
        paddingBottom: 50,
        alignItems: 'center',
    },
    modalIndicator: {
        width: 160,
        height: 6,
        backgroundColor: '#fff',
        borderRadius: 4,
        marginBottom: 30,
    },
    successMessage: {
        fontSize: 16,
        color: '#FFF',
        textAlign: 'center',
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
        lineHeight: 28,
    },
    continueButton: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontFamily: Typography.sans.bold,
    },
});

export default InviteMemberScreen;
