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
    ScrollView,
    Alert,
    Keyboard,
    PanResponder,
    Animated,
    Dimensions,
    FlatList
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { COUNTRIES } from '../../constants/Countries';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import GlowBackground from '../../components/GlowBackground';
import GradientBorderButton from '../../components/GradientBorderButton';
import { auth, functions, database, storage } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, fetchSignInMethodsForEmail } from 'firebase/auth';
import { ref as dbRef, set, remove, serverTimestamp, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';


// --- Shared Components ---
const EyeIcon = () => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <G clipPath="url(#clip0_1408_8588)">
            <Path
                d="M9.34203 18.7819L7.41103 18.2639L8.19803 15.3249C7.01999 14.8904 5.92514 14.2572 4.96103 13.4529L2.80803 15.6069L1.39303 14.1919L3.54703 12.0389C2.3311 10.5826 1.51411 8.83563 1.17603 6.96886L3.14403 6.60986C3.90303 10.8119 7.57903 13.9999 12 13.9999C16.42 13.9999 20.097 10.8119 20.856 6.60986L22.824 6.96786C22.4864 8.83488 21.6697 10.5822 20.454 12.0389L22.607 14.1919L21.192 15.6069L19.039 13.4529C18.0749 14.2572 16.9801 14.8904 15.802 15.3249L16.589 18.2649L14.658 18.7819L13.87 15.8419C12.6324 16.0539 11.3677 16.0539 10.13 15.8419L9.34203 18.7819Z"
                fill="#71717A"
            />
        </G>
        <Defs>
            <ClipPath id="clip0_1408_8588">
                <Rect width="24" height="24" fill="white" />
            </ClipPath>
        </Defs>
    </Svg>
);

// --- Shared Layout ---
const JoinLayout = ({ navigation, title, label, children, onContinue, isValid = true, buttonText = "Continue" }) => {
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

    return (
        <GlowBackground>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.content}
                >
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ flexGrow: 1 }}
                        bounces={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <Text style={styles.title}>{title}</Text>

                        {label && <Text style={styles.label}>{label}</Text>}

                        <View style={{ flex: 1 }}>
                            {children}
                        </View>
                    </ScrollView>

                    <GradientBorderButton
                        text={buttonText}
                        onPress={onContinue}
                        disabled={!isValid}
                        style={{ marginBottom: isKeyboardVisible ? 20 : 100 }}
                    />
                </KeyboardAvoidingView>
            </SafeAreaView>
        </GlowBackground>
    );
};

// --- Screen 1: First Name ---
export const JoinFirstNameScreen = ({ navigation, route }) => {
    const [firstName, setFirstName] = useState('');
    // Merge params in case we loop back, though usually route.params is from previous
    const previousData = route.params || {};

    const handleContinue = () => {
        console.log("[JoinFlow] Moving to LastName with:", { ...previousData, firstName });
        navigation.navigate('JoinLastName', { ...previousData, firstName });
    };


    return (
        <JoinLayout
            navigation={navigation}
            title="Join as Participant"
            label="First name"
            onContinue={handleContinue}
            isValid={firstName.length > 0}
        >
            <View style={styles.inputWrapper}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter your first name"
                    placeholderTextColor="#71717A"
                    value={firstName}
                    onChangeText={setFirstName}
                />
            </View>
        </JoinLayout>
    );
};

// --- Screen 2: Last Name ---
export const JoinLastNameScreen = ({ navigation, route }) => {
    const [lastName, setLastName] = useState('');
    const previousData = route.params || {};

    const handleContinue = () => {
        console.log("[JoinFlow] Moving to Phone with:", { ...previousData, lastName });
        navigation.navigate('JoinPhone', { ...previousData, lastName });
    };


    return (
        <JoinLayout
            navigation={navigation}
            title="Join as Participant"
            label="Last name"
            onContinue={handleContinue}
            isValid={lastName.length > 0}
        >
            <View style={styles.inputWrapper}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter your last name"
                    placeholderTextColor="#71717A"
                    value={lastName}
                    onChangeText={setLastName}
                />
            </View>
        </JoinLayout>
    );
};

