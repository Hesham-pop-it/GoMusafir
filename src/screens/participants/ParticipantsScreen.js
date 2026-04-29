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
} from 'react-native';
import Modal from 'react-native-modal';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../constants/Colors';
import CustomBottomTabBar from '../../components/CustomBottomTabBar';
import * as NavigationBar from 'expo-navigation-bar';
import ParticipantDetailsModal from '../../components/ParticipantDetailsModal';
import { Typography } from '../../constants/Typography';
import { auth, database, functions } from '../../config/firebase';
import { ref, onValue, get } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { useLanguage } from '../../context/LanguageContext';

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
    const [allParticipants, setAllParticipants] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [isDetailsVisible, setIsDetailsVisible] = useState(false);
    const [isDecrypting, setIsDecrypting] = useState(false);

    const handleParticipantPress = async (participant) => {
        setIsDecrypting(true);
        setSelectedParticipant(participant);
        setIsDetailsVisible(true);
        
        try {
            const getProfile = httpsCallable(functions, 'getParticipantProfile');
            const result = await getProfile({
                targetUid: participant.id,
                tripId: participant.tripId
            });
            
            if (result.data) {
                setSelectedParticipant(prev => {
                    const newData = { ...prev };
                    
                    // Only update if the decrypted result is actually plaintext (no dots)
                    // and not the same as what we already have
                    if (result.data.email && !result.data.email.includes('.')) {
                        newData.email = result.data.email;
                    }
                    if (result.data.phone && !result.data.phone.includes('.')) {
                        newData.phone = result.data.phone;
                    }
                    if (result.data.fullName && !result.data.fullName.includes('*')) {
                        newData.name = result.data.fullName;
                    }
                    
                    return newData;
                });
            }
        } catch (error) {
            // Fallback to already loaded (possibly hashed) data is already handled by state
        } finally {
            setIsDecrypting(false);
        }
    };

    // 1. Fetch Live Data from Firebase
    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        const fetchAllParticipants = async () => {
            try {
                // Get User's Org ID from Token
                const tokenResult = await user.getIdTokenResult();
                let orgId = tokenResult.claims.orgId;
                
                // Fallback: Get from profile if token claim isn't present
                if (!orgId) {
                    const profileSnap = await get(ref(database, `users/${user.uid}`));
                    if (profileSnap.exists()) {
                        orgId = profileSnap.val().staff_org_id || profileSnap.val().org_id;
                    }
                }

                if (!orgId) {
                    return;
                }

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
                                        // Fetch Profile
                                        try {
                                            const uSnap = await get(ref(database, `users/${pUid}`));
                                            if (uSnap.exists()) {
                                                const profileData = uSnap.val();
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

                                                participantsMap.set(pUid, {
                                                    id: pUid,
                                                    tripId: tripId,
                                                    name: profileData.full_name || profileData.name || (profile.firstName ? `${profile.firstName} ${profile.lastName || ""}`.trim() : "Guest"),
                                                    trip: tripName,
                                                    image: profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(profileData.full_name || "Guest")}&background=B99A4A&color=fff`,
                                                    email: profile.email || profileData.email || profileData.p_email || 'N/A',
                                                    phone: profile.phone || profileData.p_phone || profileData.phone || profileData.phone_number || 'N/A',
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
                        setAllParticipants(Array.from(participantsMap.values()));
                    } else {
                    }
                }, (error) => {
                });

                return () => unsubscribeTrips();
            } catch (err) {
            }
        };

        fetchAllParticipants();
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
            setDetailsVisible(false);
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
                                <Ionicons name="settings-outline" size={24} color={Colors.dark.primary} />
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
                            <Image
                                source={require('../../../assets/filter_icon.png')}
                                style={styles.filterIcon}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Participant List */}
                    <FlatList
                        data={filteredData}
                        renderItem={renderParticipantItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }]}
                        showsVerticalScrollIndicator={false}
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
        padding: 4,
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
        borderRadius: 14,
        borderWidth: 1.5,
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
        borderBottomColor: 'rgba(255, 255, 255, 0.15)',
        paddingHorizontal: 16,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 10,
        backgroundColor: '#333',
    },
    cardContent: {
        flex: 1,
        marginLeft: 15,
        justifyContent: 'center',
    },
    nameText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    tripText: {
        color: '#9BA1A6',
        fontSize: 14,
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
});

export default ParticipantsScreen;
