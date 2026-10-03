import { brandedBrowserOptions } from '../../utils/browserOptions';
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
    Platform,
    AppState,
    Modal,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useIsFocused } from '@react-navigation/native';
import { setAudioModeAsync } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';
import { Typography } from '../../constants/Typography';
import { subscribeToAuthHandoff, getAuthHandoffState } from '../../utils/authHandoff';
// import Logo from '../../components/Logo'; // Removed as per request
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

const safePlay = (p) => {
    try {
        if (p && typeof p.play === 'function') {
            p.play();
        }
    } catch (e) {
        // Shared object might be deallocated during navigation/unmount
    }
};

const safePause = (p) => {
    try {
        if (p && typeof p.pause === 'function') {
            p.pause();
        }
    } catch (e) {
        // Shared object might be deallocated during navigation/unmount
    }
};

const WelcomeScreen = ({ navigation }) => {
    const isMountedRef = React.useRef(true);
    const player = useVideoPlayer(require('../../../assets/Login_Animation_1080p.mp4'), (p) => {
        try {
            p.muted = true;
            // Native looping owns replay; a second JS seek interrupts playback.
            p.loop = true;
            p.audioMixingMode = 'mixWithOthers';
            safePlay(p);
        } catch (e) {}
    });

    React.useEffect(() => {
        isMountedRef.current = true;
        // Configure audio mode to mix with other apps so background music doesn't stop
        const configureAudio = async () => {
            try {
                await setAudioModeAsync({
                    playsInSilentMode: true,
                    interruptionMode: 'mixWithOthers',
                    shouldPlayInBackground: false,
                    allowsRecording: false,
                });
            } catch (error) {
                console.log("Error configuring audio mode:", error);
            }
        };
        configureAudio();

        return () => {
            isMountedRef.current = false;
            safePause(player);
        };
    }, []);

    const isFocused = useIsFocused();

    React.useEffect(() => {
        if (!isMountedRef.current) return;

        if (isFocused) {
            safePlay(player);
        } else {
            safePause(player);
        }

        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (!isMountedRef.current) return;
            if (nextAppState === 'active' && isFocused) {
                safePlay(player);
            } else {
                safePause(player);
            }
        });

        return () => {
            subscription.remove();
        };
    }, [isFocused, player]);

    const [modalVisible, setModalVisible] = React.useState(false);
    const [joinMethodVisible, setJoinMethodVisible] = React.useState(false);
    const [selectedLanguage, setSelectedLanguage] = React.useState('EN');
    const [handoffState, setHandoffState] = React.useState(getAuthHandoffState());

    React.useEffect(() => {
        const unsubscribe = subscribeToAuthHandoff((state) => {
            setHandoffState(state);
            if (state.isLoggingIn) {
                setJoinMethodVisible(false);
                setModalVisible(false);
            }
        });
        return () => unsubscribe();
    }, []);

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
            <VideoView
                style={StyleSheet.absoluteFill}
                player={player}
                nativeControls={false}
                contentFit="cover"
                allowsPictureInPicture={false}
                allowsFullscreen={false}
            />
            <View style={StyleSheet.absoluteFill}>
                {/* <FlyingGreetings /> */}
                <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
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

                    {/* Buttons Section */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity
                            style={[
                                { backgroundColor: '#B99A4A', ...styles.button },
                                handoffState.isLoggingIn && { opacity: 0.5 }
                            ]}
                            disabled={handoffState.isLoggingIn}
                            onPress={() => setJoinMethodVisible(true)}
                        >
                            <Text style={styles.primaryButtonText}>Join as Participant</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.button, 
                                styles.secondaryButton,
                                handoffState.isLoggingIn && { opacity: 0.5 }
                            ]}
                            disabled={handoffState.isLoggingIn}
                            onPress={async () => {
                                safePause(player);
                                await WebBrowser.openBrowserAsync('https://app.gomusafir.app/create-account', brandedBrowserOptions);
                                if (isMountedRef.current && isFocused) {
                                    safePlay(player);
                                }
                            }} // TODO: Replace with dynamic config for prod vs staging
                        >

                            <Text style={styles.secondaryButtonText}>Create a Business Account</Text>
                        </TouchableOpacity>

                        <GradientBorderButton
                            onPress={() => navigation.navigate('BusinessLogin')}
                            style={{ borderRadius: 30, marginBottom: handoffState.isLoggingIn ? 8 : 20 }}
                            innerBg="transparent"
                            disabled={handoffState.isLoggingIn}
                        >
                            <Text style={{
                                color: '#FFF',
                                fontSize: responsiveFontSize(16),
                                fontFamily: Typography.sans.bold
                            }}>
                                Log In With Your Business Account
                            </Text>
                        </GradientBorderButton>

                        {handoffState.isLoggingIn && (
                            <View style={styles.loggingInIndicator}>
                                <ActivityIndicator size="small" color="#B99A4A" style={{ marginRight: 8 }} />
                                <Text style={styles.loggingInText}>
                                    We are logging you in...
                                </Text>
                            </View>
                        )}
                    </View>
                </SafeAreaView>
            </View>

            {/* Language Picker Modal */}
            <Modal
                visible={modalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <Pressable
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]}
                    onPress={() => setModalVisible(false)}
                >
                    <Pressable
                        style={[styles.modalOverlay, { position: 'absolute' }]}
                        onPress={e => e.stopPropagation()}
                    >
                        <View style={styles.modalContent}>
                            <FlatList
                                data={LANGUAGES}
                                renderItem={renderLanguageItem}
                                keyExtractor={item => item.code}
                                showsVerticalScrollIndicator={false}
                            />
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Join Method Modal */}
            <Modal
                visible={joinMethodVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setJoinMethodVisible(false)}
            >
                <Pressable
                    style={[StyleSheet.absoluteFill, { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }]}
                    onPress={() => setJoinMethodVisible(false)}
                >
                    <Pressable onPress={e => e.stopPropagation()}>
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
                    </Pressable>
                </Pressable>
            </Modal>
        </View >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
    },
    backgroundVideo: {
        ...StyleSheet.absoluteFillObject,
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    safeArea: {
        flex: 1,
        justifyContent: 'space-between',
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
    spacer: {
        flex: 1,
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
    loggingInIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        marginBottom: 14,
    },
    loggingInText: {
        color: '#B99A4A',
        fontFamily: Typography.sans.medium,
        fontSize: responsiveFontSize(14),
    },
});

export default WelcomeScreen;
