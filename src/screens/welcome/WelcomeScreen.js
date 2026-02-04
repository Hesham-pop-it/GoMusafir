import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    Image,
    TouchableOpacity,
    Modal,
    FlatList,
    TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';
import { responsiveFontSize } from '../../utils/responsive';



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
                <SafeAreaView style={styles.safeArea}>
                    {/* Top Bar */}
                    <View style={styles.topBar}>
                        <TouchableOpacity
                            style={styles.languageSelector}
                            onPress={() => setModalVisible(true)}
                        >
                            <Text style={styles.languageText}>{selectedLanguage}</Text>
                            <MaterialIcons name="keyboard-arrow-down" size={20} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    {/* Logo Section */}
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../../../assets/logo.png')}
                            style={styles.logo}
                        />
                        <Text style={styles.appName}>GoMusāfir</Text>
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
                            onPress={() => console.log('Create Business Account')}
                        >
                            <Text style={styles.secondaryButtonText}>Create a Business Account</Text>
                        </TouchableOpacity>

                        <GradientBorderButton
                            text="Log In With Your Business Account"
                            onPress={() => navigation.navigate('BusinessLogin')}
                            style={{ borderRadius: 30, fontSize: responsiveFontSize(28) }}
                        />
                    </View>
                </SafeAreaView>
            </View >

            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <FlatList
                                data={LANGUAGES}
                                renderItem={renderLanguageItem}
                                keyExtractor={item => item.code}
                                showsVerticalScrollIndicator={false}
                            />
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>


            {/* Join Method Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={joinMethodVisible}
                onRequestClose={() => setJoinMethodVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setJoinMethodVisible(false)}>
                    <View style={styles.joinModalOverlay}>
                        <TouchableWithoutFeedback>
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
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
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
        backgroundColor: 'rgba(0,0,0,0.5)',
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
        fontSize: responsiveFontSize(16),
        fontWeight: '600',
    },
    logoContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: -40,
    },
    logo: {
        width: 140,
        height: 140,
        resizeMode: 'contain',
    },
    appName: {
        color: '#B99A4A',
        fontSize: responsiveFontSize(26),
        fontWeight: 'bold',

        letterSpacing: 1,
        zIndex: 10,
        elevation: 5,
    },
    buttonContainer: {
        paddingHorizontal: 25,
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
        fontSize: responsiveFontSize(17),
        fontWeight: 'bold',
    },
    secondaryButton: {
        backgroundColor: '#FFFFFF',
    },
    secondaryButtonText: {
        color: '#000',
        fontSize: responsiveFontSize(17),
        fontWeight: 'bold',
    },
    outlinedButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(17),
        fontWeight: '600',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-start',
        paddingTop: 60,
        paddingLeft: 20,
    },
    modalContent: {
        backgroundColor: '#2C2E33', // Dark background for dropdown
        borderRadius: 12,
        width: 180,
        maxHeight: 400,
        paddingVertical: 8,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    languageItem: {
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    languageItemText: {
        color: '#9BA1A6',
        fontSize: responsiveFontSize(16),
        fontWeight: '500',
    },
    languageItemTextSelected: {
        color: '#B99A4A',
        fontWeight: 'bold',
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
        fontWeight: '600',
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
        fontWeight: '600',
    },
});

export default WelcomeScreen;