// --- Screen 3: Email ---
export const JoinEmailScreen = ({ navigation, route }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    
    // Track if we are in signup mode (User not found after check) (S3/S6)
    const [isSignupMode, setIsSignupMode] = useState(false);
    const previousData = route.params || {};

    const showPasswordFields = email.length > 5 && email.includes('@');

    // Logic Adjustment: Background check removed (Now performs check on Continue click)

    const handleContinue = async () => {
        if (!email.includes('@') || password.length < 6) {
            Alert.alert("Invalid Input", "Please enter a valid email and a password of at least 6 characters.");
            return;
        }

        setIsLoading(true);
        try {
            let userCredential;
            let currentUserId;

            if (!isSignupMode) {
                // Step 1: Check if user exists on "Continue" click via secure Cloud Function
                const checkUser = httpsCallable(functions, 'checkUserExistence');
                const result = await checkUser({ email: email.trim().toLowerCase() });
                const userExists = result.data?.exists;

                if (userExists) {
                    // User Exists -> Log In
                    try {
                        userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
                        currentUserId = userCredential.user.uid;

                        // RBAC Check: Admins cannot login as participants
                        // S6: Role-Based Access Control
                        const userSnap = await get(dbRef(database, `users/${currentUserId}`));
                        if (userSnap.exists() && userSnap.val().staff_org_id) {
                            await signOut(auth);
                            Alert.alert("Account Conflict", "This business account cannot be used to join as a participant. Please use a separate participant account.");
                            setIsLoading(false);
                            return;
                        }

                        // Set flag in database to prevent App.js from redirecting to Home instantly
                        await set(dbRef(database, `users/${currentUserId}/join_flow_status`), {
                            isJoining: true,
                            updated_at: serverTimestamp()
                        });

                        // Navigate to Verification/Redeem path for existing users
                        const sendOTP = httpsCallable(functions, 'sendCustomEmailOTP');
                        await sendOTP({ email: email.trim(), uid: currentUserId, isMobile: true });

                        navigation.navigate('BusinessVerification', {
                            title: "Verify your email",
                            description: `We've sent a 6-digit secure code to ${email.trim()}. Please enter it below.`,
                            targetScreen: "JoinTerms",
                            uid: currentUserId,
                            isExistingUser: true,
                            ...previousData,
                            email: email.trim(), // Ensure email is in the persistent data object
                        });
                    } catch (loginError) {
                        if (loginError.code === 'auth/wrong-password' || loginError.code === 'auth/invalid-credential') {
                            Alert.alert("Incorrect Password", "The password you entered is incorrect. Please try again.");
                        } else {
                            throw loginError;
                        }
                    }
                } else {
                    // User Not Found -> Show Confirm Password field
                    setIsSignupMode(true);
                }
            } else {
                // Step 2: User is in signup mode (Clicked Continue again)
                if (password !== confirmPassword) {
                    Alert.alert("Mismatch", "Passwords do not match.");
                    setIsLoading(false);
                    return;
                }

                try {
                    userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
                    currentUserId = userCredential.user.uid;

                    // Set flag in database to prevent App.js from redirecting to Home instantly
                    await set(dbRef(database, `users/${currentUserId}/join_flow_status`), {
                        isJoining: true,
                        updated_at: serverTimestamp()
                    });


                    // Navigate to standard signup flow
                    const sendOTP = httpsCallable(functions, 'sendCustomEmailOTP');
                    await sendOTP({ email: email.trim(), uid: currentUserId, isMobile: true });

                    navigation.navigate('BusinessVerification', {
                        title: "Verify your email",
                        description: `We've sent a 6-digit secure code to ${email.trim()}. Please enter it below.`,
                        targetScreen: "JoinFirstName",
                        uid: currentUserId,
                        isExistingUser: false,
                        ...previousData,
                        email: email.trim(),
                    });
                } catch (signupError) {
                    throw signupError;
                }
            }
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                // If we attempted signup but user exists (fallback)
                setIsSignupMode(false);
                Alert.alert("Account Exists", "This email is already registered. Please enter your password to log in.");
            } else {
                Alert.alert("Error", error.message || "An error occurred. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };



    // Validation Logic
    let isValid = false;
    if (showPasswordFields) {
        if (!isSignupMode) {
            isValid = password.length >= 6;
        } else {
            isValid = password.length >= 6 && confirmPassword.length >= 6 && password === confirmPassword;
        }
    } else {
        isValid = email.includes('@'); 
    }

    return (
        <JoinLayout
            navigation={navigation}
            title={"Join as Participant"}
            label="Email address"
            onContinue={handleContinue}
            isValid={isValid && !isLoading}
            buttonText={isLoading ? "Please wait..." : (isSignupMode ? "Create Account" : "Continue")}
        >
            <View style={styles.inputWrapper}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter your email address"
                    placeholderTextColor="#71717A"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
            </View>

            {showPasswordFields && (
                <View style={{ marginTop: 0 }}>
                    <Text style={styles.label}>Password</Text>
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter password"
                            placeholderTextColor="#71717A"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>                            
                                <EyeIcon />                            
                        </TouchableOpacity>
                    </View>

                    {isSignupMode && (
                        <>
                            <Text style={styles.label}>Confirm Password</Text>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Confirm password"
                                    placeholderTextColor="#71717A"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showConfirmPassword}
                                />
                                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                                    <EyeIcon />
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </View>
            )}
        </JoinLayout>
    );
};

// --- Screen 4: Phone ---
export const JoinPhoneScreen = ({ navigation, route }) => {
    const [phone, setPhone] = useState('');
    const [isPickerVisible, setPickerVisible] = useState(false);
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES.find(c => c.name === 'Netherlands') || COUNTRIES[0]);
    const previousData = route.params || {};

    const { height: screenHeight } = Dimensions.get('window');
    const panY = React.useRef(new Animated.Value(0)).current;

    const swipeResponder = PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
            const { dy, dx } = gestureState;
            return dy > 5 && dy > Math.abs(dx);
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
            const { dy, dx } = gestureState;
            return dy > 20 && dy > Math.abs(dx);
        },
        onPanResponderMove: (_, gestureState) => {
            if (gestureState.dy > 0) {
                panY.setValue(gestureState.dy);
            }
        },
        onPanResponderRelease: (_, gestureState) => {
            if (gestureState.dy > 120 || (gestureState.dy > 50 && gestureState.vy > 0.5)) {
                Animated.timing(panY, {
                    toValue: screenHeight,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => {
                    setPickerVisible(false);
                    panY.setValue(0);
                });
            } else {
                Animated.spring(panY, {
                    toValue: 0,
                    friction: 8,
                    useNativeDriver: true,
                }).start();
            }
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => true,
    });

    const handleContinue = () => {
        const fullPhone = `${selectedCountry.code}${phone}`;
        console.log("[JoinFlow] Moving to ProfilePic with:", { ...previousData, phone: fullPhone });
        navigation.navigate('JoinProfilePicture', { ...previousData, phone: fullPhone });
    };


    const selectCountry = (country) => {
        setSelectedCountry(country);
        setPickerVisible(false);
    };

    return (
        <JoinLayout
            navigation={navigation}
            title="Join as Participant"
            label="Phone number"
            onContinue={handleContinue}
            isValid={phone.length > 5}
        >
            <View style={styles.phoneRow}>
                <TouchableOpacity
                    style={[styles.inputWrapper, styles.countryCode]}
                    onPress={() => setPickerVisible(true)}
                >
                    <Text style={styles.inputText} numberOfLines={1}>{selectedCountry.flag} {selectedCountry.code}</Text>
                    <Ionicons name="chevron-down" size={16} color="#FFF" style={{ marginLeft: 5 }} />
                </TouchableOpacity>
                <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter your phone number"
                        placeholderTextColor="#71717A"
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                    />
                </View>
            </View>

            <Modal
                isVisible={isPickerVisible}
                onBackdropPress={() => setPickerVisible(false)}
                onSwipeComplete={() => setPickerVisible(false)}
                swipeDirection="down"
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
                style={{ margin: 0, justifyContent: 'flex-end' }}
            >
                <Animated.View
                    style={[
                        styles.countryModalContent,
                        { transform: [{ translateY: panY }] }
                    ]}
                    {...swipeResponder.panHandlers}
                >
                    <View style={styles.modalHandle} />
                    <View style={styles.countryListContainer}>
                        <FlatList
                            data={COUNTRIES}
                            keyExtractor={(item, index) => `${item.name}-${index}`}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.countryListContent}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.countryRow}
                                    onPress={() => selectCountry(item)}
                                >
                                    <View style={styles.countryInfo}>
                                        <Text style={styles.countryFlag}>{item.flag}</Text>
                                        <Text style={styles.countryName}>{item.name}</Text>
                                    </View>
                                    <Text style={styles.countryCodeText}>{item.code}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </Animated.View>
            </Modal>
        </JoinLayout>
    );
};

