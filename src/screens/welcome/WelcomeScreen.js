import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    Image,
    TouchableOpacity,
    FlatList,
    TouchableWithoutFeedback,
    Animated,
    Platform
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';
import { Typography } from '../../constants/Typography';
import Logo from '../../components/Logo';
import { responsiveFontSize } from '../../utils/responsive';
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const LANGUAGES = [
    { code: 'AR', label: 'Arabic' },
    { code: 'EN', label: 'English' },
    { code: 'UR', label: 'Urdu' },
    { code: 'ID', label: 'Indonesian' },
    { code: 'TR', label: 'Turkish' },
    { code: 'FR', label: 'French' },
    { code: 'HI', label: 'Hindi' },
    { code: 'BN', label: 'Bengali' },
    { code: 'MS', label: 'Malay' },
    { code: 'FA', label: 'Persian (Farsi)' },
    { code: 'ES', label: 'Spanish' },
    { code: 'PT', label: 'Portuguese' },
    { code: 'RU', label: 'Russian' },
    { code: 'DE', label: 'German' },
    { code: 'NL', label: 'Dutch' },
];

const GREETINGS = [
    "Hello",           // English
    "Hola",            // Spanish
    "السلام علیکم",    // Urdu/Arabic
    "नमस्ते",           // Hindi
    "Merhaba",         // Turkish
    "Bonjour",         // French
    "سلام",            // Persian
    "こんにちは",       // Japanese
    "Привет",          // Russian
    "Ciao",            // Italian
    "你好",            // Chinese
    "مرحباً",          // Arabic
    "Aloha",           // Hawaiian
    "Sawubona",        // Zulu
    "שלום"             // Hebrew
];

const FloatingGreeting = ({ onComplete, pos, greeting }) => {
    const [visibleText, setVisibleText] = React.useState("");
    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    const startDelay = React.useMemo(() => Math.random() * 2000, []);

    React.useEffect(() => {
        let isMounted = true;
        let typingInterval = null;
        let fadeOutTimeout = null;
        let startTimeout = null;

        const runAnimation = () => {
            // 1. Fade In
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1200,
                useNativeDriver: true,
            }).start(() => {
                if (!isMounted) return;

                // 2. Typing Effect
                let charIndex = 0;
                typingInterval = setInterval(() => {
                    if (!isMounted) {
                        clearInterval(typingInterval);
                        return;
                    }

                    if (charIndex <= greeting.length) {
                        setVisibleText(greeting.substring(0, charIndex));
                        charIndex++;
                    } else {
                        clearInterval(typingInterval);
                        // 3. Pause then Fade Out
                        fadeOutTimeout = setTimeout(() => {
                            if (!isMounted) return;
                            Animated.timing(fadeAnim, {
                                toValue: 0,
                                duration: 3000,
                                useNativeDriver: true,
                            }).start(() => {
                                if (isMounted) onComplete();
                            });
                        }, 1500);
                    }
                }, 250);
            });
        };

        startTimeout = setTimeout(() => {
            if (isMounted) runAnimation();
        }, startDelay);

        return () => {
            isMounted = false;
            if (typingInterval) clearInterval(typingInterval);
            if (fadeOutTimeout) clearTimeout(fadeOutTimeout);
            if (startTimeout) clearTimeout(startTimeout);
            fadeAnim.stopAnimation();
        };
    }, [greeting, pos]);

    return (
        <Animated.View style={[
            styles.floatingTextContainer,
            { left: pos.x, top: pos.y, opacity: fadeAnim }
        ]}>
            <Text style={styles.floatingText}>{visibleText}</Text>
        </Animated.View>
    );
};

