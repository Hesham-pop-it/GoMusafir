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
    Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import GradientBorderButton from '../../components/GradientBorderButton';
import { COUNTRIES } from '../../constants/Countries';

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
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.content}
            >
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                    <Text style={styles.title}>{title}</Text>

                    {label && <Text style={styles.label}>{label}</Text>}

                    <View style={{ flex: 1 }}>
                        {children}
                    </View>

                    <GradientBorderButton
                        text={buttonText}
                        onPress={onContinue}
                        disabled={!isValid}
                        style={{ marginBottom: isKeyboardVisible ? 0 : 100 }}
                    />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
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
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]); // Default Argentina based on image
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
                transparent={false}
            >
                <SafeAreaView style={styles.container}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => setPickerVisible(false)} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.content}>
                        <Text style={styles.title}>Join as Participant</Text>

                        <FlatList
                            data={COUNTRIES}
                            keyExtractor={(item) => item.name}
                            showsVerticalScrollIndicator={false}
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
                </SafeAreaView>
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
            <TouchableOpacity style={styles.uploadContainer} onPress={pickImage}>
                {image ? (
                    <Image source={{ uri: image }} style={styles.uploadedImage} />
                ) : (
                    <View style={styles.uploadPlaceholder}>
                        <Text style={styles.uploadTextTitle}>Upload a photo</Text>
                        <Text style={styles.uploadTextSub}>Recommended size: 1080 x 1080px</Text>
                        <Text style={styles.uploadTextSub}>(JPG, PNG, GIF)</Text>

                        <View style={styles.uploadBtnPill}>
                            <Text style={styles.uploadBtnText}>Upload</Text>
                        </View>
                    </View>
                )}
            </TouchableOpacity>
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
            <TouchableOpacity
                style={styles.termsContainer}
                onPress={() => setAccepted(!accepted)}
                activeOpacity={1}
            >
                <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
                    {accepted && <Ionicons name="checkmark" size={14} color="#000" />}
                </View>
                <Text style={styles.termsText}>
                    I accept <Text style={styles.linkText}>Terms & Privacy</Text> and consent to live voice and, if enabled, recording, location sharing is controllable in app.
                </Text>
            </TouchableOpacity>
        </JoinLayout>
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
        marginBottom: 40,
    },
    label: {
        color: '#FFFBF3',
        fontSize: 14,
        marginBottom: 10,
        fontFamily: 'Manrope',
    },
    inputWrapper: {
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#2C2E33',
        height: 56,
        paddingHorizontal: 16,
        justifyContent: 'center',
        marginBottom: 20,
    },
    input: {
        color: '#FFF',
        fontSize: 16,
        height: '100%',
    },
    inputText: {
        color: '#FFF',
        fontSize: 16,
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
        borderWidth: 1,
        borderColor: '#B99A4A',
        borderStyle: 'dashed',
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1A1D20',
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
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
    },
    uploadTextSub: {
        color: '#9BA1A6',
        fontSize: 12,
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
        fontSize: 14,
        fontWeight: '600',
    },
    // Terms Styles
    termsContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 20,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: '#B99A4A',
        backgroundColor: '#FFA500', // Making it look like the filled state in screenshot? Actually screenshot shows yellow box with check.
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        marginTop: 2,
    },
    checkboxChecked: {
        backgroundColor: '#B99A4A',
    },
    termsText: {
        color: '#E0E0E0',
        fontSize: 14,
        lineHeight: 22,
        flex: 1,
    },
    linkText: {
        color: '#B99A4A',
        textDecorationLine: 'underline',
    },
    // Country Picker Styles
    countryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: '#23272A',
    },
    countryInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    countryFlag: {
        fontSize: 20,
        marginRight: 15,
    },
    countryName: {
        fontSize: 16,
        color: '#FFF',
    },
    countryCodeText: {
        fontSize: 16,
        color: '#B99A4A',
        fontWeight: '500',
    },
});
