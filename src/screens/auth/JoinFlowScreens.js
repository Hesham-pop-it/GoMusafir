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
    Modal,
    FlatList,
    Alert,
    Keyboard,
    TouchableWithoutFeedback
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import GradientBorderButton from '../../components/GradientBorderButton';
import { COUNTRIES } from '../../constants/Countries';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import GlowBackground from '../../components/GlowBackground';

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
        navigation.navigate('JoinEmail', { ...previousData, lastName });
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
    const previousData = route.params || {};

    // Simulation of database check
    const isExistingUser = email.toLowerCase() === 'xyz@gmail.com';
    const showPasswordFields = email.length > 5 && email.includes('@');

    const handleContinue = () => {
        navigation.navigate('JoinPhone', { ...previousData, email, password });
    };

    // Validation Logic
    let isValid = false;
    if (showPasswordFields) {
        if (isExistingUser) {
            isValid = password.length >= 6;
        } else {
            isValid = password.length >= 6 && confirmPassword.length >= 6 && password === confirmPassword;
        }
    } else {
        isValid = email.includes('@'); // Original validation for email only
    }

    return (
        <JoinLayout
            navigation={navigation}
            title="Join as Participant"
            label="Email address"
            onContinue={handleContinue}
            isValid={isValid}
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
                            secureTextEntry
                        />
                    </View>

                    {!isExistingUser && (
                        <>
                            <Text style={styles.label}>Confirm Password</Text>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Confirm password"
                                    placeholderTextColor="#71717A"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry
                                />
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
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES.find(c => c.name === 'Argentina') || COUNTRIES[0]);
    const previousData = route.params || {};

    const handleContinue = () => {
        navigation.navigate('JoinProfilePicture', { ...previousData, phone, countryCode: selectedCountry.code });
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
                visible={isPickerVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setPickerVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setPickerVisible(false)}>
                    <View style={styles.countryModalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={styles.countryModalContent}>

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
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
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
    const previousData = route.params || {};

    const handleContinue = () => {

        // Navigate to OTP Verification (Reusing BusinessVerificationScreen)
        navigation.navigate('BusinessVerification', {
            ...previousData, // Pass everything (firstName, lastName, email, phone, image, invitationCode)
            title: "Check your email",
            description: "We've sent a secure code to your email. Please check your inbox.",
            targetScreen: "TripOverview",
            buttonText: "Join Journey",
            resendText: "Resend"
        });
    };

    return (
        <JoinLayout
            navigation={navigation}
            title="Join as Participant"
            onContinue={handleContinue}
            isValid={accepted}
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
        paddingHorizontal: 16,
        justifyContent: 'center',
        marginBottom: 20,
    },
    input: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
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
});