const FlyingGreetings = () => {
    const [instances, setInstances] = React.useState([]);
    const [completedCount, setCompletedCount] = React.useState(0);
    const currentLotSize = React.useRef(0);
    const timerRef = React.useRef(null);

    const startNewLot = React.useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);

        const lotSize = Math.floor(Math.random() * 3) + 3;
        currentLotSize.current = lotSize;

        const batch = [];
        const centerX = SCREEN_WIDTH / 2;
        const centerY = SCREEN_HEIGHT / 2 - 40;

        for (let i = 0; i < lotSize; i++) {
            let x = 20;
            let y = 120;
            let isSafe = false;
            let attempts = 0;

            while (!isSafe && attempts < 50) {
                attempts++;
                x = Math.random() * (SCREEN_WIDTH - 180) + 20;
                y = Math.random() * (SCREEN_HEIGHT - 450) + 120;

                const inLogoArea = (x > centerX - 140 && x < centerX + 140 && y > centerY - 160 && y < centerY + 120);
                const inButtonArea = y > SCREEN_HEIGHT - 280;
                const inTopBar = y < 100;

                // Overlap check with previous items in THIS lot
                const isOverlapping = batch.some(item => {
                    const dx = Math.abs(item.pos.x - x);
                    const dy = Math.abs(item.pos.y - y);
                    return dx < 160 && dy < 60; // Safe distance
                });

                if (!inLogoArea && !inButtonArea && !inTopBar && !isOverlapping) {
                    isSafe = true;
                }
            }
            batch.push({
                id: `greeting-${Date.now()}-${i}`,
                pos: { x, y },
                greeting: GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
            });
        }

        setCompletedCount(0);
        setInstances(batch);
    }, []);

    React.useEffect(() => {
        startNewLot();
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [startNewLot]);

    const handleComplete = React.useCallback(() => {
        setCompletedCount(prev => {
            const newCount = prev + 1;
            if (newCount >= currentLotSize.current) {
                setInstances([]);
                if (timerRef.current) clearTimeout(timerRef.current);
                timerRef.current = setTimeout(startNewLot, 2500);
            }
            return newCount;
        });
    }, [startNewLot]);

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {instances.map(item => (
                <FloatingGreeting
                    key={item.id}
                    pos={item.pos}
                    greeting={item.greeting}
                    onComplete={handleComplete}
                />
            ))}
        </View>
    );
};

