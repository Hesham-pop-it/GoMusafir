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
    FlatList,
    Modal as RNModal
} from 'react-native';
import Modal from '../../components/CompatModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { COUNTRIES } from '../../constants/Countries';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import GlowBackground from '../../components/GlowBackground';
import GradientBorderButton from '../../components/GradientBorderButton';
import { auth, functions, database, storage } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, fetchSignInMethodsForEmail, signOut } from 'firebase/auth';
import { ref as dbRef, set, remove, update, serverTimestamp, get } from 'firebase/database';
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
            // S22: Check capacity BEFORE login/signup to avoid App.js session conflicts
            const getMetadata = httpsCallable(functions, 'getInviteMetadata');
            const metaResult = await getMetadata({ 
                inviteCode: previousData.invitationCode,
                email: email.trim().toLowerCase() 
            });
            const tripDetails = metaResult.data;

            if (tripDetails.isFull && !tripDetails.alreadyJoined) {
                setIsLoading(false);
                Alert.alert(
                    "Trip Full",
                    `Sorry, this trip has reached its maximum capacity of ${tripDetails.totalSeats} participants.`,
                    [{ 
                        text: "OK",
                        onPress: () => navigation.navigate('Welcome') 
                    }]
                );
                return;
            }

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
                        const userData = userSnap.val() || {};
                        const idTokenResult = await userCredential.user.getIdTokenResult(true);
                        const role = idTokenResult.claims.role;
                        const isStaff = !!userData.staff_org_id || ['admin', 'co-host', 'manager'].includes(role);

                        if (isStaff) {
                            await signOut(auth);
                            Alert.alert("Account Conflict", "This business account cannot be used to join as a participant. Please use a separate participant account.");
                            setIsLoading(false);
                            return;
                        }

                        // Set flags in database to prevent App.js from redirecting to Home instantly
                        const updates = {};
                        updates[`users/${currentUserId}/join_flow_status`] = {
                            isJoining: true,
                            invitationCode: previousData.invitationCode,
                            isExistingUser: true,
                            updated_at: serverTimestamp()
                        };
                        updates[`users/${currentUserId}/mfa_pending`] = true;
                        
                        await update(dbRef(database), updates);

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

    const [scrollOffset, setScrollOffset] = useState(0);
    const flatListRef = React.useRef(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!isPickerVisible) {
            setSearchQuery('');
        }
    }, [isPickerVisible]);

    const filteredCountries = React.useMemo(() => {
        if (!searchQuery) return COUNTRIES;
        const query = searchQuery.toLowerCase().trim();
        return COUNTRIES.filter(
            (c) =>
                c.name.toLowerCase().includes(query) ||
                c.code.includes(query)
        );
    }, [searchQuery]);

    const handleOnScroll = (event) => {
        setScrollOffset(event.nativeEvent.contentOffset.y);
    };

    const handleScrollTo = (p) => {
        if (flatListRef.current) {
            flatListRef.current.scrollToOffset({ offset: p.y, animated: p.animated });
        }
    };

    const handleContinue = () => {
        const fullPhone = `${selectedCountry.code}${phone}`;
        navigation.navigate('JoinProfilePicture', { ...previousData, phone: fullPhone });
    };


    const selectCountry = (country) => {
        setSelectedCountry(country);
        setPickerVisible(false);
        setSearchQuery('');
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
                        onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, ''))}
                        keyboardType="phone-pad"
                    />
                </View>
            </View>

            <Modal
                isVisible={isPickerVisible}
                onBackdropPress={() => setPickerVisible(false)}
                onBackButtonPress={() => setPickerVisible(false)}
                onSwipeComplete={() => setPickerVisible(false)}
                swipeDirection="down"
                swipeThreshold={100}
                propagateSwipe={true}
                scrollTo={handleScrollTo}
                scrollOffset={scrollOffset}
                scrollOffsetMax={300}
                useNativeDriver={false}
                useNativeDriverForBackdrop={true}
                hideModalContentWhileAnimating={true}
                style={{ margin: 0, justifyContent: 'flex-end' }}
            >
                <View style={styles.countryModalContent}>
                    <View style={{ width: '100%', paddingVertical: 4, backgroundColor: 'transparent' }}>
                        <View style={styles.modalHandle} />
                    </View>
                    <View style={styles.countryListContainer}>
                        <View style={styles.searchWrapper}>
                            <Ionicons name="search" size={20} color="#71717A" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search country..."
                                placeholderTextColor="#71717A"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity
                                    style={styles.clearSearchButton}
                                    onPress={() => setSearchQuery('')}
                                >
                                    <Ionicons name="close-circle" size={20} color="#71717A" />
                                </TouchableOpacity>
                            )}
                        </View>
                        <FlatList
                            ref={flatListRef}
                            onScroll={handleOnScroll}
                            scrollEventThrottle={16}
                            data={filteredCountries}
                            keyExtractor={(item, index) => `${item.name}-${index}`}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.countryListContent}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <Text style={styles.emptyText}>No countries found</Text>
                                </View>
                            }
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
                </View>
            </Modal>
        </JoinLayout>
    );
};

