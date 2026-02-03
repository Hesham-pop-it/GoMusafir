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
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useNavigation, useRoute } from '@react-navigation/native';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import GradientBorderButton from '../../components/GradientBorderButton';

const { width, height } = Dimensions.get('window');

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
                    colors={['rgba(0,0,0,0.3)', '#121417']}
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
                            <TouchableOpacity style={styles.iconButton}>
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
                            <TouchableOpacity style={styles.channelHeader}>
                                <View style={styles.avatarWrapper}>
                                    <Image
                                        source={{ uri: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=3387&auto=format&fit=crop' }}
                                        style={styles.speakerAvatar}
                                    />
                                    <View style={styles.liveIndicator} />
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
                                            <Ionicons
                                                name={isMuted ? "mic-off-outline" : "mic"}
                                                size={20}
                                                color={isMuted ? "#FFF" : "#D66A77"}
                                                style={{ marginRight: 8 }}
                                            />
                                            <Text style={[styles.controlText, !isMuted && { color: '#D66A77' }]}>
                                                Mute Myself
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.controlButtonOutline}>
                                            <Ionicons name="mic-off-circle-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                                            <Text style={styles.controlText}>Mute All</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.controlButtonOutline}>
                                            <Ionicons name="play-circle-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                                            <Text style={styles.controlText}>Channel Start</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.controlButtonOutline}>
                                            <Ionicons name="pause-circle-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                                            <Text style={styles.controlText}>Channel Pause</Text>
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
                                        <Ionicons
                                            name={isMuted ? "mic-off-outline" : "mic"}
                                            size={20}
                                            color={isMuted ? "#FFF" : "#D66A77"}
                                            style={{ marginRight: 8 }}
                                        />
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
                                style={[styles.sectionCard, styles.halfCard]}
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


                        {/* Participants List */}
                        <View
                            style={styles.sectionCard}
                        >
                            <View style={styles.sectionHeaderRow}>
                                <Text style={styles.sectionTitle}>Participants</Text>
                                <View style={styles.searchBar}>
                                    <Ionicons name="search" size={16} color="#9BA1A6" />
                                </View>
                                <TouchableOpacity onPress={() => navigation.navigate('Participants')}>
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
                                    <Ionicons name="information-outline" size={24} color="#FFF" />
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
                        <Text style={styles.countdownText}>{countdown} <Text style={{ color: '#942F31', fontSize: 32 }}>seconds</Text></Text>

                        <TouchableOpacity
                            style={styles.emergencyCancelBtn}
                            onPress={() => setEmergencyModalVisible(false)}
                        >
                            <LinearGradient
                                colors={['#D4AF37', '#523631']}
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
                                                <TouchableOpacity
                                                    style={styles.actionButtonGreen}
                                                    onPress={() => {
                                                        setDetailVisible(false);
                                                        navigation.navigate('EditParticipant', { participant: selectedParticipant });
                                                    }}
                                                >
                                                    <Text style={styles.actionButtonText}>Edit Participant</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={styles.deleteButtonPill}
                                                    onPress={handleDeletePress}
                                                >
                                                    <Ionicons name="trash-outline" size={20} color="#FFF" style={{ marginRight: 10 }} />
                                                    <Text style={styles.deleteButtonText}>Delete for this trip</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={styles.deleteButtonPill}
                                                    onPress={handleDeletePress}
                                                >
                                                    <Ionicons name="trash-outline" size={20} color="#FFF" style={{ marginRight: 10 }} />
                                                    <Text style={styles.deleteButtonText}>Delete for all trip</Text>
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
        fontSize: 22,
        color: '#FFF',
        fontFamily: 'IBMPlexSans',
        fontWeight: 'bold',
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
        height: 180,
    },
    tripCardGradient: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
    },
    tripTitle: {
        fontSize: 24,
        color: '#FFF',
        fontFamily: 'IBMPlexSans',
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 10,
    },
    infoText: {
        color: '#E0E0E0',
        fontSize: 14,
    },
    chatIconWrapper: {
        position: 'relative',
        width: 64,
        height: 64,
        marginBottom: 5,
    },
    chatIconCircle: {
        width: 54,
        height: 54,
        borderRadius: 32,
        backgroundColor: '#23272A',
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
        fontSize: 10,
        fontWeight: 'bold',
    },
    chatTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    chatPreview: {
        color: '#71717A',
        fontSize: 14,
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
        fontSize: 12,
        marginBottom: 4,
    },
    prayerTime: {
        color: '#A1A1AA',
        fontSize: 14,
        fontWeight: '600',
    },
    sectionCard: {
        backgroundColor: '#2D3134',
        borderRadius: 20,
        padding: 16,
        marginVertical: 5,
        borderWidth: 1,
        borderColor: '#2C2E33',
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
        fontSize: 16,
        fontWeight: 'bold',
    },
    activeSpeaker: {
        color: '#9BA1A6',
        fontSize: 13,
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
        fontSize: 13,
        fontWeight: '500',
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
        fontSize: 18,
        color: '#FFF',
        fontWeight: 'bold',
        flex: 1,
    },
    searchBar: {
        width: "50%",
        height: 40,
        backgroundColor: '#23272A',
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
        fontSize: 16,
        color: '#FFF',
        fontWeight: '600',
    },
    participantStatus: {
        fontSize: 13,
        color: '#9BA1A6',
    },
    participantStatusMuted: {
        fontSize: 13,
        color: '#636D77',
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
        fontSize: 12,
    },
    alertCard: {
        backgroundColor: '#2A2121', // Dark reddish tint background
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        padding: 20,
    },
    alertIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#D32F2F', // Red alert color
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        alignSelf: 'flex-start',
    },
    alertContent: {
        width: '100%',
    },
    alertTitle: {
        fontSize: 18,
        color: '#FFF',
        fontWeight: 'bold',
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
        fontSize: 28,
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        marginBottom: 16,
    },
    divider: {
        height: 1,
        backgroundColor: '#2C2E33',
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
        fontSize: 20,
        fontWeight: 'bold',
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
    actionButtonGreen: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        backgroundColor: '#2AB060', // Vibrant green
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    actionButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
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
        fontSize: 20,
        fontWeight: 'bold',
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
        fontSize: 16,
        fontWeight: 'bold',
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
        fontSize: 20,
        fontWeight: 'bold',
    },
    quickAlertMsg: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '600',
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
        fontSize: 18,
        fontWeight: 'bold',
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
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 30,
        width: '100%',
        alignItems: 'center',
    },
    emergencyTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 25,
    },
    emergencySubtitle: {
        color: '#FFF',
        fontSize: 14,
        marginBottom: 10,
    },
    countdownText: {
        color: '#942F31',
        fontSize: 48,
        fontWeight: 'bold',
        marginBottom: 30,
    },
    emergencyCancelBtn: {
        width: '100%',
        marginTop: 10,
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
        fontSize: 18,
        fontWeight: 'bold',
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
        "stylers": [{ "color": "#121417" }]
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
