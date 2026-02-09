import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
    ScrollView,
    Modal,
    TouchableWithoutFeedback
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';
import CustomSwitch from '../../components/CustomSwitch';

const SettingsScreen = ({ navigation }) => {
    const [isWidgetEnabled, setIsWidgetEnabled] = useState(true);
    const [signOutVisible, setSignOutVisible] = useState(false);
    const [deleteVisible, setDeleteVisible] = useState(false);

    const LinkItem = ({ label, onPress, showArrow = true }) => (
        <TouchableOpacity style={styles.linkItem} onPress={onPress}>
            <Text style={styles.linkText}>{label}</Text>
            {showArrow && <Ionicons name="chevron-forward" size={20} color="#A1A1AA" />}
        </TouchableOpacity>
    );

    const SectionHeader = ({ title }) => (
        <Text style={styles.sectionHeader}>{title}</Text>
    );

    return (
        <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
                <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} translucent />

                {/* Header */}
                {/* Header */}
                <View style={styles.headerContainer}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                    <View style={styles.titleWrapper}>
                        <Text style={styles.headerTitle}>Setting</Text>
                        <Text style={styles.headerSubtitle}>May Allah Guide Every Step</Text>
                    </View>
                </View>

                <ScrollView contentContainerStyle={styles.content}>

                    {/* Team Members */}
                    <SectionHeader title="Team Members" />
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => navigation.navigate('JourneyTeam')}
                    >
                        <Text style={styles.addButtonText}>Add a Co-Host or Manager</Text>
                        <Ionicons name="add" size={24} color="#A1A1AA" />
                    </TouchableOpacity>

                    {/* App Settings */}
                    <SectionHeader title="App Settings" />
                    <View style={styles.sectionContainer}>
                        <LinkItem label="Get audio kits for travellers" />
                        <View style={styles.separator} />
                        <View style={styles.switchItem}>
                            <Text style={styles.linkText}>Enable lockscreen widget</Text>
                            <CustomSwitch
                                value={isWidgetEnabled}
                                onValueChange={setIsWidgetEnabled}
                                activeColor="#B99A4A"
                            />
                        </View>
                    </View>

                    {/* Account */}
                    <SectionHeader title="Account" />
                    <View style={styles.sectionContainer}>
                        <LinkItem
                            label="Help & Support"
                            onPress={() => navigation.navigate('HelpSupport')}
                        />
                        <View style={styles.separator} />
                        <LinkItem
                            label="Change password"
                            onPress={() => navigation.navigate('ChangePassword')}
                        />
                    </View>

                    {/* Legal */}
                    <SectionHeader title="Legal" />
                    <View style={styles.sectionContainer}>
                        <LinkItem label="Terms of Service" />
                        <View style={styles.separator} />
                        <LinkItem label="Privacy Policy" />
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionButtonsContainer}>
                        <GradientBorderButton
                            text="Sign out"
                            onPress={() => setSignOutVisible(true)}
                            innerBg={Colors.dark.background}
                        />

                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() => setDeleteVisible(true)}
                        >
                            <Text style={styles.deleteButtonText}>Delete Company</Text>
                        </TouchableOpacity>
                    </View>

                </ScrollView>
            </SafeAreaView>

            {/* Sign Out Modal */}
            <Modal
                visible={signOutVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSignOutVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setSignOutVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={styles.modalContent}>
                                <Text style={styles.modalTitle}>Sign Out</Text>
                                <Text style={styles.modalMessage}>Are you sure you want to sign out?</Text>

                                <TouchableOpacity
                                    style={styles.modalConfirmButton}
                                    onPress={() => {
                                        setSignOutVisible(false);
                                        navigation.navigate('Welcome');
                                    }}
                                >
                                    <Text style={styles.modalConfirmText}>Sign Out</Text>
                                </TouchableOpacity>

                                <GradientBorderButton
                                    text="Cancel"
                                    onPress={() => setSignOutVisible(false)}
                                    innerBg="#1E2124"
                                />
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Delete Modal */}
            <Modal
                visible={deleteVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setDeleteVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setDeleteVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={styles.modalContent}>
                                <Text style={styles.modalMessageLarge}>
                                    Are you sure you want to delete the company account? Your data cannot be recovered after deletion.
                                </Text>

                                <TouchableOpacity
                                    style={styles.modalConfirmButton}
                                    onPress={() => {
                                        setDeleteVisible(false);
                                        navigation.navigate('Welcome');
                                    }}
                                >
                                    <Text style={styles.modalConfirmText}>Delete</Text>
                                </TouchableOpacity>

                                <GradientBorderButton
                                    text="Cancel"
                                    onPress={() => setDeleteVisible(false)}
                                    innerBg="#1E2124"
                                />
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
        paddingBottom: 40,
    },
    headerContainer: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
    },
    titleWrapper: {
        marginTop: 15,
    },
    headerTitle: {
        fontSize: 34,
        color: '#FFF',
        fontFamily: 'CormorantGaramond_700Bold',
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#A1A1AA',
        marginTop: 4,
    },
    backButton: {
        alignSelf: 'flex-start',
        padding: 4,
        marginLeft: -4,
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFF',
        marginTop: 24,
        marginBottom: 12,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#23272A',
        padding: 16,
        borderRadius: 12,
    },
    addButtonText: {
        color: '#fff',
        fontSize: 15,
    },
    sectionContainer: {
        backgroundColor: '#23272A',
        borderRadius: 12,
        paddingHorizontal: 16, // Padding left/right for items
    },
    linkItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
    },
    linkText: {
        color: '#F4F4F5',
        fontSize: 15,
    },
    switchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12, // Switch is taller
    },
    separator: {
        height: 1,
        backgroundColor: '#2C2E33',
    },
    // Action Buttons Styles
    actionButtonsContainer: {
        marginTop: 30,
        gap: 16,
    },
    signOutButton: {
        height: 56,
        borderRadius: 28,
        borderWidth: 1.5,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    signOutButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    deleteButton: {

        height: 56,
        borderRadius: 28,
        borderWidth: 1.5,
        borderColor: '#FF383C',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButtonText: {
        color: '#FF383C',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Modal Styles
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
        padding: 24,
        width: '100%',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 22,
        color: '#FFF',
        fontWeight: 'bold',
        marginBottom: 16,
    },
    modalMessage: {
        fontSize: 16,
        color: '#9BA1A6',
        textAlign: 'center',
        marginBottom: 32,
    },
    modalMessageLarge: {
        fontSize: 18,
        color: '#FFF',
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 26,
    },
    modalConfirmButton: {
        width: '100%',
        height: 56,
        backgroundColor: '#942F31', // Darker red as in screenshot
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalConfirmText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalCancelButton: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        borderWidth: 1.5,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalCancelText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default SettingsScreen;
