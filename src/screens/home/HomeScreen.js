import React, { useState, useEffect, useRef } from 'react';
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
    TouchableWithoutFeedback,
    ScrollView,
    KeyboardAvoidingView,
    PanResponder,
    Animated,
    Dimensions
} from 'react-native';
import Svg, { Path, G, Defs, ClipPath, Rect } from 'react-native-svg';
import Modal from 'react-native-modal';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome, MaterialIcons, Feather } from '@expo/vector-icons';
import GradientBorderButton from '../../components/GradientBorderButton';
import CustomBottomTabBar from '../../components/CustomBottomTabBar';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import * as NavigationBar from 'expo-navigation-bar';
import { useLanguage } from '../../context/LanguageContext';
import { database, auth } from '../../config/firebase';
import { ref, onValue, get } from 'firebase/database';

const TRIPS_DATA = [
    {
        id: '1',
        title: 'Madinah Trip',
        date: '02/10/25 - 05/10/25',
        location: 'Madinah',
        participants: 45,
    },
    {
        id: '9',
        title: 'Madinah Trip',
        date: '02/10/25 - 05/10/25',
        location: 'Madinah',
        participants: 45,
    },
    {
        id: '8',
        title: 'Madinah Trip',
        date: '02/10/25 - 05/10/25',
        location: 'Madinah',
        participants: 45,
    },
    {
        id: '2',
        title: 'Umrah Trip',
        date: '01/10/25 - 05/10/25',
        location: 'Makkah',
        participants: 90,
    },
    {
        id: '3',
        title: 'Umrah Trip',
        date: '01/10/25 - 05/10/25',
        location: 'Makkah',
        participants: 90,
    },
    {
        id: '4',
        title: 'Umrah Trip',
        date: '01/10/25 - 05/10/25',
        location: 'Makkah',
        participants: 90,
    },
];

// Redundant TabBarBackground removed

const destinations = ['Makkah', 'Madinah', 'Jeddah', 'Riyadh', 'Dammam', 'Abha', 'Tabuk', 'Jubail', 'Yanbu', 'Hafr Al Batin'];
const sortOptions = [
    'A-Z',
    'Z-A',
    'Newest',
    'Oldest',
    'Most participants',
    'Fewest Participants',
    'Likes'
];

