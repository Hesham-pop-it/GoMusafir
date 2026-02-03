import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Image,
    ScrollView,
    Modal,
    Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import TripBottomTabBar from '../../components/TripBottomTabBar';

const { width, height } = Dimensions.get('window');

// Mock participant locations
const MOCK_PARTICIPANTS = [
    {
        id: '1',
        name: 'Ethan Carter',
        avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
        latitude: 37.78825,
        longitude: -122.4324,
    },
    {
        id: '2',
        name: 'Sophia Bennett',
        avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
        latitude: 37.78925,
        longitude: -122.4314,
    },
];

const LiveLocationScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { trip, invitationCode: directCode } = route.params || {};
    const invitationCode = directCode || trip?.invitationCode;
    const isAdmin = !invitationCode;

    const [userLocation, setUserLocation] = useState(null);
    const [showParticipantsList, setShowParticipantsList] = useState(false);
    const [locationRequestModal, setLocationRequestModal] = useState(false);
    const [googleMapsModal, setGoogleMapsModal] = useState(false);
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [mapRegion, setMapRegion] = useState({
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    });

    useEffect(() => {
        getUserLocation();
    }, []);

    const getUserLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.log('Permission denied');
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            const userCoords = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
            };
            setUserLocation(userCoords);
            setMapRegion({
                ...userCoords,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            });
        } catch (error) {
            console.log('Error getting location:', error);
        }
    };

    const centerOnUser = () => {
        if (userLocation) {
            setMapRegion({
                ...userLocation,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            });
        }
    };

    const handleQuestionPress = (participant) => {
        setSelectedParticipant(participant);
        setLocationRequestModal(true);
    };

    const handleLocationPress = (participant) => {
        setSelectedParticipant(participant);
        setGoogleMapsModal(true);
    };

    const openGoogleMaps = () => {
        if (selectedParticipant) {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedParticipant.latitude},${selectedParticipant.longitude}`;
            Linking.openURL(url);
            setGoogleMapsModal(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <SafeAreaView edges={['top']} style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Live Location</Text>
                <View style={{ width: 40 }} />
            </SafeAreaView>

            {/* Map */}
            <MapView
                provider={PROVIDER_GOOGLE}
                style={styles.map}
                region={mapRegion}
                onRegionChangeComplete={setMapRegion}
                customMapStyle={darkMapStyle}
            >
                {/* User Location Marker */}
                {userLocation && (
                    <Marker coordinate={userLocation}>
                        <View style={styles.userMarker}>
                            <Ionicons name="location" size={32} color="#FFF" />
                        </View>
                    </Marker>
                )}

                {/* Participant Markers */}
                {MOCK_PARTICIPANTS.map((participant) => (
                    <Marker
                        key={participant.id}
                        coordinate={{
                            latitude: participant.latitude,
                            longitude: participant.longitude,
                        }}
                    >
                        <View style={styles.participantMarker}>
                            <Image
                                source={{ uri: participant.avatar }}
                                style={styles.markerAvatar}
                            />
                        </View>
                    </Marker>
                ))}
            </MapView>

            {/* Control Buttons */}
            <View style={styles.controlButtons}>
                <TouchableOpacity style={styles.controlBtn}>
                    <MaterialCommunityIcons name="eye-off-outline" size={24} color="#B99A4A" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.controlBtn} onPress={centerOnUser}>
                    <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#B99A4A" />
                </TouchableOpacity>
            </View>

            {/* List Participant Button */}
            <TouchableOpacity
                style={styles.listButton}
                onPress={() => setShowParticipantsList(true)}
            >
                <Ionicons name="people" size={20} color="#FFF" />
                <Text style={styles.listButtonText}>List Participant</Text>
            </TouchableOpacity>

            {/* Participants List Modal */}
            <Modal
                visible={showParticipantsList}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowParticipantsList(false)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        activeOpacity={1}
                        onPress={() => setShowParticipantsList(false)}
                    />
                    <View style={styles.participantsModal}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Participants</Text>

                        {/* Search Bar */}
                        <View style={styles.searchContainer}>
                            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
                            <Text style={styles.searchPlaceholder}>Search participant</Text>
                        </View>

                        <ScrollView style={styles.participantsList}>
                            {MOCK_PARTICIPANTS.map((participant) => (
                                <View key={participant.id} style={styles.participantItem}>
                                    <Image
                                        source={{ uri: participant.avatar }}
                                        style={styles.participantAvatar}
                                    />
                                    <Text style={styles.participantName}>{participant.name}</Text>

                                    {/* Action Buttons */}
                                    <View style={styles.actionButtons}>
                                        <TouchableOpacity
                                            style={styles.questionBtn}
                                            onPress={() => handleQuestionPress(participant)}
                                        >
                                            <Text style={styles.questionText}>?</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.locateBtn}
                                            onPress={() => handleLocationPress(participant)}
                                        >
                                            <Ionicons name="location" size={24} color="#FFF" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Location Request Modal */}
            < Modal
                visible={locationRequestModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setLocationRequestModal(false)}
            >
                <View style={styles.centeredModalOverlay}>
                    <View style={styles.alertModal}>
                        <Text style={styles.alertTitle}>Location requested</Text>
                        <TouchableOpacity
                            style={styles.gradientButtonWrapper}
                            onPress={() => setLocationRequestModal(false)}
                        >
                            <LinearGradient
                                colors={['#D4AF37', '#B8860B', '#8B6914']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.gradientBorder}
                            >
                                <View style={styles.buttonInner}>
                                    <Text style={styles.okButtonText}>OK</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal >

            {/* Google Maps Modal */}
            < Modal
                visible={googleMapsModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setGoogleMapsModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        activeOpacity={1}
                        onPress={() => setGoogleMapsModal(false)}
                    />
                    <View style={styles.mapsModal}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.mapsMessage}>Route will start through</Text>
                        <TouchableOpacity
                            style={styles.gradientButtonWrapper}
                            onPress={openGoogleMaps}
                        >
                            <LinearGradient
                                colors={['#D4AF37', '#B8860B', '#8B6914']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.gradientBorder}
                            >
                                <View style={styles.buttonInner}>
                                    <Text style={styles.googleMapsButtonText}>Google Maps</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal >

            <TripBottomTabBar activeRoute="LiveLocation" tripData={trip} />
        </View >
    );
};

// Dark map style for Google Maps
const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#212121' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
    {
        featureType: 'administrative',
        elementType: 'geometry',
        stylers: [{ color: '#757575' }],
    },
    {
        featureType: 'administrative.country',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#9e9e9e' }],
    },
    {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#bdbdbd' }],
    },
    {
        featureType: 'poi',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#757575' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [{ color: '#181818' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#616161' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'labels.text.stroke',
        stylers: [{ color: '#1b1b1b' }],
    },
    {
        featureType: 'road',
        elementType: 'geometry.fill',
        stylers: [{ color: '#2c2c2c' }],
    },
    {
        featureType: 'road',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#8a8a8a' }],
    },
    {
        featureType: 'road.arterial',
        elementType: 'geometry',
        stylers: [{ color: '#373737' }],
    },
    {
        featureType: 'road.highway',
        elementType: 'geometry',
        stylers: [{ color: '#3c3c3c' }],
    },
    {
        featureType: 'road.highway.controlled_access',
        elementType: 'geometry',
        stylers: [{ color: '#4e4e4e' }],
    },
    {
        featureType: 'road.local',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#616161' }],
    },
    {
        featureType: 'transit',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#757575' }],
    },
    {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#000000' }],
    },
    {
        featureType: 'water',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#3d3d3d' }],
    },
];

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121417',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#1A1E21',
        zIndex: 10,
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 22,
        color: '#FFF',
        fontFamily: 'IBMPlexSans',
        fontWeight: 'bold',
    },
    map: {
        flex: 1,
    },
    userMarker: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#FFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: '#B99A4A',
    },
    participantMarker: {
        width: 50,
        height: 50,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: '#B99A4A',
        overflow: 'hidden',
    },
    markerAvatar: {
        width: '100%',
        height: '100%',
    },
    controlButtons: {
        position: 'absolute',
        right: 20,
        top: height * 0.4,
        gap: 15,
    },
    controlBtn: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#1A1E21',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    listButton: {
        position: 'absolute',
        bottom: 140,
        left: 20,
        right: 20,
        backgroundColor: '#B99A4A',
        borderRadius: 30,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    listButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    participantsModal: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 12,
        paddingBottom: 40,
        maxHeight: height * 0.6,
    },
    modalHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#444',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 22,
        color: '#FFF',
        fontWeight: 'bold',
        paddingHorizontal: 24,
        marginBottom: 20,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2C2F33',
        marginHorizontal: 24,
        marginBottom: 20,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    searchIcon: {
        marginRight: 12,
    },
    searchPlaceholder: {
        color: '#666',
        fontSize: 16,
    },
    participantsList: {
        paddingHorizontal: 24,
    },
    participantItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 0,
    },
    participantAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        marginRight: 16,
    },
    participantName: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    questionBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#8B4545',
        alignItems: 'center',
        justifyContent: 'center',
    },
    questionText: {
        color: '#FFF',
        fontSize: 24,
        fontWeight: 'bold',
    },
    locateBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#4A4A4A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Location Request Modal
    centeredModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    alertModal: {
        backgroundColor: '#3A3F45',
        borderRadius: 20,
        padding: 32,
        width: '100%',
        alignItems: 'center',
    },
    alertTitle: {
        fontSize: 20,
        color: '#FFF',
        fontWeight: 'bold',
        marginBottom: 24,
        textAlign: 'center',
    },
    gradientButtonWrapper: {
        width: '100%',
    },
    gradientBorder: {
        borderRadius: 30,
        padding: 2, // Border width
    },
    buttonInner: {
        backgroundColor: '#3A3F45',
        borderRadius: 28,
        paddingVertical: 16,
        alignItems: 'center',
    },
    okButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Google Maps Modal
    mapsModal: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 12,
        paddingBottom: 40,
        paddingHorizontal: 24,
    },
    mapsMessage: {
        fontSize: 18,
        color: '#FFF',
        textAlign: 'center',
        marginBottom: 24,
        marginTop: 20,
    },
    googleMapsButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default LiveLocationScreen;