const CROP_SIZE = 280;

const getBaseDimensions = (imgWidth, imgHeight) => {
    const width = Number(imgWidth);
    const height = Number(imgHeight);
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        return { width: CROP_SIZE, height: CROP_SIZE };
    }
    const imgRatio = width / height;
    if (imgRatio > 1) {
        return {
            width: CROP_SIZE * imgRatio,
            height: CROP_SIZE,
        };
    } else {
        return {
            width: CROP_SIZE,
            height: CROP_SIZE / imgRatio,
        };
    }
};

const CustomSlider = ({ value, onChange, min = 1, max = 3 }) => {
    const sliderWidth = 180;
    const knobSize = 24;
    
    const percentage = (value - min) / (max - min);
    const knobLeft = percentage * (sliderWidth - knobSize);

    const handleTouch = (evt) => {
        const x = evt.nativeEvent.locationX;
        const newPercentage = Math.max(0, Math.min(1, x / sliderWidth));
        const newValue = min + newPercentage * (max - min);
        onChange(newValue);
    };

    return (
        <View style={styles.sliderContainer}>
            <TouchableOpacity onPress={() => onChange(Math.max(min, value - 0.2))} style={styles.sliderBtn}>
                <Feather name="minus" size={20} color="#FFF" />
            </TouchableOpacity>
            <View 
                style={styles.sliderTrackWrapper}
                onStartShouldSetResponder={() => true}
                onResponderGrant={handleTouch}
                onResponderMove={handleTouch}
            >
                <View style={styles.sliderTrackBackground} />
                <View 
                    style={[
                        styles.sliderTrackActive,
                        { width: `${percentage * 100}%` }
                    ]}
                />
                <View 
                    style={[
                        styles.sliderKnob,
                        { left: knobLeft }
                    ]}
                />
            </View>
            <TouchableOpacity onPress={() => onChange(Math.min(max, value + 0.2))} style={styles.sliderBtn}>
                <Feather name="plus" size={20} color="#FFF" />
            </TouchableOpacity>
        </View>
    );
};