const FilterModal = ({ visible, onClose, sortOption, setSortOption, startDate, setStartDate, endDate, setEndDate, destination, setDestination, participants, setParticipants, allTrips }) => {
    const { t, isRTL } = useLanguage();
    const [activeDateInput, setActiveDateInput] = useState(null);

    const [showCalendar, setShowCalendar] = useState(false);
    const [showDestinations, setShowDestinations] = useState(false);

    // Compute dynamic destinations from allTrips
    const destinations = Array.from(new Set(allTrips.map(trip => trip.location))).filter(Boolean);

    const onDateSelect = (day) => {
        if (activeDateInput === 'start') setStartDate(day.dateString);
        if (activeDateInput === 'end') setEndDate(day.dateString);
        setShowCalendar(false);
    };

    const clearFilters = () => {
        setStartDate('');
        setEndDate('');
        setDestination('');
        setParticipants('');
        setSortOption('Newest');
        onClose();
    };


    return (
        <Modal
            isVisible={visible}
            onBackdropPress={onClose}
            backdropOpacity={0.6}
            style={{ margin: 20, justifyContent: 'center' }}
            useNativeDriver={true}
            hideModalContentWhileAnimating={true}
            avoidKeyboard={true}
            animationIn="zoomIn"
            animationOut="zoomOut"
        >
            <View style={styles.filterModalContainer}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 10 }}
                >
                    <TouchableWithoutFeedback onPress={() => {
                        setShowCalendar(false);
                        setShowDestinations(false);
                    }}>
                        <View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Filters</Text>
                                <TouchableOpacity onPress={clearFilters}>
                                    <Text style={{ color: '#B99A4A', fontWeight: '600' }}>Clear All</Text>
                                </TouchableOpacity>
                            </View>
                            {/* Dates */}
                            <View style={[styles.filterRow, { zIndex: 1100 }]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('start_date')}</Text>
                                    <TouchableOpacity
                                        style={styles.filterInput}
                                        onPress={() => {
                                            setActiveDateInput('start');
                                            setShowCalendar(!showCalendar);
                                            setShowDestinations(false);
                                        }}
                                    >
                                        <Feather name="calendar" size={18} color="#A1A1AA" />
                                        <Text style={styles.filterInputText}>
                                            {startDate || t('start_date')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={{ width: 12 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('end_date')}</Text>
                                    <TouchableOpacity
                                        style={styles.filterInput}
                                        onPress={() => {
                                            setActiveDateInput('end');
                                            setShowCalendar(!showCalendar);
                                            setShowDestinations(false);
                                        }}
                                    >
                                        <Feather name="calendar" size={18} color="#A1A1AA" />
                                        <Text style={styles.filterInputText}>
                                            {endDate || t('end_date')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {showCalendar && (
                                    <View style={styles.calendarBox}>
                                        <Calendar
                                            onDayPress={onDateSelect}
                                            theme={{
                                                backgroundColor: '#1C2226',
                                                calendarBackground: '#1C2226',
                                                dayTextColor: '#fff',
                                                monthTextColor: '#fff',
                                                arrowColor: '#E6C27A',
                                                selectedDayBackgroundColor: '#E6C27A',
                                                selectedDayTextColor: '#000'
                                            }}
                                        />
                                    </View>
                                )}
                            </View>


                            {/* Destination */}
                            <View style={[styles.filterSectionContainer, { zIndex: showDestinations ? 1000 : 10, elevation: showDestinations ? 1000 : 0 }]}>
                                <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('destination')}</Text>
                                <TouchableOpacity
                                    style={styles.filterInput}
                                    onPress={() => {
                                        setShowDestinations(!showDestinations);
                                        setShowCalendar(false);
                                    }}
                                >
                                    <Ionicons name="location-outline" size={20} color="#A1A1AA" />
                                    <Text style={[styles.filterInputText, { color: '#fff' }]}>{destination || 'Makkah'}</Text>
                                </TouchableOpacity>

                                {showDestinations && (
                                    <View style={styles.filterDropdown}>
                                        <ScrollView
                                            style={[styles.dropdownScroll, { maxHeight: 250 }]}
                                            nestedScrollEnabled={true}
                                            showsVerticalScrollIndicator={true}
                                            keyboardShouldPersistTaps="handled"
                                        >
                                            <TouchableOpacity
                                                style={styles.filterDropdownItem}
                                                onPress={() => {
                                                    setDestination('');
                                                    setShowDestinations(false);
                                                }}
                                            >
                                                <Text style={styles.filterDropdownText}>All Destinations</Text>
                                            </TouchableOpacity>
                                            {destinations.map(item => (
                                                <TouchableOpacity
                                                    key={item}
                                                    style={styles.filterDropdownItem}
                                                    onPress={() => {
                                                        setDestination(item);
                                                        setShowDestinations(false);
                                                    }}
                                                >
                                                    <Text style={styles.filterDropdownText}>{item}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>

                            {/* Participants */}
                            <View style={styles.filterSectionContainer}>
                                <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('total_participants')}</Text>
                                <View style={styles.filterInput}>
                                    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                        <Path d="M11.9831 15.1797C13.66 15.1797 15.2155 15.5431 16.1658 17.0615C16.9576 18.3191 16.7342 19.9307 16.7341 21.3467C16.7341 21.8218 15.2068 22.055 15.2068 21.7568C15.2068 20.3409 15.4673 18.7759 14.6384 17.4717C13.8093 16.1674 12.4954 15.8594 11.0701 15.8594H7.02709C6.66376 15.8594 6.28105 15.8319 5.91772 15.8691C4.94914 15.9532 4.19511 16.8194 3.83178 17.667C3.35669 18.7755 3.54269 20.145 3.54272 21.3281C3.54272 21.8033 2.0144 22.0364 2.0144 21.7383C2.01439 20.0521 1.80947 18.2444 2.94604 16.8936C4.08262 15.5428 5.81602 15.1797 7.49291 15.1797H11.9831ZM18.1599 15.1797C18.9797 15.189 19.8001 15.4219 20.4802 15.8877C21.5514 16.605 22.1657 17.8254 22.1658 19.1016V21.3379C22.1654 21.8127 20.6397 22.0455 20.6384 21.748V20.415C20.6384 19.9307 20.6665 19.4277 20.6013 18.9434C20.3684 17.2293 18.9243 15.8694 17.1824 15.8506C16.8656 15.8506 16.8562 15.6271 17.0798 15.4688C17.3872 15.2546 17.7874 15.1797 18.1599 15.1797ZM15.1033 2C16.3329 2.01863 17.5163 2.41914 18.4665 3.21094C20.0875 4.56177 20.6184 6.90945 19.78 8.83789C18.8764 10.9153 16.7154 12.0803 14.5076 12.1084C14.2375 12.1177 13.9204 11.9498 14.0876 11.6426C14.2646 11.3258 14.7591 11.2227 15.0945 11.2227C17.2557 11.1945 18.737 9.04257 18.6345 7.01172C18.5318 4.81337 16.7432 2.93144 14.5076 2.90332L14.5164 2.88477C14.2462 2.88468 13.9204 2.7263 14.0974 2.41895C14.2745 2.11177 14.7773 2.00005 15.1033 2ZM5.19994 3.99219C6.64396 2.31553 9.14046 1.57104 11.2644 2.25098C13.286 2.89378 14.7207 4.71921 14.7488 6.85254C14.7489 6.86168 14.7474 6.87088 14.7468 6.87988C14.7532 6.90619 14.7585 6.93438 14.7585 6.96484C14.7211 9.47063 12.7648 11.4827 10.3708 11.9766C8.23742 12.4144 5.86087 11.5852 4.74291 9.76855C3.62519 7.95194 3.75602 5.66901 5.19994 3.99219ZM10.0349 3.01465C8.45116 2.61408 6.96072 3.34093 6.13158 4.71973C5.22811 6.22887 5.37673 8.23163 6.46655 9.61035C7.42605 10.8307 9.12183 11.5855 10.6589 11.0547C12.2891 10.4958 13.1929 8.80019 13.2117 7.15137H13.2156C13.1429 5.26405 11.9262 3.48976 10.0349 3.01465Z" fill={"#A1A1AA"} />
                                    </Svg>
                                    <TextInput
                                        style={styles.filterTextInputStyle}
                                        keyboardType="numeric"
                                        value={participants}
                                        onChangeText={setParticipants}
                                        placeholderTextColor="#636D77"
                                        placeholder={participants || '90'}
                                        onFocus={() => {
                                            setShowCalendar(false);
                                            setShowDestinations(false);
                                        }}
                                    />
                                </View>
                            </View>

                            {/* Sort */}
                            <View style={styles.filterSectionContainer}>
                                <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('sort_by')}</Text>
                                <View style={styles.filterGrid}>
                                    {sortOptions.map(opt => {

                                        const isActive = sortOption === opt;
                                        const translationMap = {
                                            'A-Z': 'az',
                                            'Z-A': 'za',
                                            'Newest': 'newest',
                                            'Oldest': 'oldest'
                                        };
                                        const label = translationMap[opt] ? t(translationMap[opt]) : opt;

                                        if (isActive) {
                                            return (
                                                <GradientBorderButton
                                                    key={opt}
                                                    onPress={() => {
                                                        setSortOption(opt);
                                                        setShowCalendar(false);
                                                        setShowDestinations(false);
                                                    }}
                                                    borderRadius={16}
                                                    colors={['#B99A4A', '#1C2226']}
                                                    style={{
                                                        width: '50%',
                                                        marginBottom: 10
                                                    }}
                                                    innerStyle={{
                                                        height: 50,
                                                        paddingHorizontal: 14,
                                                        paddingVertical: 14
                                                    }}
                                                // innerBg="transparent"
                                                >
                                                    <Text style={[
                                                        styles.filterChipText,
                                                        {
                                                            color: '#FFF',
                                                            fontFamily: Typography.sans.regular
                                                        }
                                                    ]}>
                                                        {label}
                                                    </Text>
                                                </GradientBorderButton>
                                            );
                                        }

                                        return (
                                            <TouchableOpacity
                                                key={opt}
                                                style={styles.filterChip}
                                                onPress={() => {
                                                    setSortOption(opt);
                                                    setShowCalendar(false);
                                                    setShowDestinations(false);
                                                }}
                                            >
                                                <View style={styles.filterChipInner}>
                                                    <Text style={styles.filterChipText}>
                                                        {label}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </ScrollView>
            </View>
        </Modal>
    );
};




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
            backdropOpacity={0.3}
            animationIn="fadeIn"
            animationOut="fadeOut"
            style={styles.languageModalOverlay}
            useNativeDriver={true}
            hideModalContentWhileAnimating={true}
        >
            <View style={styles.languageModalContent}>
                <FlatList
                    data={LANGUAGES}
                    renderItem={renderLanguageItem}
                    keyExtractor={item => item.code}
                    showsVerticalScrollIndicator={false}
                />
            </View>
        </Modal>
    );
};

const HomeScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { t, language, changeLanguage, isRTL } = useLanguage();
    const [filterVisible, setFilterVisible] = useState(false);
    const [languageVisible, setLanguageVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOption, setSortOption] = useState('Newest');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [destination, setDestination] = useState('');
    const [participants, setParticipants] = useState('');

    const [allTrips, setAllTrips] = useState([]); // Raw source of truth
    const [filteredData, setFilteredData] = useState([]); // Filtered view
    const [participantsCounts, setParticipantsCounts] = useState({});
    const countListeners = useRef({}); // Track listeners by tripId to avoid duplicates and leaks
    const [isLoading, setIsLoading] = useState(true);

    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) {
            setIsLoading(false);
            return;
        }

        // 1. Get user's org context
        const userRef = ref(database, `users/${user.uid}`);
        const unsubscribeUser = onValue(userRef, (snapshot) => {
            const userData = snapshot.val();
            if (!userData) {
                setIsLoading(false);
                return;
            }

            const orgId = userData.staff_org_id;
            setIsAdmin(!!orgId);

            const joinedTrips = userData.joined_trips || {};

            // 2. Fetch Trips
            if (orgId) {
                // Admin/Staff: fetch ALL org trips
                const tripsRef = ref(database, `orgs/${orgId}/trips`);
                onValue(tripsRef, (tripsSnapshot) => {
                    const trips = [];

                    tripsSnapshot.forEach((child) => {
                        const tId = child.key;
                        const tripData = child.val() || {};
                        trips.push({ id: tId, orgId: orgId, ...tripData });

                        // Add participant count listener
                        if (!countListeners.current[tId]) {
                            const pRef = ref(database, `trips_participants/${tId}`);
                            countListeners.current[tId] = onValue(pRef, (pSnap) => {
                                const count = pSnap.exists() ? Object.keys(pSnap.val()).length : 0;
                                setParticipantsCounts(prev => ({ ...prev, [tId]: count }));
                            });
                        }
                    });

                    setAllTrips(trips);
                    setIsLoading(false);
                });
            } else {

                // Participant: fetch ONLY joined trips
                const tripIds = Object.keys(joinedTrips ?? {});
                if (tripIds.length === 0) {
                    setAllTrips([]);
                    setIsLoading(false);
                    return;
                }

                // Fetch each joined trip individually
                Promise.all(tripIds.map(async (tripId) => {
                    const orgId = joinedTrips[tripId].org_id;
                    if (!orgId) return null;

                    try {
                        const tripSnap = await get(ref(database, `orgs/${orgId}/trips/${tripId}`));
                        if (tripSnap.exists()) {
                            // Add participant count listener
                            if (!countListeners.current[tripId]) {
                                const pRef = ref(database, `trips_participants/${tripId}`);
                                countListeners.current[tripId] = onValue(pRef, (pSnap) => {
                                    const count = pSnap.exists() ? Object.keys(pSnap.val()).length : 0;
                                    setParticipantsCounts(prev => ({ ...prev, [tripId]: count }));
                                });
                            }
                            return { id: tripId, ...(tripSnap.val() || {}), orgId: orgId };
                        }
                    } catch (error) {
                    }
                    return null;
                })).then((tripsArray) => {
                    const validTrips = tripsArray.filter(t => t !== null);
                    
                    setAllTrips(validTrips);
                    setIsLoading(false);

                    // Smart redirect for participants to their specific trip
                    if (validTrips.length > 0 && !orgId) {
                        const currentTripId = userData.current_trip;
                        let targetTrip = null;

                        if (currentTripId) {
                            targetTrip = validTrips.find(t => t.id === currentTripId);
                        }

                        // S22: Only auto-redirect if a current trip is anchored or if they have exactly one trip
                        if (targetTrip || validTrips.length === 1) {
                            const finalTrip = targetTrip || validTrips[0];
                            navigation.replace('TripOverview', {
                                trip: finalTrip,
                                isAdmin: false,
                                invitationCode: finalTrip.invitation_code
                            });
                        }
                    }
                });

            }
        });

        return () => {
            unsubscribeUser();
            // Cleanup all count listeners
            Object.values(countListeners?.current ?? {}).forEach(unsub => {
                if (typeof unsub === 'function') unsub();
            });
            if (countListeners.current) countListeners.current = {};
        };
    }, []);

    useEffect(() => {
        // Filter and Sort logic
        if (!allTrips) return;
        let result = [...allTrips];

        if (searchQuery) {
            result = result.filter(item =>
                (item.title && item.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (item.location && item.location.toLowerCase().includes(searchQuery.toLowerCase()))
            );
        }

        if (destination) {
            result = result.filter(item => item.location === destination);
        }

        if (startDate) {
            const filterStart = new Date(startDate).getTime();
            result = result.filter(item => (item.start_date || 0) >= filterStart);
        }

        if (endDate) {
            const filterEnd = new Date(endDate).getTime();
            result = result.filter(item => (item.end_date || 0) <= filterEnd);
        }

        if (participants) {
            result = result.filter(item => {
                const totalSeats = parseInt(item.total_seats) || 15;
                return totalSeats >= parseInt(participants);
            });
        }

        if (sortOption === 'A-Z') {
            result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        } else if (sortOption === 'Z-A') {
            result.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        } else if (sortOption === 'Newest') {
            result.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        } else if (sortOption === 'Oldest') {
            result.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        } else if (sortOption === 'Most participants') {
            result.sort((a, b) => {
                const countA = participantsCounts[a.id] !== undefined ? participantsCounts[a.id] : (a.participants || 0);
                const countB = participantsCounts[b.id] !== undefined ? participantsCounts[b.id] : (b.participants || 0);
                return countB - countA;
            });
        } else if (sortOption === 'Fewest Participants') {
            result.sort((a, b) => {
                const countA = participantsCounts[a.id] !== undefined ? participantsCounts[a.id] : (a.participants || 0);
                const countB = participantsCounts[b.id] !== undefined ? participantsCounts[b.id] : (b.participants || 0);
                return countA - countB;
            });
        } else if (sortOption === 'Likes') {
            result.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        }

        setFilteredData(result);
    }, [searchQuery, sortOption, allTrips, startDate, endDate, destination, participants]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return t('good_morning');
        if (hour < 18) return t('good_afternoon');
        return t('good_evening');
    };

    useEffect(() => {
        if (Platform.OS === 'android') {
            NavigationBar.setButtonStyleAsync('light');
        }
    }, []);


    const renderTripItem = ({ item }) => {
        // Determine image source
        let imageSource;
        if (item.image) {
            // If image exists, check if it's a string (URL) or require object
            imageSource = typeof item.image === 'string' ? { uri: item.image } : item.image;
        } else {
            // Fallback to local images based on location
            imageSource = item.location === 'Madinah'
                ? require('../../../assets/Madinah.png')
                : require('../../../assets/Makkah.png');
        }

        return (
            <TouchableOpacity
                // onPress={() => navigation.navigate('TripOverview', { 
                //     trip: item, 
                //     isAdmin,
                //     tripId: item.id,
                //     orgId: item.orgId
                // })}
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('TripOverview', 
                    {tripId: item.id,
                    orgId: item.orgId, trip: { ...item, image: item.image || imageSource, invitationCode: item?.invitation_code }, isAdmin })}
            >
                <Image
                    source={imageSource}
                    style={styles.cardImage}
                />
                <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>{item.title}</Text>
                        <TouchableOpacity>
                            <Ionicons name="heart-outline" size={24} color={Colors.dark.primary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.cardRow}>
                        <Feather name="calendar" size={14} color={Colors.dark.primary} />
                        <Text style={styles.cardDetailText}>{item.date}</Text>
                    </View>

                    <View style={styles.cardRow}>
                        <Ionicons name="location-outline" size={14} color={Colors.dark.primary} />
                        <Text style={styles.cardDetailText}>{item.location}</Text>
                    </View>

                    <View style={styles.cardRow}>
                        <Ionicons name="person-outline" size={14} color={Colors.dark.primary} />
                        <Text style={styles.cardDetailText}>{participantsCounts[item.id] !== undefined ? participantsCounts[item.id] : (item.participants || 0)}</Text>
                    </View>
                </View>
            </TouchableOpacity>

        );
    };

    return (
        <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
                <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} translucent />

                <FilterModal
                    visible={filterVisible}
                    onClose={() => setFilterVisible(false)}
                    sortOption={sortOption}
                    setSortOption={setSortOption}
                    startDate={startDate}
                    setStartDate={setStartDate}
                    endDate={endDate}
                    setEndDate={setEndDate}
                    destination={destination}
                    setDestination={setDestination}
                    participants={participants}
                    setParticipants={setParticipants}
                    allTrips={allTrips}
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
                            <Text style={styles.greetingText}>{getGreeting()}</Text>
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
                            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={styles.searchIcon}>
                                <G clipPath="url(#search_clip)">
                                    <Path d="M18.031 16.617L22.314 20.899L20.899 22.314L16.617 18.031C15.0237 19.3082 13.042 20.0029 11 20C6.032 20 2 15.968 2 11C2 6.032 6.032 2 11 2C15.968 2 20 6.032 20 11C20.0029 13.042 19.3082 15.0237 18.031 16.617ZM16.025 15.875C17.2941 14.5699 18.0029 12.8204 18 11C18 7.132 14.867 4 11 4C7.132 4 4 7.132 4 11C4 14.867 7.132 18 11 18C12.8204 18.0029 14.5699 17.2941 15.875 16.025L16.025 15.875Z" fill="#A1A1AA" />
                                </G>
                                <Defs>
                                    <ClipPath id="search_clip">
                                        <Rect width="24" height="24" fill="white" />
                                    </ClipPath>
                                </Defs>
                            </Svg>
                             <TextInput
                                style={styles.searchInput}
                                placeholder={t('search_trip')}
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

                    {/* Trip List */}
                    <FlatList
                        data={filteredData}
                        renderItem={renderTripItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }]}
                        showsVerticalScrollIndicator={false}
                    />
                </View>

                {/* Bottom Navigation */}
                <CustomBottomTabBar state="Home" navigation={navigation} />
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
    greetingText: {
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
        fontSize: 13,
        // fontFamily: Typography.sans.bold,
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
        backgroundColor: '#23272A',
        borderRadius: 16,
        marginBottom: 16,
        overflow: 'hidden',
        height: 110,
        alignItems: 'center',
        padding: 10,
    },
    cardImage: {
        width: 145,
        height: '100%',
        borderRadius: 12,
        backgroundColor: '#333',
    },
    cardContent: {
        flex: 1,
        marginLeft: 15,
        justifyContent: 'center',
        gap: 6,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#F4F4F5',
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cardDetailText: {
        fontSize: 12,
        color: '#F4F4F5',
    },

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
        alignItems: 'center', // Center the SVG
    },
    navItemsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 30,
        height: 52,        // ← fixed row height
        marginBottom: 6,   // ← subtle lift
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
        width: 70, // Space for the FAB curve
    },
    fabContainer: {
        position: 'absolute',
        bottom: 22, // Moved up to sit into the curve
        alignSelf: 'center',
        shadowColor: 'rgba(212, 175, 55, 0.5)', // Gold shadow
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
    // Filter Modal Styles
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        padding: 20
    },
    filterModalContainer: {
        backgroundColor: '#1C2226',
        borderRadius: 24,
        padding: 24,
        maxHeight: '90%',
    },
    filterModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    filterModalTitle: {
        color: '#fff',
        fontSize: 20,
        fontFamily: Typography.sans.bold,
    },
    filterLabel: {
        color: '#BFC6CC',
        fontSize: 13,
        marginBottom: 6
    },
    filterRow: {
        flexDirection: 'row',
        marginBottom: 12
    },
    filterInput: {
        backgroundColor: '#14191D',
        borderRadius: 14,
        paddingHorizontal: 12,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    filterInputText: {
        color: '#A1A1AA'
    },
    filterTextInputStyle: {
        color: '#fff',
        flex: 1,
        fontFamily: Typography.sans.bold,
    },
    filterSectionContainer: {
        marginTop: 14,
        zIndex: 10
    },
    calendarBox: {
        position: 'absolute',
        top: 75,
        left: 0,
        right: 0,
        backgroundColor: '#1C2226',
        borderRadius: 16,
        overflow: 'hidden',
        zIndex: 2000,
        elevation: 15,
        borderWidth: 1,
        borderColor: '#23272A',
    },
    filterDropdown: {
        position: 'absolute',
        top: 78,
        width: '100%',
        backgroundColor: '#14191D',
        borderRadius: 14,
        zIndex: 999,
        elevation: 10,
        overflow: 'hidden',
    },
    dropdownScroll: {
        maxHeight: 250,
    },
    filterDropdownItem: {
        padding: 14
    },
    filterDropdownText: {
        color: '#fff',
        fontFamily: Typography.sans.regular,
    },
    filterGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    filterChip: {
        backgroundColor: '#14191D',
        borderRadius: 16,
        width: '48%',
        marginBottom: 10,
        overflow: 'hidden',
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterChipInner: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterChipActive: {
        backgroundColor: 'transparent',
    },
    filterChipInnerActive: {
        margin: 1.5,
        borderRadius: 14.5,
        backgroundColor: 'transparent',
        paddingVertical: 8.5,
        paddingHorizontal: 12.5,
    },
    filterChipText: {
        color: '#fff',
        fontSize: 13,
        fontFamily: Typography.sans.regular,
    },
    filterChipTextActive: {
        color: '#FFF',
        fontSize: 13,
        fontFamily: Typography.sans.regular,
    },

    // Language Modal Styles
    languageItem: {
        paddingVertical: 7,
        paddingHorizontal: 20,
    },
    languageItemText: {
        color: '#fff',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
    },
    languageItemTextSelected: {
        color: '#B99A4A',
        fontFamily: Typography.sans.bold,
    },
    languageModalOverlay: {
        margin: 0,
        justifyContent: 'flex-start',
        paddingTop: Platform.OS === 'ios' ? 130 : 80,
        alignItems: 'flex-end',
        paddingRight: 30,
    },
    languageModalContent: {
        backgroundColor: '#23272A',
        borderRadius: 12,
        width: 170,
        // maxHeight: '50%',
        paddingVertical: 10,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    modalHandle: {
        width: 60,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 3,
        alignSelf: 'center',
        marginVertical: 12,
    },
});

export default HomeScreen;
