import React, { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import {
    View,
    Text,
    StyleSheet,
    ImageBackground,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Platform,
    StatusBar,
    Image,
    Modal,
    TouchableWithoutFeedback,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useNavigation, useRoute } from '@react-navigation/native';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import GradientBorderButton from '../../components/GradientBorderButton';
import { responsiveFontSize } from '../../utils/responsive';

const { width, height } = Dimensions.get('window');

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

const TripOverviewScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { trip, invitationCode: directCode } = route.params || {};
    const invitationCode = directCode || trip?.invitationCode;

    // If invitationCode exists, the user joined as a participant
    const isAdmin = !invitationCode;

    const [visibilityModalVisible, setVisibilityModalVisible] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [seatModalVisible, setSeatModalVisible] = useState(false);
    const [requestSentVisible, setRequestSentVisible] = useState(false);
    const [seatCount, setSeatCount] = useState(1);

    // New Participant Detail States
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [detailVisible, setDetailVisible] = useState(false);
    const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
    const [quickAlertVisible, setQuickAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');

    const [selectedField, setSelectedField] = useState(null);
    const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
    const [countdown, setCountdown] = useState(10);
    const [isMuted, setIsMuted] = useState(true);
    const [isAllMuted, setIsAllMuted] = useState(true);
    const [isChannelStarted, setIsChannelStarted] = useState(true);

    // Mock data if trip is missing
    // Default Image if none provided
    const DEFAULT_TRIP_IMAGE = require('../../../assets/Madinah.png');

    // In the future, for participants (!isAdmin), tripData would be fetched
    // from the database using the invitationCode.
    const tripData = {
        title: trip?.title || 'Madinah Trip',
        date: trip?.date || '02/10/25 - 05/10/25',
        location: trip?.location || 'Madinah',
        participants: trip?.participants || 45,
        image: trip?.image || DEFAULT_TRIP_IMAGE,
        invitationCode
    };

    const handleRequestSeats = () => {
        setSeatModalVisible(false);
        setRequestSentVisible(true);
    };

    const handleParticipantPress = (participant) => {
        setSelectedParticipant(participant);
        setDetailVisible(true);
    };

    const handleDeletePress = () => {
        setDetailVisible(false);
        setTimeout(() => setDeleteConfirmVisible(true), 300);
    };

    const MOCK_PARTICIPANTS = [
        { name: 'Ethan Carter', status: 'Speaking', isSpeaking: true, image: 'https://randomuser.me/api/portraits/men/32.jpg' },
        { name: 'Sophia Bennett', status: 'Muted', isSpeaking: false, image: 'https://randomuser.me/api/portraits/women/44.Indonesia' },
        { name: 'Lucas Williams', status: 'Muted', isSpeaking: false, image: 'https://randomuser.me/api/portraits/men/46.jpg' },
        { name: 'Olivia Smith', status: 'Muted', isSpeaking: false, image: 'https://randomuser.me/api/portraits/women/12.jpg' },
        { name: 'James Wilson', status: 'Muted', isSpeaking: false, image: 'https://randomuser.me/api/portraits/men/22.jpg' },
    ];

    const QUICK_MESSAGES = [
        'The bus leaves in 5 min',
        'Gather at the meeting point',
        'Bus is arriving, please get ready'
    ];

    const MOCK_NOTIFICATIONS = [
        { id: 1, name: 'Ethan Carter', message: 'ask your location' },
        { id: 2, name: 'Ethan Carter', message: 'ask your location' },
        { id: 3, name: 'Ethan Carter', message: 'ask your location' },
        { id: 4, name: 'Ethan Carter', message: 'ask your location' },
    ];

    const handleQuickMsgPress = (msg) => {
        setAlertMessage(msg);
        setQuickAlertVisible(true);
    };

    const PrayerTimeItem = ({ name, time, icon, isActive }) => (
        <View style={styles.prayerItem}>
            <MaterialCommunityIcons
                name={icon}
                size={24}
                color={isActive ? "#B99A4A" : "#A1A1AA"}
                style={{ marginBottom: 4 }}
            />
            <Text style={[styles.prayerName, isActive && { color: '#FFF' }]}>{name}</Text>
            <Text style={[styles.prayerTime, isActive && { color: '#FFF' }]}>{time}</Text>
        </View>
    );

    const [prayerTimes, setPrayerTimes] = useState({
        Fajr: "05:00",
        Dhuhr: "12:00",
        Asr: "16:00",
        Maghrib: "18:00",
        Isha: "20:00",
    });

    useEffect(() => {
        const getLocAndPrayers = async () => {
            try {
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;

                let location = await Location.getCurrentPositionAsync({});
                const { latitude, longitude } = location.coords;

                const response = await fetch(
                    `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=2`
                );
                const data = await response.json();
                if (data.code === 200) {
                    const timings = data.data.timings;
                    setPrayerTimes({
                        Fajr: timings.Fajr,
                        Dhuhr: timings.Dhuhr,
                        Asr: timings.Asr,
                        Maghrib: timings.Maghrib,
                        Isha: timings.Isha,
                    });
                }
            } catch (error) {
                console.log('Error fetching prayer times:', error);
            }
        };

        getLocAndPrayers();
    }, []);

    const getActivePrayer = () => {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const prayers = [
            { name: "Fajr", time: prayerTimes.Fajr },
            { name: "Dhuhr", time: prayerTimes.Dhuhr },
            { name: "Asr", time: prayerTimes.Asr },
            { name: "Maghrib", time: prayerTimes.Maghrib },
            { name: "Isha", time: prayerTimes.Isha },
        ];

        let activeIdx = -1;
        for (let i = 0; i < prayers.length; i++) {
            const [h, m] = prayers[i].time.split(':').map(Number);
            const pTime = h * 60 + m;
            if (currentTime >= pTime) {
                activeIdx = i;
            }
        }

        if (activeIdx === -1) return "Isha";
        return prayers[activeIdx].name;
    };

    useEffect(() => {
        let timer;
        if (emergencyModalVisible && countdown > 0) {
            timer = setInterval(() => {
                setCountdown(prev => prev - 1);
            }, 1000);
        } else if (countdown === 0) {
            setEmergencyModalVisible(false);
            // Here you would trigger the actual alert to the host
            setCountdown(10);
        }
        return () => clearInterval(timer);
    }, [emergencyModalVisible, countdown]);

    const activePrayer = getActivePrayer();

    const ControlButton = ({ icon, label, isActive }) => (
        <TouchableOpacity style={[styles.controlButton, isActive && styles.controlButtonActive]}>
            <View style={styles.controlIconWrapper}>
                <Ionicons name={icon} size={20} color="#FFF" />
            </View>
            <Text style={styles.controlLabel}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Background Image with Overlay */}
            <ImageBackground
                source={typeof tripData.image === 'string' ? { uri: tripData.image } : tripData.image}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <LinearGradient
                    colors={['rgba(0,0,0,0.3)', '#1A1E21']}
                    style={styles.gradientOverlay}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.65 }}
                />

                <SafeAreaView style={{ flex: 1 }}>
                    {/* Header */}
                    <View style={styles.header}>
                        {isAdmin ? (
                            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                                <Ionicons name="arrow-back" size={24} color="#FFF" />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.iconButton} /> // Spacer to maintain alignment
                        )}

                        <Text style={styles.headerTitle}>Overview</Text>

                        {isAdmin ? (
                            <TouchableOpacity
                                style={styles.iconButton}
                                onPress={() => navigation.navigate('JourneySuccess')}
                            >
                                <MaterialCommunityIcons name="card-account-details-outline" size={24} color="#FFF" />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.iconButton} /> // Spacer to maintain alignment
                        )}
                    </View>

                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                        {/* Trip Info Card */}
                        <View style={styles.tripCard}>
                            <LinearGradient
                                colors={['#235242', 'rgba(35, 82, 66, 0.5)']} // Dark green to semi-transparent dark green
                                style={styles.tripCardGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Text style={styles.tripTitle}>{tripData.title}</Text>
                                <View style={styles.infoRow}>
                                    <Feather name="calendar" size={16} color="#B99A4A" />
                                    <Text style={styles.infoText}>{tripData.date}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Ionicons name="location-outline" size={16} color="#B99A4A" />
                                    <Text style={styles.infoText}>{tripData.location}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Ionicons name="person-outline" size={16} color="#B99A4A" />
                                    <Text style={styles.infoText}>{tripData.participants}</Text>
                                </View>
                            </LinearGradient>
                        </View>

                        {/* Prayer Times */}
                        <View style={styles.prayerTimesContainer}>
                            <PrayerTimeItem
                                name="Fajr"
                                time={prayerTimes.Fajr}
                                icon="weather-sunset-up"
                                isActive={activePrayer === "Fajr"}
                            />
                            <PrayerTimeItem
                                name="Dhuhr"
                                time={prayerTimes.Dhuhr}
                                icon="weather-sunny"
                                isActive={activePrayer === "Dhuhr"}
                            />
                            <PrayerTimeItem
                                name="Asr"
                                time={prayerTimes.Asr}
                                icon="weather-partly-cloudy"
                                isActive={activePrayer === "Asr"}
                            />
                            <PrayerTimeItem
                                name="Maghrib"
                                time={prayerTimes.Maghrib}
                                icon="weather-sunset-down"
                                isActive={activePrayer === "Maghrib"}
                            />
                            <PrayerTimeItem
                                name="Isha"
                                time={prayerTimes.Isha}
                                icon="weather-night"
                                isActive={activePrayer === "Isha"}
                            />
                        </View>

                        {/* Audio Channel Section */}
                        <View style={styles.sectionCard}>
                            <TouchableOpacity style={styles.channelHeader} onPress={() => navigation.navigate('VoiceChat', { trip: tripData })}>
                                <View style={styles.avatarWrapper}>
                                    <Image
                                        source={{ uri: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=3387&auto=format&fit=crop' }}
                                        style={styles.speakerAvatar}
                                    />
                                    {/* <View style={styles.liveIndicator} /> */}
                                </View>
                                <View style={styles.channelInfo}>
                                    <Text style={styles.channelStatus}>Channel Status: <Text style={{ color: '#34C759' }}>Live</Text></Text>
                                    <Text style={styles.activeSpeaker}>Active speaker: Liam</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={24} color="#fff" />
                            </TouchableOpacity>

                            {/* Audio Channel Controls */}
                            <View style={styles.controlsGrid}>
                                {isAdmin ? (
                                    <>
                                        <TouchableOpacity
                                            onPress={() => setIsMuted(!isMuted)}
                                            style={[
                                                styles.controlButtonOutline,
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
                                            <Text style={[styles.controlText, !isMuted && { color: '#D66A77', fontWeight: 'bold' }]}>
                                                {isMuted ? 'Mute Myself' : 'Unmute Myself'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setIsAllMuted(!isAllMuted)}
                                            style={[
                                                styles.controlButtonOutline,
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
                                                color={isChannelStarted ? "#FFF" : "#2D2528"}
                                                style={{ marginRight: 8 }}
                                            />
                                            <Text style={[styles.controlText, { color: isChannelStarted ? "#FFF" : "#2D2528" }]}>
                                                {isChannelStarted ? 'Channel Start' : 'Channel Pause'}
                                            </Text>
                                        </TouchableOpacity>

                                    </>
                                ) : (
                                    <TouchableOpacity
                                        onPress={() => setIsMuted(!isMuted)}
                                        style={[
                                            styles.controlButtonOutline,
                                            { width: '100%' },
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
                                )}
                            </View>
                        </View>

                        {/* Map and Chat Row */}
                        <View style={styles.rowContainer}>
                            <TouchableOpacity
                                style={[styles.sectionCard, styles.halfCard, { padding: 0, overflow: 'hidden' }]}
                                onPress={() => navigation.navigate('LiveLocation', { trip })}
                                activeOpacity={0.8}
                            >
                                {/* Dark Map Background */}
                                <ImageBackground
                                    source={{ uri: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?q=80&w=2000&auto=format&fit=crop' }}
                                    style={styles.mapBackground}
                                    imageStyle={{ opacity: 0.6 }}
                                >
                                    {/* Overlay for darker effect */}
                                    <View style={styles.mapOverlay} />

                                    <View style={[styles.mapAvatar, { top: 20, left: 30 }]}>
                                        <Image source={{ uri: 'https://randomuser.me/api/portraits/women/44.jpg' }} style={styles.mapAvatarImg} />
                                    </View>
                                    <View style={[styles.mapAvatar, { bottom: 30, right: 40 }]}>
                                        <Image source={{ uri: 'https://randomuser.me/api/portraits/men/32.jpg' }} style={styles.mapAvatarImg} />
                                    </View>
                                </ImageBackground>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.sectionCard, styles.halfCard,{backgroundColor:'#23272A'}]}
                                onPress={() => navigation.navigate('TripChat', { trip })}
                            >
                                <View style={styles.chatIconWrapper}>
                                    <View style={styles.chatIconCircle}>
                                        <Ionicons name="chatbubble-ellipses-outline" size={25} color="#B99A4A" />
                                    </View>
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>12</Text>
                                    </View>
                                </View>
                                <View style={{ marginTop: 'auto', paddingBottom: 10 }}>
                                    <Text style={styles.chatTitle}>Makkah crew</Text>
                                    <Text style={styles.chatPreview}>Liam: Sounds good,{'\n'}see you there!</Text>
                                </View>
                            </TouchableOpacity>
                        </View>

                        {/* Notifications Section */}
                        <View style={styles.sectionCard}>
                            <Text style={styles.notificationTitle}>Notification</Text>
                            <View style={styles.notificationListContainer}>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled={true}
                                >
                                    {MOCK_NOTIFICATIONS.map((item, index) => (
                                        <View key={item.id}>
                                            <View style={styles.notificationItem}>
                                                <View style={styles.notificationContent}>
                                                    <Text style={styles.notifName}>{item.name} <Text style={styles.notifMsg}>{item.message}</Text></Text>
                                                </View>
                                                <TouchableOpacity style={styles.acceptButton}>
                                                    <Ionicons name="checkmark-circle-outline" size={14} color="#FFF" style={{ marginRight: 6 }} />
                                                    <Text style={styles.acceptButtonText}>Accept</Text>
                                                </TouchableOpacity>
                                            </View>
                                            {index < MOCK_NOTIFICATIONS.length - 1 && <View style={styles.notificationSeparator} />}
                                        </View>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>


                        {/* Participants List */}
                        <View
                            style={styles.sectionCard}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <Text style={styles.sectionTitle}>Participants</Text>
                                <View style={styles.searchBar}>
                                    <Ionicons name="search" size={16} color="#A1A1AA" />
                                </View>
                                <TouchableOpacity onPress={() => navigation.navigate('TripParticipants')}>
                                    <Ionicons name="chevron-forward" size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.participantsScrollContainer}>
                                <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                                    {MOCK_PARTICIPANTS.map((p, idx) => (
                                        <TouchableOpacity
                                            key={idx}
                                            style={styles.participantRow}
                                            onPress={() => handleParticipantPress(p)}
                                        >
                                            <View style={[
                                                styles.participantAvatarContainer,
                                                p.isSpeaking && styles.speakingAvatarBorder
                                            ]}>
                                                <Image source={{ uri: p.image }} style={styles.participantAvatar} />
                                            </View>
                                            <View style={styles.participantInfo}>
                                                <Text style={styles.participantName}>{p.name}</Text>
                                                <Text style={p.isSpeaking ? styles.participantStatus : styles.participantStatusMuted}>
                                                    {p.status}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>

                        {/* Quick Messages & Alert Row - Hide Quick Messages for Participants */}
                        <View style={styles.rowContainer}>
                            {isAdmin && (
                                <View style={[styles.sectionCard, styles.halfCard, styles.quickMsgCard]}>
                                    {QUICK_MESSAGES.map((msg, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            style={styles.quickMsgItem}
                                            onPress={() => handleQuickMsgPress(msg)}
                                        >
                                            <Text style={styles.quickMsgText}>{msg}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}


                            <TouchableOpacity
                                style={[styles.sectionCard, styles.halfCard, styles.alertCard, !isAdmin && { flex: 1 }]}
                                onPress={() => {
                                    if (!isAdmin) {
                                        setCountdown(10);
                                        setEmergencyModalVisible(true);
                                    } else {
                                        navigation.navigate('AlertHistory');
                                    }
                                }}
                            >
                                <View style={styles.alertIconContainer}>
                                    <Ionicons name="information-circle-outline" size={24} color="#FDF3DC" />
                                </View>
                                <View style={styles.alertContent}>
                                    {/* <Ionicons name="chevron-forward" size={20} color="#FFF" style={{ alignSelf: 'flex-end', marginBottom: 20 }} /> */}
                                    <Text style={styles.alertTitle}>Ethan Carter</Text>
                                </View>
                            </TouchableOpacity>
                        </View>

                        <View style={{ height: 150 }} />
                    </ScrollView>

                    {/* Bottom Trip Navigation (Reusable) */}
                    <TripBottomTabBar activeRoute="TripOverview" tripData={tripData} />
                </SafeAreaView>
            </ImageBackground>

            {/* Emergency Alert Modal */}
            <Modal
                visible={emergencyModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setEmergencyModalVisible(false)}
            >
                <View style={styles.emergencyOverlay}>
                    <View style={styles.emergencyContent}>
                        <Text style={styles.emergencyTitle}>Notifying Host</Text>
                        <Text style={styles.emergencySubtitle}>Emergency alert will be sent in</Text>
                        <Text style={styles.countdownText}>{countdown} <Text style={{ color: '#942F31', fontSize: responsiveFontSize(32) }}>seconds</Text></Text>

                        <TouchableOpacity
                            style={styles.emergencyCancelBtn}
                            onPress={() => setEmergencyModalVisible(false)}
                        >
                            <LinearGradient
                                colors={['#B99A4A', '#523631']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.emergencyCancelGradient}
                            >
                                <View style={styles.emergencyCancelInner}>
                                    <Text style={styles.emergencyCancelText}>Cancel</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Participant Detail Modal - Bottom Sheet */}
            <Modal
                visible={detailVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setDetailVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setDetailVisible(false)}>
                    <View style={styles.modalOverlayFull}>
                        <TouchableWithoutFeedback>
                            <View style={styles.bottomSheet}>
                                <View style={styles.handle} />
                                <Text style={styles.sheetTitle}>Participant Detail</Text>
                                <View style={styles.divider} />

                                {selectedParticipant && (
                                    <>
                                        <View style={styles.detailHeader}>
                                            <Image source={{ uri: selectedParticipant.image }} style={styles.detailAvatar} />
                                            <Text style={styles.detailName}>{selectedParticipant.name}</Text>
                                        </View>

                                        {/* Real Map View */}
                                        <View style={styles.mapPlaceholder}>
                                            <MapView
                                                style={StyleSheet.absoluteFill}
                                                initialRegion={{
                                                    latitude: 21.4225,
                                                    longitude: 39.8262,
                                                    latitudeDelta: 0.01,
                                                    longitudeDelta: 0.01,
                                                }}
                                                customMapStyle={mapDarkStyle}
                                            >
                                                <Marker
                                                    coordinate={{ latitude: 21.4225, longitude: 39.8262 }}
                                                >
                                                    <View style={styles.mapPinContainer}>
                                                        <Image source={{ uri: selectedParticipant.image }} style={styles.mapPinAvatar} />
                                                    </View>
                                                </Marker>
                                            </MapView>
                                        </View>

                                        {isAdmin && (
                                            <>
                                                <GradientBorderButton
                                                    text="Edit Participant"
                                                    onPress={() => {
                                                        setDetailVisible(false);
                                                        navigation.navigate('EditParticipant', { participant: selectedParticipant });
                                                    }}
                                                    style={{ marginBottom: 16 }}
                                                    innerBg="#1E2124"
                                                />

                                                <TouchableOpacity
                                                    style={styles.deleteButtonPill}
                                                    onPress={handleDeletePress}
                                                >
                                                    <Ionicons name="trash-outline" size={20} color="#FFF" style={{ marginRight: 10 }} />
                                                    <Text style={{ color: '#fff' }}>Delete for this trip</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={styles.deleteButtonPill}
                                                    onPress={handleDeletePress}
                                                >
                                                    <Ionicons name="trash-outline" size={20} color="#FFF" style={{ marginRight: 10 }} />
                                                    <Text style={{ color: '#fff' }}>Delete for all trip</Text>
                                                </TouchableOpacity>
                                            </>
                                        )}
                                    </>
                                )}
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                visible={deleteConfirmVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setDeleteConfirmVisible(false)}
            >
                <View style={styles.confirmOverlay}>
                    <View style={styles.confirmBox}>
                        <Text style={styles.confirmTitle}>Are You sure you want to delete this participant</Text>

                        <View style={styles.confirmButtons}>
                            <GradientBorderButton
                                text="Cancel"
                                onPress={() => setDeleteConfirmVisible(false)}
                                style={{ flex: 1 }}
                                innerBg="#1E2124"
                            />
                            <TouchableOpacity
                                style={styles.confirmDeleteBtn}
                                onPress={() => setDeleteConfirmVisible(false)}
                            >
                                <Text style={styles.confirmDeleteText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Quick Message Alert Modal */}
            <Modal
                visible={quickAlertVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setQuickAlertVisible(false)}
            >
                <View style={styles.quickAlertOverlay}>
                    <View style={styles.quickAlertBox}>
                        <View style={styles.quickAlertHeader}>
                            <View style={styles.alertIconCircleSmall}>
                                <Ionicons name="information" size={20} color="#FF4B4B" />
                            </View>
                            <Text style={styles.quickAlertTitle}>Alert!</Text>
                        </View>

                        <Text style={styles.quickAlertMsg}>{alertMessage}</Text>

                        <TouchableOpacity
                            style={styles.quickAlertBtn}
                            onPress={() => setQuickAlertVisible(false)}
                        >
                            <LinearGradient
                                colors={['#D4AF37', '#B8860B']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.quickAlertGradient}
                            >
                                <View style={styles.quickAlertInner}>
                                    <Text style={styles.quickAlertBtnText}>OK</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
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
        fontFamily: Typography.sans.regular,
    },
    iconButton: {
        padding: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    tripCard: {
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 20,
        height: 160,
    },
    tripCardGradient: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
    },
    tripTitle: {
        fontSize: responsiveFontSize(24),
        color: '#FFF',
        fontFamily: Typography.sans.bold,
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 10,
    },
    infoText: {
        color: '#fff',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.regular,
    },
    chatIconWrapper: {
        position: 'relative',
        width: 64,
        height: 64,
        marginBottom: 5
    },
    chatIconCircle: {
        width: 54,
        height: 54,
        borderRadius: 32,
        backgroundColor: '#2D3134',
        justifyContent: 'center',
        alignItems: 'center',
    },
    badge: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        backgroundColor: '#B99A4A',
        width: 18,
        height: 18,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: responsiveFontSize(10),
        fontFamily: Typography.sans.bold,
    },
    chatTitle: {
        color: '#FFFFFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.bold,
        marginBottom: 8,
    },
    chatPreview: {
        color: '#71717A',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.regular,
        lineHeight: 20,
    },
    prayerTimesContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 25,
        paddingHorizontal: 10,
    },
    prayerItem: {
        alignItems: 'center',
    },
    prayerName: {
        color: '#A1A1AA',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
        marginBottom: 4,
    },
    prayerTime: {
        color: '#A1A1AA',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.semiBold,
    },
    sectionCard: {
        backgroundColor: '#2D3134',
        borderRadius: 24,
        padding: 20,
        marginVertical: 6,
        // borderWidth: 1,
        // borderColor: 'rgba(255,255,255,0.05)',
    },
    notificationTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(22),
        fontFamily: Typography.sans.bold,
        marginBottom: 10,
    },
    notificationListContainer: {
        height: 160,
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },
    notificationContent: {
        flex: 1,
        marginRight: 10,
    },
    notifName: {
        color: '#FFF',
        fontSize: responsiveFontSize(15),
        fontFamily: Typography.sans.bold
    },
    notifMsg: {
        color: '#fff',
        fontFamily: Typography.sans.regular,
    },
    acceptButton: {
        backgroundColor: '#34C759',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        minWidth: 100,
    },
    acceptButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.bold,
    },
    notificationSeparator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    channelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        backgroundColor: '#23272A',
        padding: 10,
        borderRadius: 20,
    },
    avatarWrapper: {
        position: 'relative',
    },
    speakerAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: '#34C759',
        elevation: 14,
        shadowColor: '#34C759',
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowOpacity: 0.8,
        shadowRadius: 10
    },
    liveIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#34C759',
        position: 'absolute',
        bottom: 2,
        right: 2,
        borderWidth: 2,
        borderColor: '#1E2023',
    },
    channelInfo: {
        flex: 1,
        marginLeft: 12,
    },
    channelStatus: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    activeSpeaker: {
        color: '#9BA1A6',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
    },
    controlsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
        backgroundColor: '#23272A',
        padding: 10,
        borderRadius: 20,
    },
    controlButtonOutline: {
        width: '48%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 30, // Pill shape
        borderWidth: 1,
        borderColor: '#B99A4A',
        marginBottom: 10,
    },
    controlText: {
        color: '#FFF',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.medium,
    },
    rowContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    halfCard: {
        flex: 1,
        height: 180, // Taller to fit content
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: responsiveFontSize(18),
        color: '#FFF',
        fontFamily: Typography.sans.bold,
        flex: 1,
    },
    searchBar: {
        width: "50%",
        height: 40,
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 15,
        justifyContent: 'center',
        paddingHorizontal: 10,
        marginRight: 10,
    },
    participantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    participantsScrollContainer: {
        height: 180, // Height for roughly 3 items (60px each)
    },
    participantAvatarContainer: {
        marginRight: 12,
        borderRadius: 24,
        padding: 2, // For border space
    },
    speakingAvatarBorder: {
        borderWidth: 2,
        borderColor: '#34C759',
        shadowColor: '#34C759',
        shadowOpacity: 0.5,
        shadowRadius: 5,
    },
    participantAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#ccc',
    },
    participantInfo: {
        flex: 1,
    },
    participantName: {
        fontSize: responsiveFontSize(16),
        color: '#FFF',
        fontFamily: Typography.sans.semiBold,
    },
    participantStatus: {
        fontSize: responsiveFontSize(13),
        color: '#9BA1A6',
        fontFamily: Typography.sans.regular,
    },
    participantStatusMuted: {
        fontSize: responsiveFontSize(13),
        color: '#636D77',
        fontFamily: Typography.sans.regular,
    },
    quickMsgCard: {
        backgroundColor: '#2D3134',
        padding: 10,
        justifyContent: 'space-between',
    },
    quickMsgItem: {
        backgroundColor: '#23272A',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
    },
    quickMsgText: {
        color: '#E0E0E0',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
    },
    alertCard: {
        backgroundColor: '#2D2528', // Dark reddish tint background
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        padding: 20,
    },
    alertIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#D92D20', // Red alert color
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        alignSelf: 'flex-start',
    },
    alertContent: {
        width: '100%',
    },
    alertTitle: {
        fontSize: responsiveFontSize(18),
        color: '#FFF',
        fontFamily: Typography.sans.bold,
    },
    mapBackground: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: '#1A1E21',
    },
    mapOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    mapAvatar: {
        position: 'absolute',
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 3,
        borderColor: '#B99A4A',
        overflow: 'hidden',
        shadowColor: '#B99A4A',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 10,
    },
    mapAvatarImg: {
        width: '100%',
        height: '100%',
    },
    // Modal Styles
    bottomSheet: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
        width: '100%',
        marginTop: 'auto', // Push to bottom
    },
    handle: {
        width: 60,
        height: 5,
        backgroundColor: '#FFF',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
        opacity: 0.8,
    },
    modalOverlayFull: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheetTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(28),
        fontFamily: Typography.serif.regular,
        marginBottom: 16,
    },
    divider: {
        height: 0.2,
        backgroundColor: '#eeeeee',
        marginBottom: 24,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    detailAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        marginRight: 16,
    },
    detailName: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    mapPlaceholder: {
        width: '100%',
        height: 180,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 30,
        backgroundColor: '#1A1E21',
    },
    mapImage: {
        width: '100%',
        height: '100%',
    },
    mapPinContainer: {
        position: 'absolute',
        top: '40%',
        left: '50%',
        transform: [{ translateX: -20 }, { translateY: -20 }],
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#B99A4A',
        overflow: 'hidden',
    },
    mapPinAvatar: {
        width: '100%',
        height: '100%',
    },
    deleteButtonPill: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        backgroundColor: '#942F31',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    confirmOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    confirmBox: {
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 30,
        width: '100%',
        alignItems: 'center',
    },
    confirmTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
        textAlign: 'center',
        marginBottom: 30,
    },
    confirmButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    confirmDeleteBtn: {
        flex: 1,
        height: 56,
        backgroundColor: '#942F31',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmDeleteText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    // Quick Alert Styles
    quickAlertOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    quickAlertBox: {
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        alignItems: 'center',
    },
    quickAlertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 10,
    },
    alertIconCircleSmall: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#FF4B4B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickAlertTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(20),
        fontFamily: Typography.sans.bold,
    },
    quickAlertMsg: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.semiBold,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 26,
    },
    quickAlertBtn: {
        width: '100%',
    },
    quickAlertGradient: {
        borderRadius: 28,
        padding: 1.5,
    },
    quickAlertInner: {
        backgroundColor: '#1E2124',
        borderRadius: 26.5,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickAlertBtnText: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.bold,
    },
    // Emergency Modal Styles
    emergencyOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    emergencyContent: {
        backgroundColor: '#23272A',
        borderRadius: 24,
        padding: 30,
        width: '100%',
        alignItems: 'center',
    },
    emergencyTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(22),
        fontFamily: Typography.sans.bold,
        marginBottom: 25,
    },
    emergencySubtitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.regular,
        marginBottom: 10,
    },
    countdownText: {
        color: '#942F31',
        fontSize: responsiveFontSize(48),
        fontFamily: Typography.sans.bold,
        marginBottom: 30,
    },
    emergencyCancelBtn: {
        width: '100%',
        marginTop: 10,
        backgroundColor: '#23272A',
    },
    emergencyCancelGradient: {
        borderRadius: 28,
        padding: 1.5, // Standard border width for gradient
    },
    emergencyCancelInner: {
        backgroundColor: '#1E2124',
        borderRadius: 26.5,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emergencyCancelText: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.bold,
    },
});

const mapDarkStyle = [
    {
        "elementType": "geometry",
        "stylers": [{ "color": "#212121" }]
    },
    {
        "elementType": "labels.icon",
        "stylers": [{ "visibility": "off" }]
    },
    {
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#757575" }]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [{ "color": "#1A1E21" }]
    },
    {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [{ "color": "#1E2124" }]
    },
    {
        "featureType": "road",
        "elementType": "geometry.fill",
        "stylers": [{ "color": "#2C2F33" }]
    },
    {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [{ "color": "#000000" }]
    }
];

export default TripOverviewScreen;