// --- Screen 5: Profile Picture ---
export const JoinProfilePictureScreen = ({ navigation, route }) => {
    const [image, setImage] = useState(null);
    const previousData = route.params || {};

    const pickImage = async () => {
        // Explicitly request permissions to favor gallery access
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Needed', 'Please allow access to your gallery to upload a photo.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], // Modern way to specify types
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            setImage(result.assets[0].uri);
        }
    };

    const handleContinue = () => {
        console.log("[JoinFlow] Moving to Terms with:", { ...previousData, image: image ? "Selected" : "None" });
        navigation.navigate('JoinTerms', { ...previousData, image });
    };


    return (
        <JoinLayout
            navigation={navigation}
            title="Join as Participant"
            label="Profile Picture"
            onContinue={handleContinue}
            isValid={!!image} // Require image? The screenshot shows "Continue" active maybe even if empty? Assuming required.
        >
            <View style={styles.uploadContainer}>
                {image ? (
                    <TouchableOpacity style={styles.uploadedImage} onPress={pickImage}>
                        <Image source={{ uri: image }} style={styles.uploadedImage} />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.uploadPlaceholder}>
                        <Text style={styles.uploadTextTitle}>Upload a photo</Text>
                        <Text style={styles.uploadTextSub}>Recommended size: 1080 x 1080px</Text>
                        <Text style={styles.uploadTextSub}>(JPG, PNG, GIF)</Text>

                        <GradientBorderButton
                            onPress={pickImage}
                            style={{ width: 100, marginTop: 20 }}
                            innerBg="transparent"
                        >
                            <Text style={styles.uploadBtnText}>Upload</Text>
                        </GradientBorderButton>
                    </View>
                )}
            </View>
        </JoinLayout>
    );
};