// --- Screen 5: Profile Picture ---
export const JoinProfilePictureScreen = ({ navigation, route }) => {
    const [image, setImage] = useState(null);
    const previousData = route.params || {};

    // Image cropping states
    const [cropModalVisible, setCropModalVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null); // { uri, width, height }
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const stateRef = React.useRef({ zoom: 1, pan: { x: 0, y: 0 }, selectedImage: null });
    stateRef.current = { zoom, pan, selectedImage };

    const clampOffset = (x, y, currentZoom) => {
        const img = stateRef.current.selectedImage;
        if (!img) return { x: 0, y: 0 };
        const base = getBaseDimensions(img.width, img.height);
        const displayWidth = base.width * currentZoom;
        const displayHeight = base.height * currentZoom;
        
        const minX = -(displayWidth - CROP_SIZE);
        const minY = -(displayHeight - CROP_SIZE);
        
        const safeX = isNaN(x) ? 0 : x;
        const safeY = isNaN(y) ? 0 : y;
        
        return {
            x: Math.max(minX, Math.min(0, safeX)),
            y: Math.max(minY, Math.min(0, safeY)),
        };
    };

    const handleZoomChange = (newZoom) => {
        const prevZoom = stateRef.current.zoom > 0 ? stateRef.current.zoom : 1;
        const prevPan = stateRef.current.pan || { x: 0, y: 0 };
        
        const centerX = CROP_SIZE / 2;
        const centerY = CROP_SIZE / 2;
        
        let newX = centerX - (newZoom / prevZoom) * (centerX - prevPan.x);
        let newY = centerY - (newZoom / prevZoom) * (centerY - prevPan.y);
        
        const clamped = clampOffset(newX, newY, newZoom);
        setZoom(newZoom);
        setPan(clamped);
    };

    const startPan = React.useRef({ x: 0, y: 0 });
    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                startPan.current = { x: stateRef.current.pan.x, y: stateRef.current.pan.y };
            },
            onPanResponderMove: (evt, gestureState) => {
                const { zoom } = stateRef.current;
                const newX = startPan.current.x + gestureState.dx;
                const newY = startPan.current.y + gestureState.dy;
                setPan(clampOffset(newX, newY, zoom));
            },
        })
    ).current;

    const pickImage = async () => {
        // Explicitly request permissions to favor gallery access
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Needed', 'Please allow access to your gallery to upload a photo.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], // Modern way to specify types
            allowsEditing: false,
            quality: 1,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            const asset = result.assets[0];
            
            const openCropper = (uri, width, height) => {
                const w = Number(width) || CROP_SIZE;
                const h = Number(height) || CROP_SIZE;
                
                setSelectedImage({
                    uri,
                    width: w,
                    height: h,
                });
                setZoom(1);
                
                const base = getBaseDimensions(w, h);
                const initialX = -(base.width - CROP_SIZE) / 2;
                const initialY = -(base.height - CROP_SIZE) / 2;
                setPan({ x: isNaN(initialX) ? 0 : initialX, y: isNaN(initialY) ? 0 : initialY });
                
                setCropModalVisible(true);
            };

            const resizeAndOpen = async (uri, origWidth, origHeight) => {
                let w = Number(origWidth) || 0;
                let h = Number(origHeight) || 0;
                let localUri = uri;

                // Resolve non-file URIs (like ph:// on iOS) by copying them to the local app cache
                if (uri && !uri.startsWith('file://') && !uri.startsWith('http://') && !uri.startsWith('https://')) {
                    try {
                        const filename = uri.split('/').pop() || 'temp_picked_image';
                        const ext = uri.includes('ext=') ? uri.split('ext=').pop()?.split('&')[0] : 'jpg';
                        const targetPath = `${FileSystem.cacheDirectory}${filename}.${ext}`;
                        await FileSystem.copyAsync({
                            from: uri,
                            to: targetPath
                        });
                        localUri = targetPath;
                    } catch (copyErr) {
                        console.warn("Failed to copy asset to local file cache:", copyErr);
                    }
                }

                if (w > 1200 || h > 1200 || w <= 0 || h <= 0) {
                    try {
                        if (w <= 0 || h <= 0) {
                            await new Promise((resolve) => {
                                Image.getSize(
                                    localUri,
                                    (width, height) => {
                                        w = width;
                                        h = height;
                                        resolve();
                                    },
                                    () => {
                                        w = CROP_SIZE;
                                        h = CROP_SIZE;
                                        resolve();
                                    }
                                );
                            });
                        }
                        
                        const ratio = w / h;
                        let targetWidth = w;
                        let targetHeight = h;
                        
                        if (w > 1200 || h > 1200) {
                            if (ratio > 1) {
                                targetWidth = 1200;
                                targetHeight = Math.round(1200 / ratio);
                            } else {
                                targetHeight = 1200;
                                targetWidth = Math.round(1200 * ratio);
                            }
                        }

                        const manip = await manipulateAsync(
                            localUri,
                            [{ resize: { width: targetWidth, height: targetHeight } }],
                            { compress: 0.9, format: SaveFormat.JPEG }
                        );
                        
                        openCropper(manip.uri, manip.width, manip.height);
                    } catch (err) {
                        console.warn("Error processing/downscaling image:", err);
                        openCropper(localUri, w || CROP_SIZE, h || CROP_SIZE);
                    }
                } else {
                    openCropper(localUri, w, h);
                }
            };

            // On iOS, waiting for the ImagePicker modal to dismiss before opening our cropper modal prevents the app from hanging.
            setTimeout(() => {
                resizeAndOpen(asset.uri, asset.width, asset.height);
            }, 500);
        }
    };

    const handleSaveCrop = async () => {
        if (!selectedImage) return;

        try {
            const width = Number(selectedImage.width) || CROP_SIZE;
            const height = Number(selectedImage.height) || CROP_SIZE;

            // Get base display dimensions at zoom = 1
            const base = getBaseDimensions(width, height);
            // Display dimensions at current zoom
            const displayWidth = base.width * zoom;
            
            // Map the top-left offset (-pan.x, -pan.y) and crop dimensions (CROP_SIZE, CROP_SIZE) to original image pixels
            const scaleRatio = displayWidth > 0 ? (width / displayWidth) : 1;
            
            const originX = Math.round(-pan.x * scaleRatio);
            const originY = Math.round(-pan.y * scaleRatio);
            const cropWidth = Math.round(CROP_SIZE * scaleRatio);
            const cropHeight = Math.round(CROP_SIZE * scaleRatio);

            // Double check bounds to prevent crash
            let safeX = Math.max(0, Math.min(width - 1, originX));
            let safeY = Math.max(0, Math.min(height - 1, originY));
            let safeWidth = Math.min(width - safeX, cropWidth);
            let safeHeight = Math.min(height - safeY, cropHeight);

            if (isNaN(safeX) || isNaN(safeY) || isNaN(safeWidth) || isNaN(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
                console.warn("Invalid crop bounds detected:", { safeX, safeY, safeWidth, safeHeight });
                safeX = 0;
                safeY = 0;
                safeWidth = width;
                safeHeight = height;
            }

            const manipResult = await manipulateAsync(
                selectedImage.uri,
                [
                    {
                        crop: {
                            originX: safeX,
                            originY: safeY,
                            width: safeWidth,
                            height: safeHeight,
                        },
                    },
                ],
                { compress: 0.9, format: SaveFormat.JPEG }
            );

            setImage(manipResult.uri);
            setCropModalVisible(false);
        } catch (error) {
            console.error("Error cropping image:", error);
            Alert.alert("Error", "Could not crop image. Please try again.");
        }
    };

    const handleContinue = () => {
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

            {/* Custom Image Cropper Modal */}
            <RNModal
                visible={cropModalVisible}
                animationType="fade"
                transparent={true}
                statusBarTranslucent={true}
                onRequestClose={() => setCropModalVisible(false)}
            >
                <View style={styles.cropperModalBackground}>
                    <View style={styles.cropperHeader}>
                        <Text style={styles.cropperHeaderTitle}>Crop Photo</Text>
                    </View>

                    {/* Image viewport container */}
                    <View 
                        style={[
                            styles.cropContainer,
                            {
                                left: (Dimensions.get('window').width - CROP_SIZE) / 2,
                                top: (Dimensions.get('window').height - CROP_SIZE) / 2 - 40,
                                width: CROP_SIZE,
                                height: CROP_SIZE,
                            }
                        ]}
                        {...panResponder.panHandlers}
                    >
                        {selectedImage && (
                            <Image
                                source={{ uri: selectedImage.uri }}
                                style={{
                                    position: 'absolute',
                                    left: pan.x,
                                    top: pan.y,
                                    width: getBaseDimensions(selectedImage.width, selectedImage.height).width * zoom,
                                    height: getBaseDimensions(selectedImage.width, selectedImage.height).height * zoom,
                                }}
                                resizeMode="cover"
                            />
                        )}
                    </View>

                    {/* SVG Square cutout mask */}
                    <Svg height="100%" width="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
                        <Path
                            fillRule="evenodd"
                            d={`M 0 0 h ${Dimensions.get('window').width} v ${Dimensions.get('window').height} h -${Dimensions.get('window').width} Z M ${Dimensions.get('window').width / 2 - CROP_SIZE / 2} ${Dimensions.get('window').height / 2 - 40 - CROP_SIZE / 2} h ${CROP_SIZE} v ${CROP_SIZE} h -${CROP_SIZE} Z`}
                            fill="rgba(26, 30, 33, 0.85)"
                        />
                    </Svg>

                    {/* Ring highlight over cutout */}
                    <View 
                        style={[
                            styles.cropRing,
                            {
                                left: (Dimensions.get('window').width - CROP_SIZE) / 2 - 1,
                                top: (Dimensions.get('window').height - CROP_SIZE) / 2 - 41,
                                width: CROP_SIZE + 2,
                                height: CROP_SIZE + 2,
                            }
                        ]}
                        pointerEvents="none"
                    />

                    {/* Zoom Slider */}
                    <View style={[styles.sliderWrapper, { top: (Dimensions.get('window').height - CROP_SIZE) / 2 - 40 + CROP_SIZE + 15, left: 0, right: 0 }]}>
                        <CustomSlider
                            value={zoom}
                            onChange={handleZoomChange}
                            min={1}
                            max={3.5}
                        />
                        <Text style={styles.zoomTip}>Drag to pan, slide to zoom</Text>
                    </View>

                    {/* Actions */}
                    <View style={styles.cropperFooter}>
                        <TouchableOpacity style={styles.cropperCancelBtn} onPress={() => setCropModalVisible(false)}>
                            <Text style={styles.cropperCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.cropperSaveBtn} onPress={handleSaveCrop}>
                            <Text style={styles.cropperSaveText}>Apply Crop</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </RNModal>
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
            console.log("[JoinTerms] Starting profile picture upload. Image URI:", previousData.image);
            console.log("[JoinTerms] Auth currentUser UID:", auth.currentUser?.uid);

            // S22: Upload image to Storage if present as local URI
            if (previousData.image && auth.currentUser) {
                try {
                    const response = await fetch(previousData.image);
                    const blob = await response.blob();
                    const picRef = storageRef(storage, `users/${auth.currentUser.uid}/profile_pic.jpg`);
                    await uploadBytes(picRef, blob);
                    photoURL = await getDownloadURL(picRef);
                    console.log("[JoinTerms] Storage upload successful. photoURL:", photoURL);
                } catch (imgError) {
                    console.warn("[JoinTerms] Storage Upload Error:", imgError);
                }
            }

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
                // S22: Set current_trip so Home/App knows which trip to anchor to
                await set(dbRef(database, `users/${auth.currentUser.uid}/current_trip`), tripId);
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
            Alert.alert(
                "Error Joining Trip", 
                error.message || "Failed to join. Please try again or check your invite code.",
                [{ text: "OK", onPress: () => navigation.navigate('Welcome') }]
            );
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
    // Cropper styles
    cropperModalBackground: {
        flex: 1,
        backgroundColor: '#1A1E21',
    },
    cropperHeader: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    cropperHeaderTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
    },
    cropContainer: {
        position: 'absolute',
        overflow: 'hidden',
        backgroundColor: '#000',
    },
    cropRing: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#B99A4A',
        backgroundColor: 'transparent',
    },
    sliderWrapper: {
        position: 'absolute',
        alignItems: 'center',
    },
    zoomTip: {
        color: '#9BA1A6',
        fontSize: 12,
        marginTop: 4,
    },
    cropperFooter: {
        position: 'absolute',
        bottom: 50,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    cropperCancelBtn: {
        flex: 1,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        backgroundColor: '#2C2F33',
        borderWidth: 1,
        borderColor: '#3F4346',
    },
    cropperCancelText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    cropperSaveBtn: {
        flex: 2,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
        backgroundColor: '#B99A4A',
    },
    cropperSaveText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Custom Slider styles
    sliderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E2124',
        paddingHorizontal: 16,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2C2F33',
        height: 48,
    },
    sliderBtn: {
        padding: 8,
    },
    sliderTrackWrapper: {
        width: 180,
        height: 40,
        justifyContent: 'center',
        marginHorizontal: 10,
        position: 'relative',
    },
    sliderTrackBackground: {
        height: 4,
        backgroundColor: '#3F4346',
        borderRadius: 2,
    },
    sliderTrackActive: {
        position: 'absolute',
        left: 0,
        height: 4,
        backgroundColor: '#B99A4A',
        borderRadius: 2,
    },
    sliderKnob: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#B99A4A',
        borderWidth: 2,
        borderColor: '#FFF',
        top: 8,
    },
    searchWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        height: 48,
        marginHorizontal: 20,
        marginTop: 10,
        marginBottom: 10,
        paddingHorizontal: 12,
    },
    searchInput: {
        flex: 1,
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.regular,
        paddingVertical: 8,
        marginLeft: 8,
    },
    clearSearchButton: {
        padding: 4,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        color: '#71717A',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.regular,
    },
});
