import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';

import GlowBackground from '../../components/GlowBackground';

const EditIcon = () => (
    <Svg width="17" height="16" viewBox="0 0 17 16" fill="none">
        <Path d="M9.72852 1.38037C10.6674 0.459267 11.996 -0.638403 13.2891 0.459473C13.309 0.476424 13.3233 0.494754 13.333 0.513184C14.0164 1.21397 14.66 1.87448 15.3799 2.60303C16.115 3.34701 16.9651 4.15295 16 5.1626C13.5553 7.72249 10.9336 10.1326 8.40918 12.6128L6.76172 14.2241C6.39863 14.5783 6.16798 14.8005 5.62793 14.8979C3.98043 15.1991 2.2794 15.3143 0.623047 15.5269C0.437092 15.5534 -0.0410195 15.571 0.00292969 15.2612C0.242089 13.658 0.392897 12.0099 0.729492 10.4155C0.871412 9.76015 1.82754 9.13089 2.28809 8.6792L6.11426 4.92432L9.72852 1.38037ZM2.06641 10.9829C1.88025 12.2212 1.69299 13.4594 1.50684 14.6978C2.63939 14.5547 3.77175 14.4101 4.9043 14.2671C4.84547 12.4691 4.06287 11.5962 3.33887 11.146C2.95346 10.9065 2.5652 10.775 2.27148 10.7046C2.21887 10.692 2.16931 10.6822 2.12402 10.6733C2.10325 10.7802 2.08086 10.8854 2.06641 10.9829ZM2.80176 9.49463C2.77139 9.525 2.74205 9.55864 2.71094 9.59229C3.07042 9.69157 3.51688 9.85563 3.9668 10.1353C4.91269 10.7233 5.81881 11.7783 6.04492 13.5894L7.2041 12.4526L12.6699 7.09424L12.2803 6.69775C11.1903 5.59997 10.1066 4.49566 9.02441 3.39014L2.80176 9.49463ZM11.916 0.994629C11.5498 0.700174 11.4507 1.00486 11.1543 1.30127L9.99902 2.43408L10.4814 2.92432C11.5406 3.99104 12.5929 5.06497 13.6445 6.13916L13.9453 5.84521C14.5919 5.21637 15.4597 4.66681 14.6006 3.73682C13.7415 2.80688 12.8202 1.92142 11.9346 1.01807C11.9274 1.01073 11.9217 1.0021 11.916 0.994629Z" fill="#B99A4A" />
    </Svg>
);

const EditParticipantScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { participant } = route.params || {};

    const [firstName, setFirstName] = useState(participant?.name.split(' ')[0] || '');
    const [lastName, setLastName] = useState(participant?.name.split(' ')[1] || '');
    const [email, setEmail] = useState('ethan@gmail.com');
    const [phone, setPhone] = useState('+444545456');
    const [successVisible, setSuccessVisible] = useState(false);

    const handleSave = () => {
        setSuccessVisible(true);
    };

    return (
        <GlowBackground>
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Edit Participants</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {/* Avatar Section */}
                        <View style={styles.avatarSection}>
                            <View style={styles.avatarWrapper}>
                                <Image
                                    source={{ uri: participant?.image || 'https://randomuser.me/api/portraits/men/32.jpg' }}
                                    style={styles.avatar}
                                />
                                <TouchableOpacity style={styles.editIconContainer}>
                                    <EditIcon />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Form */}
                        <View style={styles.form}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>First Name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={firstName}
                                    onChangeText={setFirstName}
                                    placeholder="Ethan"
                                    placeholderTextColor="#636D77"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Last Name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={lastName}
                                    onChangeText={setLastName}
                                    placeholder="Carter"
                                    placeholderTextColor="#636D77"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Email Address</Text>
                                <TextInput
                                    style={styles.input}
                                    value={email}
                                    onChangeText={setEmail}
                                    placeholder="ethan@gmail.com"
                                    placeholderTextColor="#636D77"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Phone Number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={phone}
                                    onChangeText={setPhone}
                                    placeholder="+444545456"
                                    placeholderTextColor="#636D77"
                                    keyboardType="phone-pad"
                                />
                            </View>
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                            <Text style={styles.saveButtonText}>Save Changes</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                {/* Success Modal */}
                <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <Modal
                        visible={successVisible}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={() => setSuccessVisible(false)}
                    >
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <View style={styles.successIconCircle}>
                                    <Ionicons name="checkmark" size={40} color="#FFF" />
                                </View>
                                <Text style={styles.modalTitle}>Changes Saved</Text>
                                <Text style={styles.modalDesc}>
                                    Your participant has been updated successfully.
                                </Text>

                                <GradientBorderButton
                                    text="OK"
                                    onPress={() => {
                                        setSuccessVisible(false);
                                        navigation.goBack();
                                    }}
                                    innerBg="#1E2124"
                                />
                            </View>
                        </View>
                    </Modal>
                </View>
            </SafeAreaView>
        </GlowBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 20,
        // fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    avatarSection: {
        alignItems: 'center',
        marginBottom: 40,
    },
    avatarWrapper: {
        position: 'relative',
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
    },
    editIconContainer: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#23272A',
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#2C2F33',
    },
    form: {
        gap: 20,
    },
    inputGroup: {
        gap: 12,
    },
    label: {
        color: '#FFFBF3',
        fontSize: 14,
        fontWeight: '600',
    },
    input: {
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        color: '#FFF',
        fontSize: 16,
    },
    footer: {
        paddingHorizontal: 20,
        paddingBottom: 40,
        paddingTop: 10,
    },
    saveButton: {
        backgroundColor: '#B99A4A',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    modalContent: {
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 30,
        width: '100%',
        alignItems: 'center',
    },
    successIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#34C759',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    modalDesc: {
        color: '#9BA1A6',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 22,
    },
});

export default EditParticipantScreen;