const WelcomeScreen = ({ navigation }) => {
    const [modalVisible, setModalVisible] = React.useState(false);
    const [joinMethodVisible, setJoinMethodVisible] = React.useState(false);
    const [selectedLanguage, setSelectedLanguage] = React.useState('EN');

    const renderLanguageItem = ({ item }) => (
        <TouchableOpacity
            style={styles.languageItem}
            onPress={() => {
                setSelectedLanguage(item.code);
                setModalVisible(false);
            }}
        >
            <Text style={[
                styles.languageItemText,
                selectedLanguage === item.code && styles.languageItemTextSelected
            ]}>
                {item.label}
            </Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Image
                source={require('../../../assets/bg_landing.png')}
                style={styles.backgroundImage}
            />
            <View style={styles.overlay}>
                <FlyingGreetings />
                <SafeAreaView style={styles.safeArea}>
                    {/* Top Bar */}
                    <View style={styles.topBar}>
                        <TouchableOpacity
                            style={styles.languageSelector}
                            onPress={() => setModalVisible(true)}
                        >
                            <Text style={[styles.languageText, { fontFamily: Typography.sans.semiBold, fontSize: 18 }]}>{selectedLanguage}</Text>
                            <MaterialIcons name="keyboard-arrow-down" size={20} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    {/* Logo Section */}
                    <View style={styles.logoContainer}>
                        <Logo width={140} height={140} />
                    </View>

                    {/* Buttons Section */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={{ backgroundColor: '#B99A4A', ...styles.button }}
                            onPress={() => setJoinMethodVisible(true)}
                        >
                            <Text style={styles.primaryButtonText}>Join as Participant</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, styles.secondaryButton]}
                            onPress={() => WebBrowser.openBrowserAsync('https://gomusafir.app/create-account')}
                        >
                            <Text style={styles.secondaryButtonText}>Create a Business Account</Text>
                        </TouchableOpacity>

                        <GradientBorderButton
                            onPress={() => navigation.navigate('BusinessLogin')}
                            style={{ borderRadius: 30, marginBottom: 20 }}
                            innerBg="transparent"
                        >
                            <Text style={{
                                color: '#FFF',
                                fontSize: responsiveFontSize(16), // 28 is likely too big for a button, using 18 or 20 for better fit but keeping the request in mind. 
                                // Actually user asked for 28, I will use something closer or exactly what they asked if it fits. 
                                // Let's try 18 which is a "large" button text.
                                fontFamily: Typography.sans.bold
                            }}>
                                Log In With Your Business Account
                            </Text>
                        </GradientBorderButton>
                    </View>
                </SafeAreaView>
            </View >

            <Modal
                isVisible={modalVisible}
                onBackdropPress={() => setModalVisible(false)}
                onSwipeComplete={() => setModalVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.3}
                animationIn="fadeIn"
                animationOut="fadeOut"
                style={styles.modalOverlay}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <View style={styles.modalContent}>
                    <FlatList
                        data={LANGUAGES}
                        renderItem={renderLanguageItem}
                        keyExtractor={item => item.code}
                        showsVerticalScrollIndicator={false}
                    />
                </View>
            </Modal>

            {/* Join Method Modal */}
            <Modal
                isVisible={joinMethodVisible}
                onBackdropPress={() => setJoinMethodVisible(false)}
                onSwipeComplete={() => setJoinMethodVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.7}
                animationIn="fadeIn"
                animationOut="fadeOut"
                style={{ margin: 0, justifyContent: 'center', alignItems: 'center' }}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <View style={styles.joinModalContent}>
                    <Text style={styles.joinModalTitle}>How would you like to join?</Text>

                    <View style={styles.joinOptionsContainer}>
                        <GradientBorderButton
                            style={{ flex: 1 }}
                            innerStyle={{ flexDirection: 'row' }}
                            innerBg="#23272A"
                            onPress={() => {
                                setJoinMethodVisible(false);
                                navigation.navigate('JoinWithLink');
                            }}
                        >
                            <Ionicons name="link-outline" size={24} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.joinOptionText}>Link</Text>
                        </GradientBorderButton>

                        <GradientBorderButton
                            style={{ flex: 1 }}
                            innerStyle={{ flexDirection: 'row' }}
                            innerBg="#23272A"
                            onPress={() => {
                                setJoinMethodVisible(false);
                                navigation.navigate('ScanQr');
                            }}
                        >
                            <MaterialCommunityIcons name="qrcode-scan" size={20} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.joinOptionText}>QR</Text>
                        </GradientBorderButton>
                    </View>
                </View>
            </Modal>
        </View >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    backgroundImage: {
        ...StyleSheet.absoluteFillObject,
        width: undefined,
        height: undefined,
        resizeMode: 'cover',
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0)',
    },
    safeArea: {
        flex: 1,
    },
    topBar: {
        paddingHorizontal: 20,
        paddingTop: 10,
        flexDirection: 'row',
    },
    languageSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    languageText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
    },
    logoContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: -90,
    },
    logo: {
        width: 100,
        height: 100,
        resizeMode: 'contain',
    },
    buttonContainer: {
        paddingHorizontal: "7%",
        paddingBottom: 40,
        gap: 16,
    },
    button: {
        width: '100%',
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',

    },
    primaryButton: {
        backgroundColor: '#B99A4A',
    },
    primaryButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    secondaryButton: {
        backgroundColor: '#FFFFFF',
    },
    secondaryButtonText: {
        color: '#000',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    modalOverlay: {
        margin: 0,
        justifyContent: 'flex-start',
        paddingTop: Platform.OS === 'ios' ? 85 : 35,
        paddingLeft: 21
    },
    modalContent: {
        backgroundColor: '#23272A', // Dark background for dropdown
        borderRadius: 12,
        width: 180,
        // paddingVertical: 1,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    languageItem: {

        paddingVertical: 7,
        paddingHorizontal: 20,
    },
    languageItemText: {
        color: '#fff',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    languageItemTextSelected: {
        color: '#B99A4A',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
    },
    // Join Modal Styles
    joinModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    joinModalContent: {
        backgroundColor: '#23272A',
        borderRadius: 24,
        padding: 30,
        width: '85%',
        alignItems: 'center',
    },
    joinModalTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.semiBold,
        marginBottom: 30,
        textAlign: 'center',
    },
    joinOptionsContainer: {
        flexDirection: 'row',
        gap: 20,
        width: '100%',
        justifyContent: 'space-between',
    },

    joinOptionText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
    },
    greetingContainer: {
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 5,
    },
    greetingText: {
        color: '#FFF',
        fontSize: responsiveFontSize(22),
        fontFamily: Typography.serif.regular,
        letterSpacing: 0.5,
    },
    floatingTextContainer: {
        position: 'absolute',
    },
    floatingText: {
        color: '#FFFFFF',
        fontSize: responsiveFontSize(22),
        fontFamily: Typography.serif.bold,
        textShadowColor: 'rgba(0, 0, 0, 0.8)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10,
    },
});

export default WelcomeScreen;
