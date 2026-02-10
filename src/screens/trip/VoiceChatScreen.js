import React, { useState } from 'react';
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
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useNavigation, useRoute } from '@react-navigation/native';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import { responsiveFontSize } from '../../utils/responsive';

const { width } = Dimensions.get('window');

const MicUnmutedIcon = ({ color = "white", size = 20 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <G clipPath="url(#clip0_mic_unmuted)">
            <Path fillRule="evenodd" clipRule="evenodd" d="M12 16.5C14.4842 16.4974 16.4974 14.4842 16.5 12V6C16.5 3.51472 14.4853 1.5 12 1.5C9.51472 1.5 7.5 3.51472 7.5 6V12C7.50258 14.4842 9.51579 16.4974 12 16.5ZM9 6C9 4.34315 10.3431 3 12 3C13.6569 3 15 4.34315 15 6V12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12V6ZM12.75 19.4625V21.75C12.75 22.1642 12.4142 22.5 12 22.5C11.5858 22.5 11.25 22.1642 11.25 21.75V19.4625C7.41988 19.0728 4.50473 15.8499 4.5 12C4.5 11.5858 4.83579 11.25 5.25 11.25C5.66421 11.25 6 11.5858 6 12C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12C18 11.5858 18.3358 11.25 18.75 11.25C19.1642 11.25 19.5 11.5858 19.5 12C19.4953 15.8499 16.5801 19.0728 12.75 19.4625Z" fill={color} />
        </G>
        <Defs>
            <ClipPath id="clip0_mic_unmuted">
                <Rect width="24" height="24" fill="white" />
            </ClipPath>
        </Defs>
    </Svg>
);

const MicMutedIcon = ({ color = "white", size = 20 }) => (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <Path fillRule="evenodd" clipRule="evenodd" d="M22.0552 21.7457L7.0552 5.24568C6.87596 5.04363 6.60193 4.95357 6.33777 5.00988C6.07362 5.0662 5.86015 5.2602 5.7789 5.51778C5.69765 5.77536 5.76117 6.05674 5.9452 6.25443L9.5002 10.1647V14.0001C9.50042 15.6452 10.3983 17.159 11.8419 17.9481C13.2854 18.7371 15.0444 18.6756 16.4293 17.7876L17.4493 18.9126C15.6167 20.2 13.2196 20.3596 11.2325 19.3265C9.24544 18.2934 7.99911 16.2397 8.0002 14.0001C8.0002 13.5858 7.66442 13.2501 7.2502 13.2501C6.83599 13.2501 6.5002 13.5858 6.5002 14.0001C6.50493 17.85 9.42008 21.0728 13.2502 21.4626V23.7501C13.2502 24.1643 13.586 24.5001 14.0002 24.5001C14.4144 24.5001 14.7502 24.1643 14.7502 23.7501V21.4616C16.0953 21.3278 17.379 20.8318 18.4646 20.0263L20.9452 22.7544C21.1244 22.9565 21.3985 23.0465 21.6626 22.9902C21.9268 22.9339 22.1403 22.7399 22.2215 22.4823C22.3028 22.2247 22.2392 21.9434 22.0552 21.7457ZM14.0002 17.0001C12.3433 17.0001 11.0002 15.6569 11.0002 14.0001V11.8147L15.399 16.6541C14.9677 16.8813 14.4876 17.0001 14.0002 17.0001ZM10.1715 5.63568C11.2286 3.92384 13.2936 3.12174 15.2291 3.67119C17.1646 4.22064 18.5002 5.98809 18.5002 8.00005V13.6654C18.5002 14.0796 18.1644 14.4154 17.7502 14.4154C17.336 14.4154 17.0002 14.0796 17.0002 13.6654V8.00005C17.0009 6.65799 16.1102 5.4787 14.8192 5.11234C13.5281 4.74598 12.1507 5.28168 11.4465 6.42412C11.3105 6.66222 11.0554 6.80713 10.7812 6.80203C10.5071 6.79694 10.2576 6.64264 10.1305 6.39965C10.0035 6.15666 10.0192 5.86371 10.1715 5.63568ZM19.5915 16.1816C19.8628 15.4864 20.0015 14.7464 20.0002 14.0001C20.0002 13.5858 20.336 13.2501 20.7502 13.2501C21.1644 13.2501 21.5002 13.5858 21.5002 14.0001C21.5015 14.9331 21.3279 15.8582 20.9883 16.7272C20.8949 16.9825 20.6707 17.1672 20.4023 17.21C20.1339 17.2529 19.8634 17.1472 19.6951 16.9338C19.5268 16.7204 19.4872 16.4326 19.5915 16.1816Z" fill={color} />
    </Svg>
);

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

    const [isMuted, setIsMuted] = useState(true);
    const [isAllMuted, setIsAllMuted] = useState(true);
    const [isChannelStarted, setIsChannelStarted] = useState(true);

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
                    colors={['rgba(0,0,0,0.6)', '#1A1E21']}
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
                                        <TouchableOpacity
                                            onPress={() => setIsMuted(!isMuted)}
                                            style={[
                                                styles.controlButtonOutline,
                                                { flex: 1 },
                                                !isMuted && { backgroundColor: '#2D2528', borderColor: '#2D2528' }
                                            ]}
                                        >
                                            <View style={{ marginRight: 8 }}>
                                                {isMuted ? (
                                                    <MicMutedIcon color="#FFF" size={20} />
                                                ) : (
                                                    <MicUnmutedIcon color="#D66A77" size={20} />
                                                )}
                                            </View>
                                            <Text style={[styles.controlText, !isMuted && { color: '#D66A77' }]}>
                                                {isMuted ? 'Mute Myself' : 'Unmute Myself'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setIsAllMuted(!isAllMuted)}
                                            style={[
                                                styles.controlButtonOutline,
                                                { flex: 1 },
                                                !isAllMuted && { backgroundColor: '#2D2528', borderColor: '#2D2528' }
                                            ]}
                                        >
                                            <View style={{ marginRight: 8 }}>
                                                {isAllMuted ? (
                                                    <MicMutedIcon color="#FFF" size={20} />
                                                ) : (
                                                    <MicUnmutedIcon color="#D66A77" size={20} />
                                                )}
                                            </View>
                                            <Text style={[styles.controlText, !isAllMuted && { color: '#D66A77' }]}>
                                                {isAllMuted ? 'Mute All' : 'Unmute All'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                    <TouchableOpacity
                                        style={[
                                            styles.controlButtonOutline,
                                            { width: '100%', backgroundColor: isChannelStarted ? '#34C759' : '#D66A77', borderColor: isChannelStarted ? '#34C759' : '#D66A77' }
                                        ]}
                                        onPress={() => setIsChannelStarted(!isChannelStarted)}
                                    >
                                        <Ionicons
                                            name={isChannelStarted ? "play-circle-outline" : "pause-circle-outline"}
                                            size={20}
                                            color="#FFF"
                                            style={{ marginRight: 8 }}
                                        />
                                        <Text style={[styles.controlText, { color: '#FFF' }]}>
                                            {isChannelStarted ? 'Channel Start' : 'Channel Pause'}
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <View style={styles.controlRow}>
                                    <TouchableOpacity
                                        onPress={() => setIsMuted(!isMuted)}
                                        style={[
                                            styles.controlButtonOutline,
                                            { flex: 1 },
                                            !isMuted && { backgroundColor: '#2D2528', borderColor: '#2D2528' }
                                        ]}
                                    >
                                        <View style={{ marginRight: 8 }}>
                                            {isMuted ? (
                                                <MicMutedIcon color="#FFF" size={20} />
                                            ) : (
                                                <MicUnmutedIcon color="#D66A77" size={20} />
                                            )}
                                        </View>
                                        <Text style={[styles.controlText, !isMuted && { color: '#D66A77' }]}>
                                            Mute Myself
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.controlButtonOutline, { flex: 1 }]}
                                    >
                                        <View style={{ marginRight: 8 }}>
                                            <MicUnmutedIcon color="#FFF" size={20} />
                                        </View>
                                        <Text style={styles.controlText}>Hold to Talk</Text>
                                    </TouchableOpacity>
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
                                                    <MicUnmutedIcon color="#FFF" size={24} />
                                                </View>
                                            ) : (
                                                <MicMutedIcon color="#A1A1AA" size={24} />
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
        fontFamily: 'IBMPlexSans'
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
        backgroundColor: '#1A1E21',
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
        gap: 15,
        marginBottom: 10,
    },
    controlButtonOutline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: '#B99A4A',
    },
    controlText: {
        color: '#FFF',
        fontSize: responsiveFontSize(13),
        fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
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
        borderColor: '#1A1E21',
    },
    sectionTitle: {
        fontSize: responsiveFontSize(28),
        color: '#FFF',
        fontFamily: 'CormorantGaramond',
        marginTop: 10,
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
