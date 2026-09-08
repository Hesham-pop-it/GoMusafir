import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { ref, remove } from 'firebase/database';
import { safeSignOut } from '../../utils/authUtils';

import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import { functions, auth, database } from '../../config/firebase';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';

const TeamJoinScreen = ({ navigation, route }) => {
    const token = route.params?.token;
    const [isLoading, setIsLoading] = useState(true);
    const [statusText, setStatusText] = useState('Verifying invitation token...');
    const [errorMsg, setErrorMsg] = useState('');
    
    const [inviteData, setInviteData] = useState(null); // { role, companyName, orgId, email }
    const [currentUser, setCurrentUser] = useState(auth.currentUser);

    // Track auth state changes to detect sign out
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            setCurrentUser(user);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!token) {
            setErrorMsg('Invalid invitation link. No security token was found.');
            setIsLoading(false);
            return;
        }

        const verifyToken = async () => {
            try {
                const getMetadata = httpsCallable(functions, 'getTeamInviteMetadata');
                const result = await getMetadata({ token });
                const data = result.data; // { role, companyName, orgId, email }
                setInviteData(data);
                
                // If a user is already logged in, check if emails match
                if (auth.currentUser) {
                    const loggedInEmail = auth.currentUser.email?.toLowerCase();
                    const invitedEmail = data.email?.toLowerCase();

                    if (loggedInEmail === invitedEmail) {
                        // Emails match -> Auto Redeem
                        await redeemTeamInvite(data);
                    } else {
                        // Email mismatch -> User must confirm sign out
                        setIsLoading(false);
                    }
                } else {
                    // No user logged in -> Guide them through flow
                    setIsLoading(false);
                }
            } catch (error) {
                console.error("Token verification error:", error);
                setErrorMsg(error.message || 'This invitation link is invalid or has expired.');
                setIsLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const redeemTeamInvite = async (metadata) => {
        setIsLoading(true);
        setStatusText('Accepting invitation and setting up workspace...');
        try {
            const redeem = httpsCallable(functions, 'redeemTeamInvitation');
            await redeem({ token });

            // Clear the Join Flow flag in database if set
            if (auth.currentUser) {
                await remove(ref(database, `users/${auth.currentUser.uid}/join_flow_status`));
            }
            await AsyncStorage.removeItem('mfa_lock');

            Alert.alert(
                "Invitation Accepted",
                `Welcome to ${metadata.companyName}! You have successfully joined as a ${metadata.role}.`,
                [{
                    text: "OK",
                    onPress: () => {
                        navigation.reset({
                            index: 0,
                            routes: [{ name: 'Home' }],
                        });
                    }
                }]
            );
        } catch (error) {
            console.error("Redemption error:", error);
            setErrorMsg(error.message || 'Failed to accept the invitation. Please try again.');
            setIsLoading(false);
        }
    };

    const handleSignOutAndContinue = async () => {
        setIsLoading(true);
        setStatusText('Signing out of current account...');
        try {
            await safeSignOut(auth);
            await AsyncStorage.removeItem('mfa_lock');
            setIsLoading(false);
        } catch (error) {
            console.error("Sign out error:", error);
            Alert.alert("Sign Out Failed", "Could not sign out. Please try again.");
            setIsLoading(false);
        }
    };

    const handleGetStarted = () => {
        if (!inviteData) return;
        navigation.navigate('JoinEmail', {
            isTeamInvite: true,
            teamInviteToken: token,
            email: inviteData.email,
            role: inviteData.role,
            companyName: inviteData.companyName
        });
    };

    const handleCancel = () => {
        navigation.navigate('Welcome');
    };

    if (isLoading) {
        return (
            <GlowBackground>
                <SafeAreaView style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#B99A4A" style={{ marginBottom: 20 }} />
                    <Text style={styles.statusText}>{statusText}</Text>
                </SafeAreaView>
            </GlowBackground>
        );
    }

    if (errorMsg) {
        return (
            <GlowBackground>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={22} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.errorContainer}>
                        <Ionicons name="alert-circle-outline" size={64} color="#FF4B4B" style={{ marginBottom: 20 }} />
                        <Text style={styles.errorTitle}>Invitation Error</Text>
                        <Text style={styles.errorText}>{errorMsg}</Text>
                        
                        <View style={{ flex: 1 }} />
                        
                        <GradientBorderButton
                            text="Back to Home"
                            onPress={handleCancel}
                            style={{ marginBottom: 40, width: '100%' }}
                        />
                    </View>
                </SafeAreaView>
            </GlowBackground>
        );
    }

    // Check for Email Mismatch state
    const loggedInEmail = currentUser?.email?.toLowerCase();
    const invitedEmail = inviteData?.email?.toLowerCase();
    
    if (currentUser && loggedInEmail !== invitedEmail) {
        return (
            <GlowBackground>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={22} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    
                    <View style={styles.cardContainer}>
                        <Ionicons name="people-outline" size={48} color="#B99A4A" style={{ marginBottom: 15 }} />
                        <Text style={styles.cardTitle}>Account Conflict</Text>
                        <Text style={styles.cardSub}>
                            You are currently signed in as:{"\n"}
                            <Text style={styles.highlightText}>{currentUser.email}</Text>
                        </Text>
                        
                        <Text style={styles.cardBody}>
                            This invitation was sent to:{"\n"}
                            <Text style={styles.highlightText}>{inviteData?.email}</Text>
                        </Text>
                        
                        <Text style={styles.cardNotice}>
                            To accept this invitation, please sign out of your current account and sign in or create an account with the correct email.
                        </Text>
                        
                        <View style={{ flex: 1 }} />
                        
                        <GradientBorderButton
                            text="Sign Out & Continue"
                            onPress={handleSignOutAndContinue}
                            style={{ marginBottom: 15 }}
                        />
                        
                        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </GlowBackground>
        );
    }

    // Default welcome state
    return (
        <GlowBackground>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                </View>

                <View style={styles.cardContainer}>
                    <Ionicons name="mail-open-outline" size={48} color="#B99A4A" style={{ marginBottom: 15 }} />
                    <Text style={styles.cardTitle}>Team Invitation</Text>
                    
                    <Text style={styles.invitationText}>
                        You have been invited to join <Text style={styles.boldText}>{inviteData?.companyName}</Text> as a <Text style={styles.boldText}>{inviteData?.role}</Text>.
                    </Text>
                    
                    <Text style={styles.cardSub}>
                        Invitation sent to:{"\n"}
                        <Text style={styles.highlightText}>{inviteData?.email}</Text>
                    </Text>

                    <View style={{ flex: 1 }} />

                    <GradientBorderButton
                        text="Accept & Get Started"
                        onPress={handleGetStarted}
                        style={{ marginBottom: 15 }}
                    />
                    
                    <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </GlowBackground>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    statusText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
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
    errorContainer: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
        alignItems: 'center',
    },
    errorTitle: {
        fontSize: responsiveFontSize(24),
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        marginBottom: 15,
        textAlign: 'center',
    },
    errorText: {
        fontSize: responsiveFontSize(16),
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 24,
    },
    cardContainer: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 30,
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: responsiveFontSize(28),
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        marginBottom: 20,
        textAlign: 'center',
    },
    invitationText: {
        fontSize: responsiveFontSize(18),
        color: '#FFF',
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 28,
        marginBottom: 30,
    },
    boldText: {
        fontFamily: Typography.sans.bold,
        color: '#B99A4A',
    },
    cardSub: {
        fontSize: responsiveFontSize(14),
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    highlightText: {
        fontSize: responsiveFontSize(16),
        color: '#FFF',
        fontFamily: Typography.sans.bold,
    },
    cardBody: {
        fontSize: responsiveFontSize(14),
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    cardNotice: {
        fontSize: responsiveFontSize(14),
        color: '#FF8888',
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 22,
        marginTop: 20,
        paddingHorizontal: 10,
    },
    cancelButton: {
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        marginBottom: 40,
    },
    cancelButtonText: {
        color: '#A1A1AA',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
});

export default TeamJoinScreen;
