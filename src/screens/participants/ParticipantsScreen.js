import { getVisibleSnapshot } from '../../services/visibilityData';
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    FlatList,
    Image,
    TouchableOpacity,
    StatusBar,
    Platform,
    ScrollView,
    Dimensions,
    ActivityIndicator,
} from 'react-native';
import Modal from '../../components/CompatModal';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import { Colors } from '../../constants/Colors';
import CustomBottomTabBar from '../../components/CustomBottomTabBar';
import * as NavigationBar from 'expo-navigation-bar';
import ParticipantDetailsModal from '../../components/ParticipantDetailsModal';
import { Typography } from '../../constants/Typography';
import { auth, database, functions } from '../../config/firebase';
import { ref, onValue, get } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { useLanguage } from '../../context/LanguageContext';
import ChatEncryption from '../../utils/chatEncryption';
import { isStaffMember, checkPIIVisibility, getParticipantDisplayName, getParticipantDisplayPhoto } from '../../utils/visibilityHelper';

const { width } = Dimensions.get('window');

// PARTICIPANTS_DATA removed - now using live database

const LANGUAGES = [
    { code: 'ar', label: 'Arabic' },
    { code: 'en', label: 'English' },
    { code: 'nl', label: 'Dutch' },
];

const LanguageModal = ({ visible, onClose, onSelect, selectedLanguage }) => {
    const { changeLanguage } = useLanguage();
    
    const renderLanguageItem = ({ item }) => (
        <TouchableOpacity
            style={styles.languageItem}
            onPress={() => {
                changeLanguage(item.code);
                onClose();
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
        <Modal
            isVisible={visible}
            onBackdropPress={onClose}
            onBackButtonPress={onClose}
            useNativeDriver={true}
            hideModalContentWhileAnimating={true}
            animationIn="fadeIn"
            animationOut="fadeOut"
            style={{ margin: 0, justifyContent: 'flex-start', alignItems: 'flex-end' }}
        >
            <TouchableOpacity
                style={styles.languageModalOverlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View style={styles.languageModalContent}>
                    <FlatList
                        data={LANGUAGES}
                        renderItem={renderLanguageItem}
                        keyExtractor={item => item.code}
                        showsVerticalScrollIndicator={false}
                    />
                </View>
            </TouchableOpacity>
        </Modal>
    );
};

const FilterModal = ({ visible, onClose, sortOption, setSortOption, selectedJourney, setSelectedJourney, allParticipants }) => {
    const [showJourneys, setShowJourneys] = useState(false);
    const journeys = Array.from(new Set(allParticipants.map(p => p.trip))).filter(Boolean);

    const handleSelect = (option) => {
        setSortOption(option);
        onClose();
    };

    return (
        <Modal
            isVisible={visible}
            onBackdropPress={onClose}
            onSwipeComplete={onClose}
            swipeDirection="down"
            useNativeDriver={true}
            hideModalContentWhileAnimating={true}
            style={{ margin: 0, justifyContent: 'center', alignItems: 'center' }}
        >
            <View style={[styles.modalContent, styles.participantsModalContent]}>
                <View style={styles.modalDragIndicator} />

                {/* Select Journey Section */}
                <Text style={styles.modalLabel}>Select Journey</Text>
                <View style={{ zIndex: 1000 }}>
                    <TouchableOpacity
                        style={styles.journeyInputContainer}
                        onPress={() => setShowJourneys(!showJourneys)}
                    >
                        <Ionicons name="home-outline" size={20} color="#A1A1AA" />
                        <Text style={styles.journeyInputText}>{selectedJourney || 'All Journeys'}</Text>
                    </TouchableOpacity>

                    {showJourneys && (
                        <View style={styles.journeyDropdown}>
                            <ScrollView
                                style={styles.dropdownScroll}
                                nestedScrollEnabled={true}
                                showsVerticalScrollIndicator={true}
                                keyboardShouldPersistTaps="handled"
                            >
                                <TouchableOpacity
                                    style={styles.dropdownItem}
                                    onPress={() => {
                                        setSelectedJourney('');
                                        setShowJourneys(false);
                                    }}
                                >
                                    <Text style={styles.dropdownText}>All Journeys</Text>
                                </TouchableOpacity>
                                {journeys.map(item => (
                                    <TouchableOpacity
                                        key={item}
                                        style={styles.dropdownItem}
                                        onPress={() => {
                                            setSelectedJourney(item);
                                            setShowJourneys(false);
                                        }}
                                    >
                                        <Text style={styles.dropdownText}>{item}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>

                {/* Sort By Section */}
                <Text style={styles.modalLabel}>Sort by</Text>
                <View style={styles.chipsContainer}>
                    <View style={styles.row}>
                        <TouchableOpacity
                            style={styles.chip}
                            onPress={() => handleSelect('A-Z')}
                        >
                            {sortOption === 'A-Z' ? (
                                <LinearGradient
                                    colors={['#B99A4A', 'rgba(50, 53, 55, 0.6)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={StyleSheet.absoluteFill}
                                >
                                    <View style={styles.chipInnerSelected}>
                                        <Text style={[styles.chipText, styles.chipTextSelected]}>A-Z</Text>
                                    </View>
                                </LinearGradient>
                            ) : (
                                <Text style={styles.chipText}>A-Z</Text>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.chip}
                            onPress={() => handleSelect('Z-A')}
                        >
                            {sortOption === 'Z-A' ? (
                                <LinearGradient
                                    colors={['#B99A4A', 'rgba(50, 53, 55, 0.6)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={StyleSheet.absoluteFill}
                                >
                                    <View style={styles.chipInnerSelected}>
                                        <Text style={[styles.chipText, styles.chipTextSelected]}>Z-A</Text>
                                    </View>
                                </LinearGradient>
                            ) : (
                                <Text style={styles.chipText}>Z-A</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.chip, styles.chipFullWidth]}
                        onPress={() => handleSelect('Journey')}
                    >
                        {sortOption === 'Journey' ? (
                            <LinearGradient
                                colors={['#B99A4A', 'rgba(50, 53, 55, 0.6)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={StyleSheet.absoluteFill}
                            >
                                <View style={styles.chipInnerSelected}>
                                    <Text style={[styles.chipText, styles.chipTextSelected]}>Search Journey</Text>
                                </View>
                            </LinearGradient>
                        ) : (
                            <Text style={styles.chipText}>Search Journey</Text>
                        )}
                    </TouchableOpacity>

                    <View style={styles.row}>
                        <TouchableOpacity
                            style={[styles.chip, { flex: 0.5 }]}
                            onPress={() => handleSelect('Likes')}
                        >
                            {sortOption === 'Likes' ? (
                                <LinearGradient
                                    colors={['#B99A4A', 'rgba(50, 53, 55, 0.6)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={StyleSheet.absoluteFill}
                                >
                                    <View style={styles.chipInnerSelected}>
                                        <Text style={[styles.chipText, styles.chipTextSelected]}>Likes</Text>
                                    </View>
                                </LinearGradient>
                            ) : (
                                <Text style={styles.chipText}>Likes</Text>
                            )}
                        </TouchableOpacity>
                        <View style={{ flex: 0.5 }} />
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// Redundant TabBarBackground removed

const ParticipantsScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const [filterVisible, setFilterVisible] = useState(false);
    const [languageVisible, setLanguageVisible] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('EN');
    const [selectedJourney, setSelectedJourney] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOption, setSortOption] = useState('A-Z');

    const { t, isRTL, language, changeLanguage } = useLanguage();
    const [isLoading, setIsLoading] = useState(true);
    const [allParticipants, setAllParticipants] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [isDetailsVisible, setIsDetailsVisible] = useState(false);
    const [isDecrypting, setIsDecrypting] = useState(false);

    const renderEmptyComponent = () => {
        if (isLoading) {
            return (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#B99A4A" />
                </View>
            );
        }

        return (
            <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                    <Feather name="users" size={32} color="#B99A4A" />
                </View>
                <Text style={styles.emptyTitle}>{t('no_participants_title')}</Text>
                <Text style={styles.emptySubtitle}>{t('no_participants_subtitle')}</Text>
            </View>
        );
    };

    const handleParticipantPress = async (participant) => {
        setIsDecrypting(true);
        setSelectedParticipant(participant);
        setIsDetailsVisible(true);
        
        try {
            await ChatEncryption.initialize();
            const getProfile = httpsCallable(functions, 'getParticipantProfile');
            const result = await getProfile({
                targetUid: participant.id,
                tripId: participant.tripId
            });
            
            if (result.data) {
                setSelectedParticipant(prev => {
                    if (!prev || prev.id !== participant.id) return prev;
                    const newData = { ...prev, ...result.data.visibility,
                        email: result.data.email, phone: result.data.phone,
                        rawProfile: { ...prev.rawProfile, ...result.data.profile },
                    };
                    if (result.data.fullName) newData.name = result.data.fullName;

                    return newData;
                });
            }
        } catch (error) {
            console.log("[Participants] Decryption error:", error);
            // Fallback to already loaded (possibly hashed) data is already handled by state
        } finally {
            setIsDecrypting(false);
        }
    };

    // 1. Fetch Live Data from Firebase
    useEffect(() => {
        const user = auth.currentUser;
        if (!user) {
            setIsLoading(false);
            return;
        }

        const fetchAllParticipants = async () => {
            try {
                // Get User's Org ID from Token
                const tokenResult = await user.getIdTokenResult();
                let orgId = tokenResult.claims.orgId;
                
                // Fallback: Get from profile if token claim isn't present
                if (!orgId) {
                    const profileSnap = await getVisibleSnapshot(ref(database, `users/${user.uid}`), null);
                    if (profileSnap.exists()) {
                        orgId = profileSnap.val().staff_org_id || profileSnap.val().org_id;
                    }
                }

                if (!orgId) {
                    setIsLoading(false);
                    return;
                }

                // Get Staff list to filter them out later
                // Admin account should not be shown in participants
                const staffSnap = await get(ref(database, `orgs/${orgId}/staff`));
                const staffList = staffSnap.exists() ? staffSnap.val() : {};

                // Listen to Org's Trips
                const tripsRef = ref(database, `orgs/${orgId}/trips`);
                const unsubscribeTrips = onValue(tripsRef, async (snapshot) => {
                    if (snapshot.exists()) {
                        const tripsData = snapshot.val();
                        const participantsMap = new Map();
                        const tripIds = Object.keys(tripsData);

                        // For each trip, listen to its participants
                        for (const tripId of tripIds) {
                            try {
                                const tripName = tripsData[tripId].title || "Unknown Trip";
                                const pRef = ref(database, `trips_participants/${tripId}`);
                                
                                const pSnap = await get(pRef);
                                if (pSnap.exists()) {
                                    const pIds = Object.keys(pSnap.val());
                                    for (const pUid of pIds) {
                                        // Skip if user is a staff member (Admin, Co-host, Manager)
                                        if (staffList[pUid]) continue;

                                        // Fetch Profile
                                        try {
                                            const uSnap = await getVisibleSnapshot(ref(database, `users/${pUid}`), tripId);
                                            if (uSnap.exists()) {
                                                const profileData = uSnap.val();

                                                // Secondary check: Skip if user has staff_org_id set
                                                if (profileData.staff_org_id === orgId) continue;

                                                const profile = profileData.profile || {};
                                                
                                                const profileImage = profileData.photo || profileData.profile_photo || profile.photo || profile.photoURL || profileData.image;
                                                
                                                // Resolve Trip History
                                                const tripHistory = [];
                                                if (profileData.joined_trips) {
                                                    for (const historyTripId in profileData.joined_trips) {
                                                        const historyTrip = profileData.joined_trips[historyTripId];
                                                        const title = tripsData[historyTripId]?.title || "Past Trip";
                                                        tripHistory.push({
                                                             name: title,
                                                             status: historyTrip.status || "Joined"
                                                        });
                                                    }
                                                }

                                                const globalVisConfig = tripsData[tripId]?.visibility_config || {};
                                                const userVis = profileData.participant_visibility?.[tripId] || {};
                                                const isViewerStaff = true; // In the organization portal, viewers are org staff
                                                const isTargetStaff = Boolean(staffList[pUid]);

                                                const displayName = getParticipantDisplayName({
                                                    profile,
                                                    fullName: profileData.full_name || profileData.name,
                                                    targetUid: pUid,
                                                    viewerUid: user.uid,
                                                    isViewerStaff,
                                                    isTargetStaff,
                                                    globalConfig: globalVisConfig,
                                                    personalVisibility: userVis
                                                });

                                                const displayPhoto = getParticipantDisplayPhoto({
                                                    profile,
                                                    rawPhoto: profileImage,
                                                    displayName,
                                                    targetUid: pUid,
                                                    viewerUid: user.uid,
                                                    isViewerStaff,
                                                    isTargetStaff,
                                                    globalConfig: globalVisConfig,
                                                    personalVisibility: userVis
                                                });

                                                const canSeeFirstName = checkPIIVisibility({
                                                    field: 'name',
                                                    targetUid: pUid,
                                                    viewerUid: user.uid,
                                                    isViewerStaff,
                                                    isTargetStaff,
                                                    globalConfig: globalVisConfig,
                                                    personalVisibility: userVis
                                                });

                                                const canSeeLastName = checkPIIVisibility({
                                                    field: 'lastname',
                                                    targetUid: pUid,
                                                    viewerUid: user.uid,
                                                    isViewerStaff,
                                                    isTargetStaff,
                                                    globalConfig: globalVisConfig,
                                                    personalVisibility: userVis
                                                });

                                                const canSeeEmail = checkPIIVisibility({
                                                    field: 'email',
                                                    targetUid: pUid,
                                                    viewerUid: user.uid,
                                                    isViewerStaff,
                                                    isTargetStaff,
                                                    globalConfig: globalVisConfig,
                                                    personalVisibility: userVis
                                                });

                                                const canSeePhone = checkPIIVisibility({
                                                    field: 'phone',
                                                    targetUid: pUid,
                                                    viewerUid: user.uid,
                                                    isViewerStaff,
                                                    isTargetStaff,
                                                    globalConfig: globalVisConfig,
                                                    personalVisibility: userVis
                                                });

                                                participantsMap.set(pUid, {
                                                    id: pUid,
                                                    tripId: tripId,
                                                    name: displayName,
                                                    trip: tripName,
                                                    image: displayPhoto,
                                                    email: canSeeEmail ? (profile.email || profileData.email || profileData.p_email || 'N/A') : '***',
                                                    phone: canSeePhone ? (profile.phone || profileData.p_phone || profileData.phone || profileData.phone_number || 'N/A') : '***',
                                                    firstName: canSeeFirstName ? (profile.firstName || '') : '***',
                                                    lastName: canSeeLastName ? (profile.lastName || '') : '***',
                                                    canSeeFirstName,
                                                    canSeeLastName,
                                                    canSeeEmail,
                                                    canSeePhone,
                                                    tripHistory: tripHistory,
                                                    likes: profileData.likes || 0
                                                });
                                            } else {
                                            }
                                        } catch (profileErr) {
                                        }
                                    }
                                }
                            } catch (tripErr) {
                            }
                        }
                        const visibleParticipants = Array.from(participantsMap.values());
                        setAllParticipants(visibleParticipants);
                        setSelectedParticipant(previous => previous
                            ? visibleParticipants.find(p => p.id === previous.id && p.tripId === previous.tripId) || null
                            : null);
                        setIsLoading(false);
                    } else {
                        setAllParticipants([]);
                        setIsLoading(false);
                    }
                }, (error) => {
                    setIsLoading(false);
                });

                return () => unsubscribeTrips();
            } catch (err) {
                setIsLoading(false);
            }
        };

        let disposed = false, stop = null, refreshing = false;
        const refresh = async () => {
            if (refreshing || disposed) return;
            refreshing = true;
            try {
                stop?.();
                const nextStop = await fetchAllParticipants();
                if (disposed) nextStop?.();
                else stop = nextStop;
            } finally { refreshing = false; }
        };
        refresh();
        const timer = setInterval(refresh, 4000);
        return () => { disposed = true; clearInterval(timer); stop?.(); };
    }, []);


    // 2. Apply Filters & Sorting
    useEffect(() => {
        let result = [...allParticipants];

        if (selectedJourney) {
            result = result.filter(item => item.trip === selectedJourney);
        }

        if (searchQuery) {
            result = result.filter(item =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.trip.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        if (sortOption === 'A-Z') {
            result.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortOption === 'Z-A') {
            result.sort((a, b) => b.name.localeCompare(a.name));
        } else if (sortOption === 'Journey') {
            result.sort((a, b) => a.trip.localeCompare(b.trip));
        } else if (sortOption === 'Likes') {
            result.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        }

        setFilteredData(result);
    }, [allParticipants, searchQuery, sortOption, selectedJourney]);

    const handleDeleteParticipant = async (participant) => {
        if (!participant) return;
        try {
            const removeParticipant = httpsCallable(functions, 'removeParticipantFromTrip');
            await removeParticipant({
                tripId: participant.tripId,
                targetUid: participant.id
            });
            // Update local state immediately for better UX
            setAllParticipants(prev => prev.filter(p => p.id !== participant.id));
            setIsDetailsVisible(false);
        } catch (err) {
            alert("Failed to delete participant. Please check your permissions.");
        }
    };

    useEffect(() => {
        if (Platform.OS === 'android') {
            NavigationBar.setButtonStyleAsync('light');
        }
    }, []);

    const renderParticipantItem = ({ item }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => handleParticipantPress(item)}
            activeOpacity={0.7}
        >
            <Image source={{ uri: item.image }} style={styles.avatar} />
            <View style={styles.cardContent}>
                <Text style={styles.nameText}>{item.name}</Text>
                <Text style={styles.tripText}>{item.trip}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
                <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} translucent />


                <FilterModal
                    visible={filterVisible}
                    onClose={() => setFilterVisible(false)}
                    sortOption={sortOption}
                    setSortOption={setSortOption}
                    selectedJourney={selectedJourney}
                    setSelectedJourney={setSelectedJourney}
                    allParticipants={allParticipants}
                />

                <ParticipantDetailsModal
                    visible={isDetailsVisible}
                    onClose={() => setIsDetailsVisible(false)}
                    participant={selectedParticipant}
                    onDelete={handleDeleteParticipant}
                    isDecrypting={isDecrypting}
                />

                <LanguageModal
                    visible={languageVisible}
                    onClose={() => setLanguageVisible(false)}
                    onSelect={changeLanguage}
                    selectedLanguage={language}
                />

                <View style={styles.contentContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.titleText}>{t('participants')}</Text>
                            <Text style={styles.subtitleText}>{t('tagline')}</Text>
                        </View>
                        <View style={styles.headerIcons}>
                            <TouchableOpacity
                                style={styles.iconButton}
                                onPress={() => setLanguageVisible(true)}
                            >
                                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                    <Path fillRule="evenodd" clipRule="evenodd" d="M12.65 15.67C12.79 15.31 12.7 14.9 12.42 14.62L10.33 12.56L10.36 12.53C12.1 10.59 13.34 8.36 14.07 6H16.01C16.55 6 17 5.55 17 5.01V4.99C17 4.45 16.55 4 16.01 4H10V3C10 2.45 9.55 2 9 2C8.45 2 8 2.45 8 3V4H1.99C1.45 4 1 4.45 1 4.99C1 5.54 1.45 5.98 1.99 5.98H12.17C11.5 7.92 10.44 9.75 9 11.35C8.19 10.46 7.51 9.49 6.94 8.47C6.78 8.18 6.49 8 6.16 8C5.47 8 5.03 8.75 5.37 9.35C6 10.48 6.77 11.56 7.67 12.56L3.3 16.87C2.9 17.26 2.9 17.9 3.3 18.29C3.69 18.68 4.32 18.68 4.72 18.29L9 14L11.02 16.02C11.53 16.53 12.4 16.34 12.65 15.67ZM17.5 10C16.9 10 16.36 10.37 16.15 10.94L12.48 20.74C12.24 21.35 12.7 22 13.35 22C13.74 22 14.09 21.76 14.23 21.39L15.12 19H19.87L20.77 21.39C20.91 21.75 21.26 22 21.65 22C22.3 22 22.76 21.35 22.53 20.74L18.86 10.94C18.64 10.37 18.1 10 17.5 10ZM15.88 17L17.5 12.67L19.12 17H15.88Z" fill="#B99A4A" />
                                </Svg>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.iconButton}
                                onPress={() => navigation.navigate('Notifications')}
                            >
                                <Svg width="17" height="22" viewBox="0 0 17 22" fill="none">
                                    <Path d="M1.81569 15.4283C2.75835 14.0112 2.67638 12.5727 2.67638 10.9531C2.67638 9.59993 2.58416 8.2041 2.70712 6.85089C2.98377 3.96334 5.17648 1.5233 8.01472 1.34217C10.6993 1.17168 13.1789 3.27075 13.9781 5.85996C14.4289 7.33037 14.2957 8.94996 14.2957 10.4737C14.2957 11.8908 14.0908 13.553 14.7056 14.8636C14.972 15.4176 15.597 16.0463 15.2076 16.7282C15.0642 16.9733 14.8593 17.0372 14.6134 17.0586C14.2855 17.1012 13.9269 17.0586 13.599 17.0586H2.77884C2.00012 17.0586 1.32386 16.2488 1.82593 15.4283C2.40997 14.4907 0.842288 14.1817 0.411942 14.8849C-0.305301 16.0357 -0.110623 17.538 1.19066 18.1454C1.69273 18.3798 2.20505 18.3691 2.73786 18.3691H12.3797C13.4248 18.3691 14.7466 18.5716 15.7097 18.0708C16.9598 17.4315 17.3594 15.993 16.6524 14.757C16.1708 13.9259 16.0171 13.1588 16.0171 12.2211C16.0171 10.7613 16.0274 9.30158 16.0171 7.84182C15.9864 4.73051 14.347 1.97082 11.6009 0.681543C8.85492 -0.607734 5.6888 -0.01104 3.51658 1.99213C2.28702 3.12158 1.43657 4.61331 1.11894 6.28617C0.954996 7.12793 0.985734 7.99099 0.985734 8.85406V11.976C0.985734 13.0096 1.01648 13.9792 0.411942 14.8742C-0.192592 15.7693 1.37509 16.0996 1.82593 15.4177L1.81569 15.4283Z" fill="#B99A4A" />
                                    <Path d="M4.37743 18.0068C4.39792 19.701 5.40206 21.214 6.9595 21.7681C8.60916 22.3435 10.4945 21.8214 11.6421 20.4682C12.2364 19.7649 12.5847 18.8379 12.595 17.9003C12.6052 16.9626 10.8941 17.1864 10.8838 18.0175C10.8736 18.806 10.6174 19.5092 10.1051 20.042C10.1769 19.9674 10.0027 20.1379 10.0027 20.1379C9.93094 20.2018 9.84897 20.2657 9.767 20.319C9.71576 20.351 9.71576 20.351 9.767 20.319C9.71576 20.351 9.66454 20.3829 9.6133 20.4042C9.54158 20.4469 9.45961 20.4788 9.37764 20.5215C9.27518 20.5641 9.27518 20.5641 9.35715 20.5321C9.31616 20.5428 9.27518 20.5641 9.23419 20.5747C9.13173 20.6067 9.03951 20.628 8.93705 20.6493C9.09074 20.6173 8.82434 20.6493 8.81409 20.66C8.72187 20.66 8.62965 20.6706 8.54768 20.6706C8.68089 20.6706 8.39399 20.66 8.40424 20.66C8.31202 20.66 8.23005 20.6387 8.13783 20.6174C8.00463 20.5854 8.11734 20.6174 7.99438 20.5854C7.88167 20.5534 7.77921 20.5108 7.6665 20.4575C7.42059 20.351 7.12345 20.1379 6.90827 19.9248C6.38571 19.4027 6.07832 18.6461 6.06807 17.9003C6.06807 17.4634 5.66847 17.261 5.27911 17.2823C4.94098 17.3036 4.35693 17.57 4.35693 18.0175L4.37743 18.0068Z" fill="#B99A4A" />
                                </Svg>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.iconButton}
                                onPress={() => navigation.navigate('Settings')}
                            >
                                <Svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <Path d="M8.85996 3.04039C9.65577 1.75015 11.9743 2.13795 13.2262 2.13805C14.3907 2.13805 16.5943 1.73048 16.7496 3.38024C16.8078 4.00133 16.9049 5.00124 16.7496 5.60289C16.6619 5.93274 15.8764 6.35916 16.4967 6.02965C16.8363 5.84527 17.1668 5.6417 17.5064 5.44762C18.7971 4.70042 20.2328 4.10823 21.1353 5.67027L23.1812 9.2152C23.1976 9.23494 23.2122 9.25618 23.2223 9.28063C23.5812 10.1636 23.0185 10.7267 22.3102 11.1537C21.9706 11.3574 20.487 11.9778 20.4664 12.2982C20.4373 12.7252 21.9703 13.3374 22.2711 13.5121C22.9309 13.9002 23.5621 14.3564 23.2613 15.2201C23.0866 15.7342 22.7079 16.2095 22.4459 16.6752C21.7763 17.83 21.1354 19.7423 19.7477 20.1693C18.9036 20.4214 18.3017 20.1881 17.5934 19.7806L16.7945 19.3158C16.7784 19.534 16.7496 19.7545 16.7496 19.8588C16.7496 20.2468 16.7593 20.6348 16.7496 21.0228C16.7205 21.9059 16.1865 22.4491 15.3326 22.682C14.7795 22.8373 14.1679 22.7796 13.5953 22.7796H10.9361C10.3927 22.7797 9.7231 22.8569 9.24765 22.5658C8.51043 22.1097 8.66556 21.2269 8.66562 20.4798C8.66562 20.1208 8.57828 19.6545 8.66562 19.3148C8.74338 19.0043 9.47084 18.6065 8.97617 18.849C8.32599 19.1595 7.7436 19.5962 7.10312 19.9261C6.24917 20.3628 5.12364 20.5084 4.50254 19.6449C4.20177 19.2374 3.96865 18.7426 3.7164 18.2963L2.43515 16.0736C2.0859 15.4818 1.8726 14.8803 2.40586 14.2884C2.84256 13.7935 3.61937 13.4827 4.18222 13.1625C4.37632 13.046 4.93912 12.8224 4.94882 12.638C4.9583 12.3567 4.43401 12.1628 4.25937 12.0658C3.69669 11.736 2.99836 11.4545 2.50351 11.0277C1.86302 10.4842 2.07609 9.80405 2.43515 9.18297C3.1241 7.9797 3.74584 6.67969 4.53183 5.55406C5.66974 3.93249 7.32011 4.8586 8.6207 5.61363C8.63513 5.40213 8.66562 5.18611 8.66562 5.06871C8.66561 4.45733 8.52031 3.58383 8.85996 3.04039ZM14.5953 3.00133C14.081 2.85576 13.3233 3.00133 12.7799 3.00133H10.5289C10.4708 3.00133 10.248 2.96286 10.2086 3.00133C10.0728 3.11776 10.2954 2.98236 10.2955 3.19566C10.2858 3.43816 10.2672 3.68079 10.2672 3.93297C10.2672 4.54426 10.3448 5.20448 10.2672 5.81578C10.1604 6.62125 9.18923 7.02891 8.44199 6.91246C7.85987 6.82498 7.27762 6.34026 6.78281 6.04918C6.63724 5.96184 6.16159 5.56395 5.98691 5.58336C6.0063 5.57366 6.04548 5.61238 5.93906 5.69957C5.51206 6.08775 5.21072 6.95171 4.92929 7.44664C4.57996 8.04824 4.17247 8.64992 3.87168 9.28063C3.56118 9.9599 3.84228 10.3776 4.44394 10.7269C5.28822 11.2121 7.51046 12.0755 5.93906 13.1234C5.36655 13.5018 4.74485 13.7442 4.15293 14.1517C3.56095 14.5593 3.69694 15.0546 4.01718 15.6078C4.67706 16.7528 5.54093 17.9075 6.05527 19.1302C6.21054 19.499 6.04563 19.5086 6.37558 19.4213C6.66664 19.3435 7.01602 19.053 7.27793 18.8978C7.83099 18.5776 8.41301 18.1503 9.06308 18.0629C10.8582 17.83 10.151 20.0518 10.2672 21.1097C10.3642 21.9831 10.8204 21.9642 11.5094 21.9642H14.8961C14.9546 21.9643 15.1192 21.9933 15.1773 21.9642C15.381 21.8479 15.1285 22.0125 15.1285 21.7699C15.1576 21.1198 15.1578 20.4407 15.1578 19.8197C15.1578 19.1986 15.0702 18.7128 15.7203 18.3343C16.3704 17.9559 17.0114 17.9948 17.6324 18.3343C18.0011 18.5381 18.3701 18.7517 18.7291 18.9652C18.8745 19.0428 19.2718 19.3727 19.4273 19.3636C19.505 19.3539 19.3502 19.3921 19.5055 19.2562C19.6703 19.1008 19.7963 18.7422 19.9127 18.5482L21.1168 16.4525C21.3982 15.9576 21.9504 15.3365 21.6305 14.7543C21.1841 13.9391 18.6711 13.6085 18.9137 12.4828C19.1908 11.2132 22.1983 11.3249 21.6578 9.78551C21.6403 9.76767 21.6237 9.74885 21.6109 9.72691L20.9029 8.50426L19.7096 6.43688C19.6028 6.2428 19.4571 6.04886 19.3697 5.84508C19.2145 5.47634 19.3793 5.46675 19.0494 5.55406C18.1275 5.78697 16.2835 7.83444 15.3131 6.61168C14.663 5.7965 15.8856 3.3606 14.5953 3.00133ZM9.26718 10.055C10.4608 8.6673 12.538 8.02734 14.2945 8.5902C15.8956 9.10458 17.0602 10.521 17.0797 12.2289C17.0797 12.2489 17.0771 12.2684 17.0748 12.2875C17.0774 12.3057 17.0797 12.3248 17.0797 12.3451C17.0506 14.3733 15.4201 15.9745 13.4986 16.3724C11.7811 16.7315 9.86961 16.1885 8.90879 14.6361C8.02569 13.1998 8.1706 11.3457 9.26718 10.055ZM13.0816 9.41441C11.9463 9.133 10.9752 9.58914 10.3541 10.6371C9.6748 11.7822 9.79196 13.3155 10.6168 14.3539C11.005 14.8391 11.5092 15.2184 12.1012 15.4222C12.3922 15.5192 12.7028 15.5677 13.0035 15.5677C13.1297 15.5677 13.2563 15.5578 13.3922 15.5287C13.3243 15.5384 13.6731 15.4507 13.6148 15.4701C14.7813 15.0685 15.4375 13.8193 15.4752 12.6039C15.435 11.1667 14.5293 9.77886 13.0816 9.41441Z" fill="#B99A4A"/>
                                </Svg>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Search Bar */}
                    <View style={styles.searchSectionWrapper}>
                        <View style={styles.searchContainer}>
                            <Ionicons name="search" size={20} color="#A1A1AA" style={styles.searchIcon} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder={t('search_placeholder')}
                                placeholderTextColor="#A1A1AA"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                        </View>
                        <TouchableOpacity
                            style={styles.filterButton}
                            onPress={() => setFilterVisible(true)}
                        >
                             <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <G clipPath="url(#clip0_2246_3877)">
                                    <Path d="M10 18H14V16H10V18ZM3 6V8H21V6H3ZM6 13H18V11H6V13Z" fill="white"/>
                                </G>
                                <Defs>
                                    <ClipPath id="clip0_2246_3877">
                                        <Rect width="24" height="24" fill="white"/>
                                    </ClipPath>
                                </Defs>
                            </Svg>
                        </TouchableOpacity>
                    </View>

                    {/* Participant List */}
                    <FlatList
                        data={filteredData}
                        renderItem={renderParticipantItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={[
                            styles.listContent,
                            { paddingBottom: 100 + insets.bottom },
                            filteredData.length === 0 && { flexGrow: 1, justifyContent: 'center' }
                        ]}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={renderEmptyComponent}
                    />
                </View>

                {/* Bottom Navigation */}
                <CustomBottomTabBar state="Participants" navigation={navigation} />
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    contentContainer: {
        flex: 1,
        paddingHorizontal: 20,
        marginTop: 20,
        paddingTop: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    titleText: {
        fontSize: 28,
        color: '#FFF',
        fontFamily: Typography.serif.regular,
    },
    subtitleText: {
        fontSize: 14,
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
        marginTop: 4,
    },
    headerIcons: {
        flexDirection: 'row',
        gap: 15,
        marginTop: 5,
    },
    iconButton: {
        padding: 0,
    },
    searchSectionWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    searchContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#23272A',
        borderRadius: 14,
        paddingHorizontal: 15,
        height: 52,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
        paddingVertical: 10,
    },
    filterButton: {
        width: 52,
        height: 52,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    filterIcon: {
        width: 24,
        height: 24,
        tintColor: '#FFF',
        resizeMode: 'contain',
    },
    listContent: {
        // Space handled dynamically
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 22,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255, 255, 255, 0.5)',
        paddingHorizontal: 16,
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 15,
        backgroundColor: '#333',
    },
    cardContent: {
        flex: 1,
        marginLeft: 15,
        justifyContent: 'center',
    },
    nameText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
        marginBottom: 4,
    },
    tripText: {
        color: '#A1A1AA',
        fontSize: 15,
        letterSpacing: 0.2,
        fontFamily: Typography.sans.regular,
    },
    separator: {
        height: 1,
        backgroundColor: '#23272A',
        marginVertical: 4,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.75)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '90%',
        backgroundColor: '#23272A',
        borderRadius: 20,
        padding: 20,
        elevation: 10,
    },
    participantsModalContent: {
        paddingTop: 10,
    },
    modalDragIndicator: {
        width: 40,
        height: 4,
        backgroundColor: '#383B42',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    modalLabel: {
        fontSize: 16,
        color: '#FFF',
        marginBottom: 12,
        marginTop: 10,
        fontWeight: '500',
    },
    journeyInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1E21', // Darker background for input
        borderRadius: 16,
        padding: 16,
        paddingHorizontal: 20,
        gap: 12,
        marginBottom: 24,
    },
    journeyInputText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '500',
    },
    journeyDropdown: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        backgroundColor: '#1A1E21',
        borderRadius: 16,
        maxHeight: 200,
        zIndex: 2000,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        overflow: 'hidden',
    },
    dropdownScroll: {
        width: '100%',
    },
    dropdownItem: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        // borderBottomWidth: 1,
        // borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    dropdownText: {
        color: '#FFF',
        fontSize: 14,
    },
    chipsContainer: {
        gap: 12,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    chip: {
        flex: 1,
        backgroundColor: '#1A1E21',
        borderRadius: 16,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
        overflow: 'hidden',
    },
    chipInnerSelected: {
        flex: 1,
        margin: 1.5,
        borderRadius: 14.5, // slightly less than 16 to account for margin
        backgroundColor: '#1A1E21',
        justifyContent: 'center',
        alignItems: 'center',
    },
    chipFullWidth: {
        width: '100%',
        flex: 0,
    },
    chipText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '500',
    },
    chipTextSelected: {
        color: '#FFF',
        fontWeight: 'bold',
    },

    // Bottom Nav Styles

    bottomNavWrapper: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 70,
        justifyContent: 'flex-end',
    },
    svgContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    navItemsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 30,
        height: 52,
        marginBottom: 6,
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 80,
    },
    navText: {
        fontSize: 10,
        marginTop: 4,
        color: Colors.dark.textSecondary,
    },
    fabPlaceholder: {
        width: 70,
    },
    fabContainer: {
        position: 'absolute',
        bottom: 22,
        alignSelf: 'center',
        shadowColor: 'rgba(212, 175, 55, 0.5)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 8,
    },
    fab: {
        width: 70,
        height: 70,
        borderRadius: 35,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Language Modal Styles
    languageItem: {
        paddingVertical: 7,
        paddingHorizontal: 20,
    },
    languageItemText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    languageItemTextSelected: {
        color: '#B99A4A',
        fontWeight: 'bold',
    },
    languageModalOverlay: {
        flex: 1,
        justifyContent: 'flex-start',
        paddingTop: 90,
        alignItems: 'flex-end',
        paddingRight: 30,
    },
    languageModalContent: {
        backgroundColor: '#23272A',
        borderRadius: 12,
        width: 180,
        maxHeight: 400,
        paddingVertical: 8,
        elevation: 5,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
        paddingBottom: 60,
    },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#1E2328',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#B99A4A',
    },
    emptyTitle: {
        fontSize: 20,
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        textAlign: 'center',
        marginBottom: 10,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
        textAlign: 'center',
        lineHeight: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default ParticipantsScreen;