// --- Screen 6: Terms ---
export const JoinTermsScreen = ({ navigation, route }) => {
    const [accepted, setAccepted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const previousData = route.params || {};

    const handleContinue = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            let photoURL = previousData.photoURL;
            // S22: Upload image to Storage if present as local URI
            if (previousData.image && auth.currentUser) {
                try {
                    const response = await fetch(previousData.image);
                    const blob = await response.blob();
                    const picRef = storageRef(storage, `users/${auth.currentUser.uid}/profile_pic.jpg`);
                    await uploadBytes(picRef, blob);
                    photoURL = await getDownloadURL(picRef);
                } catch (imgError) {
                    console.warn("Image upload failed, continuing without photo.", imgError);
                }
            }

            console.log("[JoinFlow] Sending to redeemInvitation:", {
                inviteCode: previousData.invitationCode,
                firstName: previousData.firstName,
                lastName: previousData.lastName,
                phone: previousData.phone,
                photoURL: photoURL ? "Present" : "Missing"
            });

            const redeemInvite = httpsCallable(functions, 'redeemInvitation');
            const result = await redeemInvite({
                inviteCode: previousData.invitationCode,
                voiceConsent: accepted || route.params?.isExistingUser,
                locationConsent: accepted || route.params?.isExistingUser,
                firstName: previousData.firstName,
                lastName: previousData.lastName,
                phone: previousData.phone,
                photoURL: photoURL,
            });




            const tripId = result.data?.tripId;

            // Clear the Join Flow flag in database so global navigation is restored
            if (auth.currentUser) {
                await remove(dbRef(database, `users/${auth.currentUser.uid}/join_flow_status`));
            }

            // S22: Navigate to TripOverview with explicit IDs
            navigation.reset({
                index: 0,
                routes: [{ 
                    name: 'TripOverview', 
                    params: { 
                        tripId: tripId, 
                        orgId: result.data?.orgId,
                        invitationCode: previousData.invitationCode,
                        isAdmin: false 
                    } 
                }],
            });


        } catch (error) {
            console.warn("Redeem Invite Error:", error);

            Alert.alert("Error Joining Trip", error.message || "Failed to join. Please try again or check your invite code.");
        } finally {
            setIsLoading(false);
        }
    };

    // Auto-join for existing users (Flow Adjustment)
    useEffect(() => {
        if (route.params?.isExistingUser) {
            handleContinue();
        }
    }, [route.params?.isExistingUser]);

    return (
        <JoinLayout
            navigation={navigation}
            title="Join as Participant"
            onContinue={handleContinue}
            isValid={accepted && !isLoading}
            buttonText={isLoading ? "Please wait..." : "Continue"}
        >
            <View
                style={styles.termsContainer}

            >
                <TouchableOpacity onPress={() => setAccepted(!accepted)} activeOpacity={1} style={[styles.checkbox, accepted && styles.checkboxChecked]}>
                    {accepted && (
                        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <Rect x="3" y="3" width="18" height="18" rx="6" fill="#B99A4A" />
                            <Path d="M10 16.4L6 12.4L7.4 11L10 13.6L16.6 7L18 8.4L10 16.4Z" fill="white" />
                        </Svg>
                    )}
                </TouchableOpacity>
                <Text style={styles.termsText}>
                    I accept <Text style={styles.linkText}>Terms & Privacy</Text> and consent to live voice and, if enabled, recording, location sharing is controllable in app.
                </Text>
            </View>
        </JoinLayout>
    );
};


