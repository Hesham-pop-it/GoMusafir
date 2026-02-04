import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ImageBackground,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Image,
    StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useNavigation, useRoute } from '@react-navigation/native';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import { responsiveFontSize } from '../../utils/responsive';

const { width } = Dimensions.get('window');

const VoiceChatScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { trip, invitationCode: directCode } = route.params || {};
    const tripData = trip || {
        image: require('../../../assets/Madinah.png'),
    };
    const invitationCode = directCode || tripData.invitationCode;
    const isAdmin = !invitationCode;

    const participants = [
        { id: 1, name: 'Ethan Carter', status: 'Speaking', isSpeaking: true, avatar: 'https://randomuser.me/api/portraits/men/32.jpg', network: 'good' },
        { id: 2, name: 'Sophia Bennett', status: 'Muted', isSpeaking: false, avatar: 'https://randomuser.me/api/portraits/women/44.jpg', network: 'good' },
        { id: 3, name: 'Liam Harper', status: 'Muted', isSpeaking: false, avatar: 'https://randomuser.me/api/portraits/men/32.jpg', network: 'fair' },
        { id: 4, name: 'Olivia Reed', status: 'Muted', isSpeaking: false, avatar: 'https://randomuser.me/api/portraits/women/65.jpg', network: 'poor' },
        { id: 5, name: 'Ahmed Badawi', status: 'Muted', isSpeaking: false, avatar: 'https://randomuser.me/api/portraits/men/44.jpg', network: 'none' },
        { id: 6, name: 'Baskin Furqan', status: 'Muted', isSpeaking: false, avatar: 'https://randomuser.me/api/portraits/men/65.jpg', network: 'none' },
    ];

    const ControlButton = ({ label, disabled }) => (
        <TouchableOpacity style={[styles.controlButton, disabled && styles.controlButtonDisabled]}>
            <Text style={[styles.controlButtonText, disabled && styles.controlButtonTextDisabled]}>{label}</Text>
        </TouchableOpacity>
    );

    const SignalBars = ({ type }) => {
        if (type === 'none') return null;
        const color = type === 'good' ? '#34C759' : type === 'fair' ? '#FFC107' : '#FF4B4B';
        return (
            <View style={styles.signalBars}>
                <View style={[styles.signalBar, { height: 6, backgroundColor: color }]} />
                <View style={[styles.signalBar, { height: 10, backgroundColor: type !== 'poor' ? color : '#444' }]} />
                <View style={[styles.signalBar, { height: 14, backgroundColor: type === 'good' ? color : '#444' }]} />
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <ImageBackground
                source={typeof tripData.image === 'string' ? { uri: tripData.image } : tripData.image}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <LinearGradient
                    colors={['rgba(0,0,0,0.6)', '#121417']}
                    style={styles.gradientOverlay}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.4 }}
                />

                <SafeAreaView style={{ flex: 1 }}>
                    {/* Fixed Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                            <Ionicons name="arrow-back" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Voice Chat</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Fixed Top Section (Controls & Status) */}
                    <View style={styles.topSection}>
                        {/* Controls Grid */}
                        <View style={styles.controlsGrid}>
                            {isAdmin ? (
                                <>
                                    <View style={styles.controlRow}>
                                        <ControlButton label="Mute Myself" />
                                        <ControlButton label="Mute All" />
                                    </View>
                                    <View style={styles.controlRow}>
                                        <ControlButton label="Channel Pause" />
                                        <ControlButton label="Channel Start" />
                                    </View>
                                </>
                            ) : (
                                <View style={styles.controlRow}>
                                    <ControlButton label="Mute Myself" />
                                    <ControlButton label="Hold to Talk" />
                                </View>
                            )}
                        </View>

                        {/* Network Status & Summary */}
                        <View style={styles.statusRow}>
                            <View style={styles.networkStatus}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={[styles.statusDot, { backgroundColor: '#34C759' }]} />
                                    <Text style={[styles.statusText, { color: '#34C759' }]}>Good Network</Text>
                                </View>
                                <Text style={styles.sectionTitle}>Participants</Text>
                            </View>
                            <View style={styles.headerAvatars}>
                                <Image source={{ uri: 'https://randomuser.me/api/portraits/women/44.jpg' }} style={[styles.smallAvatar, { zIndex: 2 }]} />
                                <Image source={{ uri: 'https://randomuser.me/api/portraits/women/65.jpg' }} style={[styles.smallAvatar, { marginLeft: -12 }]} />
                            </View>
                        </View>
                    </View>

                    {/* Scrollable Bottom Section */}
                    <ScrollView
                        style={styles.listSectionScroll}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.listSection}>
                            {participants.map((item, index) => (
                                <View key={index}>
                                    <View style={styles.participantRow}>
                                        <View style={[
                                            styles.avatarContainer,
                                            item.isSpeaking && styles.speakingAvatarBorder
                                        ]}>
                                            <Image source={{ uri: item.avatar }} style={styles.avatar} />
                                        </View>

                                        <View style={styles.participantInfo}>
                                            <View style={styles.nameRow}>
                                                <Text style={styles.nameText}>{item.name}</Text>
                                                {item.network !== 'none' && (
                                                    <View style={styles.inlineStats}>
                                                        <View style={[styles.miniDot, { backgroundColor: item.network === 'good' ? '#34C759' : '#FFC107' }]} />
                                                        <SignalBars type={item.network} />
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={styles.statusSubText}>{item.status}</Text>
                                        </View>

                                        <View style={styles.rightActions}>
                                            {item.isSpeaking ? (
                                                <View style={styles.micCircle}>
                                                    <Ionicons name="mic" size={18} color="#FFF" />
                                                </View>
                                            ) : (
                                                <Ionicons
                                                    name="mic-off-outline"
                                                    size={24}
                                                    color="#A1A1AA"
                                                />
                                            )}
                                        </View>
                                    </View>
                                    {index === 0 && <View style={styles.rowSeparator} />}
                                </View>
                            ))}
                            <View style={{ height: 100 }} />
                        </View>
                    </ScrollView>

                    {/* Bottom Trip Navigation */}
                    <TripBottomTabBar activeRoute="VoiceChat" tripData={tripData} />

                </SafeAreaView>
            </ImageBackground>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    backgroundImage: {
        flex: 1,
        width: width,
    },
    gradientOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    headerTitle: {
        fontSize: responsiveFontSize(22),
        color: '#FFF',
        fontFamily: 'IBMPlexSans',
        fontWeight: 'bold',
    },
    iconButton: {
        padding: 5,
    },
    scrollContent: {
        flexGrow: 1,
    },
    topSection: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 5,
    },
    listSectionScroll: {
        flex: 1,
    },
    listContent: {
        flexGrow: 1,
    },
    listSection: {
        backgroundColor: '#121417',
        paddingHorizontal: 20,
        paddingTop: 20,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        minHeight: '100%',
    },
    controlsGrid: {
        marginTop: 20,
        marginBottom: 20,
    },
    controlRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 15,
    },
    controlButton: {
        flex: 1,
        backgroundColor: 'rgba(35, 39, 42, 0.4)',
        borderWidth: 1.5,
        borderColor: '#B99A4A',
        borderRadius: 25,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    controlButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: responsiveFontSize(15),
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
    },
    networkStatus: {
        alignItems: 'flex-start',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    statusText: {
        fontSize: responsiveFontSize(14),
        fontWeight: '500',
    },
    headerAvatars: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    smallAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#121417',
    },
    sectionTitle: {
        fontSize: responsiveFontSize(28),
        color: '#FFF',
        fontFamily: 'CormorantGaramond_700Bold',
        marginTop: 10,
    },
    controlButtonDisabled: {
        borderColor: '#636D77',
        opacity: 0.6,
    },
    controlButtonTextDisabled: {
        color: '#636D77',
    },
    participantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        marginBottom: 10,
    },
    avatarContainer: {
        marginRight: 15,
        padding: 2,
        borderRadius: 28,
    },
    speakingAvatarBorder: {
        borderWidth: 2,
        borderColor: '#34C759',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    participantInfo: {
        flex: 1,
    },
    nameText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontWeight: 'bold',
        marginBottom: 2,
    },
    statusSubText: {
        color: '#9BA1A6',
        fontSize: responsiveFontSize(13),
    },
    rightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
    },
    micCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#34C759',
        justifyContent: 'center',
        alignItems: 'center',
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    inlineStats: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    miniDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    signalBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
    },
    signalBar: {
        width: 3,
        borderRadius: 1,
    },
    rowSeparator: {
        height: 1,
        backgroundColor: '#34C759',
        marginVertical: 5,
    },
});

export default VoiceChatScreen;
