import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Platform,
    ScrollView,
} from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';
import CustomSwitch from '../../components/CustomSwitch';
import { Typography } from '../../constants/Typography';
import { auth, functions, database } from '../../config/firebase';
import { signOut, deleteUser } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { ref, onValue } from 'firebase/database';
import { Alert } from 'react-native';
import { unregisterForPushNotificationsAsync } from '../../services/notificationService';

const SettingsScreen = ({ navigation }) => {
    const [isWidgetEnabled, setIsWidgetEnabled] = useState(true);
    const [signOutVisible, setSignOutVisible] = useState(false);
    const [deleteVisible, setDeleteVisible] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userRole, setUserRole] = useState(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    React.useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        // 1. Check if they are staff and get orgId
        const userRef = ref(database, `users/${user.uid}/staff_org_id`);
        const unsubscribe = onValue(userRef, (snapshot) => {
            const orgId = snapshot.val();
            if (orgId) {
                setIsAdmin(true);
                // 2. Fetch their specific role within that organization
                const roleRef = ref(database, `orgs/${orgId}/staff/${user.uid}`);
                onValue(roleRef, (roleSnap) => {
                    setUserRole(roleSnap.val());
                }, { onlyOnce: true });
            } else {
                setIsAdmin(false);
                setUserRole(null);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleAction = async () => {
        const isStaff = userRole === 'co-host' || userRole === 'manager';
        setIsDeleting(true);
        try {
            if (isStaff) {
                const leaveOrg = httpsCallable(functions, 'leaveOrganization');
                await leaveOrg();
                setDeleteVisible(false);
                await signOut(auth);
            } else {
                const deleteMyAccount = httpsCallable(functions, 'deleteMyAccount');
                await deleteMyAccount();
                setDeleteVisible(false);
                await signOut(auth);
            }
        } catch (error) {
            setDeleteVisible(false);
            if (error.code === 'auth/requires-recent-login' || error.message.includes('re-authenticate')) {
                Alert.alert(
                    "Security Verification",
                    "For your security, please log out and log back in to verify your identity before proceeding.",
                    [{ text: "OK" }]
                );
            } else {
                Alert.alert("Error", error.message || (isStaff ? "Failed to leave team" : "Failed to delete account"));
            }
        } finally {
            setIsDeleting(false);
        }
    };

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

                    {isAdmin && (
                        <>
                            {/* Team Members */}
                            <SectionHeader title="Team Members" />
                            <TouchableOpacity
                                style={styles.addButton}
                                onPress={() => navigation.navigate('JourneyTeam')}
                            >
                                <Text style={styles.addButtonText}>Add a Co-Host or Manager</Text>
                                <Ionicons name="add" size={24} color="#A1A1AA" />
                            </TouchableOpacity>
                        </>
                    )}

                    {/* App Settings */}
                    <SectionHeader title="App Settings" />
                    <View style={styles.sectionContainer}>
                        <LinkItem label="Get audio kits for travellers" onPress={() => navigation.navigate('AudioKits')} />
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
                            onPress={() => navigation.navigate('HelpSupport', { isAdmin })}
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
                            <Text style={styles.deleteButtonText}>
                                {userRole === 'admin' ? "Delete Company" : 
                                 (userRole === 'co-host' || userRole === 'manager') ? "Leave team" : 
                                 "Delete Account"}
                            </Text>
                        </TouchableOpacity>
                    </View>

                </ScrollView>
            </SafeAreaView>

            {/* Sign Out Modal */}
            <Modal
                isVisible={signOutVisible}
                onBackdropPress={() => setSignOutVisible(false)}
                onSwipeComplete={() => setSignOutVisible(false)}
                swipeDirection="down"
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
                style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
            >
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Sign Out</Text>
                    <Text style={styles.modalMessage}>Are you sure you want to sign out?</Text>

                    <TouchableOpacity
                        style={[styles.modalConfirmButton, isLoggingOut && { opacity: 0.7 }]}
                        onPress={async () => {
                            setIsLoggingOut(true);
                            try {
                                // 1. Unregister notifications before signing out
                                await unregisterForPushNotificationsAsync();
                                
                                // 2. Sign out
                                await signOut(auth);
                                // The onAuthStateChanged listener in App.js will handle redirecting to Welcome
                            } catch (error) {
                                console.warn("Error signing out:", error);
                                setIsLoggingOut(false);
                            }
                        }}
                        disabled={isLoggingOut}
                    >
                        <Text style={styles.modalConfirmText}>{isLoggingOut ? "Signing Out..." : "Sign Out"}</Text>
                    </TouchableOpacity>

                    <GradientBorderButton
                        text="Cancel"
                        onPress={() => setSignOutVisible(false)}
                        innerBg="#1E2124"
                    />
                </View>
            </Modal>

            {/* Delete Modal */}
            <Modal
                isVisible={deleteVisible}
                onBackdropPress={() => setDeleteVisible(false)}
                onSwipeComplete={() => setDeleteVisible(false)}
                swipeDirection="down"
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
                style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
            >
                <View style={styles.modalContent}>
                    <Text style={styles.modalMessageLarge}>
                        {userRole === 'co-host' || userRole === 'manager' 
                            ? "Are you sure you want to leave the team?" 
                            : `Are you sure you want to delete the ${userRole === 'admin' ? "company" : ""} account? Your data cannot be recovered after deletion.`}
                    </Text>

                    <TouchableOpacity
                        style={[styles.modalConfirmButton, isDeleting && { opacity: 0.5 }]}
                        onPress={handleAction}
                        disabled={isDeleting}
                    >
                        <Text style={styles.modalConfirmText}>
                            {isDeleting 
                                ? (userRole === 'co-host' || userRole === 'manager' ? "Leaving..." : "Deleting...") 
                                : (userRole === 'co-host' || userRole === 'manager' ? "Leave Team" : "Delete")}
                        </Text>
                    </TouchableOpacity>

                    <GradientBorderButton
                        text="Cancel"
                        onPress={() => setDeleteVisible(false)}
                        innerBg="#1E2124"
                    />
                </View>
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
        fontSize: 30,
        color: '#FFF',
        fontFamily: Typography.serif.regular,
    },
    headerSubtitle: {
        fontSize: 15,
        fontFamily: Typography.sans.regular,
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
        fontSize: 18,
        fontFamily: Typography.sans.semiBold,
        color: '#FFF',
        marginTop: 24,
        letterSpacing: 0.2,
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
        letterSpacing: 0.2,
        fontFamily: Typography.sans.regular,
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
        fontSize: 16,
        fontFamily: Typography.sans.regular,
        letterSpacing: 0.2,
    },
    switchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12, // Switch is taller
    },
    separator: {
        height: 1,
        backgroundColor: '#23272A',
    },
    // Action Buttons Styles
    actionButtonsContainer: {
        marginTop: 30,
        gap: 16,
    },
    signOutButton: {
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    signOutButtonText: {
        color: '#FFF',
        fontSize: 14,
        letterSpacing: 0.2,
        fontFamily: Typography.sans.semiBold,
    },
    deleteButton: {

        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: '#FF383C',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButtonText: {
        color: '#FF383C',
        fontSize: 16,
        letterSpacing: 0.2,
        fontFamily: Typography.sans.semiBold,
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
        fontSize: 18,
        color: '#FFF',
        letterSpacing:0.2,
        fontFamily: Typography.sans.semiBold,
        marginBottom: 16,
    },
    modalMessage: {
        fontSize: 16,
        color: '#FFF',
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        letterSpacing: 0.2,
        marginBottom: 32,
    },
    modalMessageLarge: {
        fontSize: 18,
        color: '#FFF',
        fontFamily: Typography.sans.bold,
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
        fontSize: 17,
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2
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