const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
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
        fontSize: responsiveFontSize(28),
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        marginBottom: 40,
    },
    label: {
        color: '#FFFBF3',
        fontSize: responsiveFontSize(14),
        marginBottom: 10,
        fontFamily: Typography.sans.regular,
    },
    inputWrapper: {
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#23272A',
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    input: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
        width: '80%',
        height: '100%',
    },
    inputText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.regular,
    },
    phoneRow: {
        flexDirection: 'row',
        gap: 12,
    },
    countryCode: {
        width: 105, // Increased from 80 to accommodate flag and longer codes
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        justifyContent: 'center', // Center content
    },

    // Profile Picture Styles
    uploadContainer: {
        width: '100%',
        aspectRatio: 1,
        borderWidth: 2,
        borderColor: '#B99A4A',
        borderStyle: 'dashed',
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        marginBottom: 20,
        overflow: 'hidden',
    },
    uploadedImage: {
        width: '100%',
        height: '100%',
    },
    uploadPlaceholder: {
        alignItems: 'center',
        padding: 20,
    },
    uploadTextTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.regular,
        marginBottom: 8,
    },
    uploadTextSub: {
        color: '#fff',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
        marginBottom: 4,
    },
    uploadBtnPill: {
        marginTop: 20,
        paddingVertical: 10,
        paddingHorizontal: 30,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#636D77',
        backgroundColor: '#23272A',
    },
    uploadBtnText: {
        color: '#FFF',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.regular,
    },
    // Terms Styles
    termsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        // marginTop: 20,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#49454F',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    checkboxChecked: {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
    },
    termsText: {
        color: '#E0E0E0',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.regular,
        lineHeight: 22,
        flex: 1,
    },
    linkText: {
        color: '#B99A4A',
        fontFamily: Typography.sans.regular,
        // textDecorationLine: 'underline',
    },
    // Country Picker Styles
    countryModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    countryModalContent: {
        backgroundColor: 'transparent',
        height: '79%',
    },
    countryModalHeader: {
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 10,
    },
    modalBackButton: {
        marginBottom: 15,
        marginLeft: -5,
    },
    modalTitle: {
        fontSize: responsiveFontSize(32),
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        marginBottom: 20,
    },
    countryListContainer: {
        flex: 1,
        backgroundColor: '#23272A', // Gray background for the actual list box
        marginHorizontal: 0,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
        paddingTop: 10,
    },
    countryListContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    countryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 18,
    },
    countryInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    countryFlag: {
        fontSize: responsiveFontSize(20),
        marginRight: 15,
    },
    countryName: {
        fontSize: responsiveFontSize(16),
        color: '#FFF',
        fontFamily: Typography.sans.regular,
        flex: 1,
    },
    countryCodeText: {
        fontSize: responsiveFontSize(16),
        color: '#B99A4A', // Yellow/Gold color
        fontFamily: Typography.sans.medium,
    },
    modalHandle: {
        width: 60,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 3,
        alignSelf: 'center',
        marginVertical: 10,
    },
    eyeIcon: {
        padding: 4,
    },
});
