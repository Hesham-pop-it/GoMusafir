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
import { responsiveFontSize } from '../../utils/responsive';
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
                            const staffRef = ref(database, `orgs/${orgId}/staff`);
                            countListeners.current[tId] = onValue(pRef, (pSnap) => {
                                get(staffRef).then(staffSnap => {
                                    const staffList = staffSnap.val() || {};
                                    const uids = pSnap.exists()
                                        ? (Array.isArray(pSnap.val()) ? pSnap.val().filter(v => v !== null) : Object.keys(pSnap.val()))
                                        : [];
                                    const filtered = uids.filter(uid => {
                                        const role = staffList[uid];
                                        return !role || role === 'co-host' || role === 'manager';
                                    });
                                    const teamMemberUids = Object.keys(staffList).filter(uid => {
                                        const role = staffList[uid];
                                        return role === 'co-host' || role === 'manager';
                                    });
                                    const combined = Array.from(new Set([...filtered, ...teamMemberUids]));
                                    setParticipantsCounts(prev => ({ ...prev, [tId]: combined.length }));
                                }).catch(() => {
                                    if (pSnap.exists()) {
                                        const val = pSnap.val();
                                        const uids = Array.isArray(val) ? val.filter(v => v !== null) : Object.keys(val);
                                        setParticipantsCounts(prev => ({ ...prev, [tId]: uids.length }));
                                    } else {
                                        setParticipantsCounts(prev => ({ ...prev, [tId]: 0 }));
                                    }
                                });
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
                                const staffRef = ref(database, `orgs/${orgId}/staff`);
                                countListeners.current[tripId] = onValue(pRef, (pSnap) => {
                                    get(staffRef).then(staffSnap => {
                                        const staffList = staffSnap.val() || {};
                                        const uids = pSnap.exists()
                                            ? (Array.isArray(pSnap.val()) ? pSnap.val().filter(v => v !== null) : Object.keys(pSnap.val()))
                                            : [];
                                        const filtered = uids.filter(uid => {
                                            const role = staffList[uid];
                                            return !role || role === 'co-host' || role === 'manager';
                                        });
                                        const teamMemberUids = Object.keys(staffList).filter(uid => {
                                            const role = staffList[uid];
                                            return role === 'co-host' || role === 'manager';
                                        });
                                        const combined = Array.from(new Set([...filtered, ...teamMemberUids]));
                                        setParticipantsCounts(prev => ({ ...prev, [tripId]: combined.length }));
                                    }).catch(() => {
                                        if (pSnap.exists()) {
                                            const val = pSnap.val();
                                            const uids = Array.isArray(val) ? val.filter(v => v !== null) : Object.keys(val);
                                            setParticipantsCounts(prev => ({ ...prev, [tripId]: uids.length }));
                                        } else {
                                            setParticipantsCounts(prev => ({ ...prev, [tripId]: 0 }));
                                        }
                                    });
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
                            <Svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <Path d="M10.5165 17.3416C10.2332 17.4416 9.7665 17.4416 9.48317 17.3416C7.0665 16.5166 1.6665 13.075 1.6665 7.24165C1.6665 4.66665 3.7415 2.58331 6.29984 2.58331C7.8165 2.58331 9.15817 3.31665 9.99984 4.44998C10.8415 3.31665 12.1915 2.58331 13.6998 2.58331C16.2582 2.58331 18.3332 4.66665 18.3332 7.24165C18.3332 13.075 12.9332 16.5166 10.5165 17.3416Z" stroke="#B99A4A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </Svg>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.cardRow}>
                        <Svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <Path d="M12.3423 14.0894H4.4471C3.95455 14.0894 3.51196 14.1251 3.06223 13.8538C2.39835 13.4541 2.19134 12.7616 2.19134 12.0406V7.51483C2.19134 6.43692 1.85583 4.50952 2.86235 3.78139C3.28353 3.47444 3.78322 3.53155 4.27578 3.53155H11.1787C11.5214 3.53155 11.8854 3.50299 12.2281 3.53155C13.1989 3.61007 13.8128 4.45241 13.8414 5.37328C13.8913 6.90806 13.8414 8.44998 13.8414 9.98475C13.8414 11.2982 14.2982 14.018 12.3494 14.0965C11.6927 14.1251 11.4357 14.9674 12.2423 14.9317C13.4844 14.8818 14.6766 14.0965 14.9692 12.8402C15.0835 12.3547 15.0335 11.8051 15.0335 11.3054C15.0335 9.5493 15.0335 7.80037 15.0335 6.0443C15.0335 5.51605 15.0835 4.92356 14.9193 4.41672C14.5409 3.28884 13.4844 2.70348 12.3423 2.68921C11.0074 2.67493 9.67248 2.68921 8.33044 2.68921C6.85278 2.68921 5.36797 2.66779 3.8903 2.68921C2.93374 2.70348 2.00574 3.11752 1.45607 3.92417C1.04918 4.51666 1.00635 5.14485 1.00635 5.82301V11.0056C1.00635 11.4767 0.992068 11.9478 1.00635 12.4118C1.0349 13.6182 1.82727 14.6105 3.0194 14.8603C3.56907 14.9746 4.18298 14.9246 4.74692 14.9246H12.2352C12.8991 14.9246 13.1418 14.0894 12.3423 14.0894Z" fill="#B99A4A"/>
                        <Path d="M14.6415 7.03516H1.85649C1.64234 7.03516 1.1712 7.11368 1.0784 7.34925C0.985597 7.58482 1.15692 7.67048 1.39249 7.67048H14.1775C14.3917 7.67048 14.8628 7.59196 14.9556 7.35639C15.0484 7.12082 14.8771 7.03516 14.6415 7.03516Z" fill="#B99A4A"/>
                        <Path d="M10.2227 1.62662V4.73901C10.2227 4.83181 10.394 4.88178 10.4511 4.89605C10.5867 4.92461 10.758 4.91033 10.8865 4.8675C11.1007 4.80325 11.3934 4.6819 11.3934 4.42491V1.31253C11.3934 1.21973 11.222 1.16976 11.1649 1.15548C11.0293 1.12693 10.858 1.1412 10.7295 1.18403C10.5153 1.24828 10.2227 1.36964 10.2227 1.62662Z" fill="#B99A4A"/>
                        <Path d="M4.61914 1.50301V4.6154C4.61914 4.90808 4.89754 5.06512 5.16881 5.03657C5.41151 5.01515 5.81127 4.84383 5.81127 4.53688V1.42449C5.81127 1.13181 5.53287 0.974764 5.2616 1.00332C5.01889 1.02473 4.61914 1.19606 4.61914 1.50301Z" fill="#B99A4A"/>
                        </Svg>

                        <Text style={styles.cardDetailText}>{item.date}</Text>
                    </View>

                    <View style={styles.cardRow}>
                        <Svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <Path d="M7.98811 2.04755C9.45948 2.08115 10.8234 2.7866 11.7102 3.96235C12.5971 5.1381 12.8255 6.69682 12.5903 8.18162C12.1536 10.9967 10.3531 13.0795 7.86717 14.3291L8.64653 14.2216C6.25472 13.0257 4.46757 11.0706 3.89649 8.39662C3.60087 6.99915 3.63446 5.51434 4.36679 4.25125C5.09912 2.98816 6.45627 2.08115 7.98139 2.04755C8.18295 2.04755 8.62638 1.97365 8.71372 1.75193C8.80106 1.53022 8.63981 1.4496 8.42482 1.45632C5.9255 1.51007 3.50681 3.00831 2.80808 5.49419C2.10935 7.98007 3.27166 11.1311 5.15286 12.972C5.83816 13.6438 6.81236 14.4433 7.75296 14.7255C8.47185 14.9472 9.5737 14.1074 10.1112 13.7312C12.3418 12.1657 13.7527 9.59924 13.7997 6.86478C13.8534 3.81454 11.4213 1.51678 8.43154 1.45632C8.03514 1.4496 7.24907 2.03412 7.99483 2.04755H7.98811Z" fill="#B99A4A"/>
                            <Path d="M9.73608 6.78277C9.73608 7.17245 9.6353 7.53526 9.41359 7.85775C9.37328 7.9115 9.33297 7.97196 9.27922 8.02571C9.25234 8.05259 9.23219 8.07946 9.20531 8.10633C9.21203 8.09962 9.07765 8.21383 9.13812 8.1668C8.98359 8.29446 8.88282 8.3482 8.75516 8.39523C8.79547 8.3818 8.54017 8.4557 8.57376 8.44898C8.65439 8.43554 8.46627 8.46242 8.4797 8.46242C8.43267 8.46242 8.38564 8.46914 8.33189 8.47586C8.23112 8.47586 8.04299 8.4557 7.88846 8.40195C7.55254 8.30117 7.25692 8.07946 7.04193 7.804C6.58506 7.21948 6.50444 6.39309 6.87396 5.74139C6.95458 5.59358 7.04864 5.47265 7.16958 5.35843C7.27707 5.25094 7.42488 5.15688 7.53238 5.10313C7.56597 5.08969 7.59957 5.07625 7.63316 5.0561C7.52566 5.10313 7.69363 5.03594 7.70035 5.03594C7.73394 5.0225 7.77425 5.01578 7.80785 5.00907C7.71378 5.02922 7.828 5.00907 7.85487 5.00907C8.02284 4.98891 8.15049 4.98891 8.30502 5.0225C9.11125 5.19047 9.7092 5.9631 9.72264 6.78949C9.72264 7.05152 9.9981 7.11198 10.2198 7.09183C10.4012 7.07167 10.8379 6.93058 10.8379 6.67527C10.8245 5.63389 10.1929 4.76048 9.21203 4.41111C8.16393 4.04159 6.85381 4.39096 6.13492 5.2375C5.45634 6.03029 5.3354 7.13886 5.87289 8.03915C6.41038 8.93944 7.57269 9.33584 8.60064 9.141C9.79655 8.91928 10.8245 7.93165 10.8446 6.67527C10.8446 6.41325 10.5692 6.35278 10.3475 6.37294C10.1593 6.39309 9.73608 6.53418 9.72936 6.78949L9.73608 6.78277Z" fill="#B99A4A"/>
                        </Svg>

                        <Text style={styles.cardDetailText}>{item.location}</Text>
                    </View>

                    <View style={styles.cardRow}>
                        <Svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <Path d="M2.22837 14.5822C2.22837 13.5156 2.03026 12.3068 3.06327 11.5069C3.78496 10.9499 4.87457 11.0981 5.78022 11.0981H9.65754C10.6198 11.0981 11.6811 10.9796 12.5302 11.4477C13.9523 12.2417 13.7613 13.6045 13.7613 14.8488C13.7613 15.0385 14.9216 14.8903 14.9216 14.5881C14.9216 13.3675 15.0914 12.0758 13.8179 11.2284C12.8415 10.5766 11.6316 10.6714 10.4641 10.6714H6.11984C4.8958 10.6714 3.70005 10.6181 2.60337 11.181C1.69064 11.6491 1.11753 12.4194 1.07508 13.3142C1.04678 13.8237 1.07508 14.3333 1.07508 14.8429C1.07508 15.0325 2.23545 14.8844 2.23545 14.5822H2.22837Z" fill="#B99A4A" />
                            <Path d="M10.6562 4.8777C10.6433 6.09775 10.0162 7.35227 8.88487 7.76585C7.81818 8.15875 6.64159 7.60042 5.97572 6.69744C5.21935 5.67728 5.11591 4.1953 5.74299 3.07864C6.31836 2.05848 7.35272 1.52083 8.45173 1.81723C9.78993 2.17566 10.6433 3.53358 10.6627 4.96042C10.6627 5.32574 11.7294 5.10517 11.7229 4.65713C11.7035 3.07864 10.7079 1.72762 9.30508 1.25201C7.83111 0.748822 6.09855 1.30026 5.09652 2.54099C4.09448 3.78172 4.00397 5.47049 4.77974 6.81462C5.55552 8.15875 7.20403 8.77222 8.68446 8.44825C10.3459 8.08292 11.7035 6.59405 11.7294 4.73984C11.7294 4.25734 10.6691 4.4917 10.6691 4.8777H10.6562Z" fill="#B99A4A" />
                        </Svg>

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
                                <Svg width="25" height="25" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <Path d="M8.85996 3.04039C9.65577 1.75015 11.9743 2.13795 13.2262 2.13805C14.3907 2.13805 16.5943 1.73048 16.7496 3.38024C16.8078 4.00133 16.9049 5.00124 16.7496 5.60289C16.6619 5.93274 15.8764 6.35916 16.4967 6.02965C16.8363 5.84527 17.1668 5.6417 17.5064 5.44762C18.7971 4.70042 20.2328 4.10823 21.1353 5.67027L23.1812 9.2152C23.1976 9.23494 23.2122 9.25618 23.2223 9.28063C23.5812 10.1636 23.0185 10.7267 22.3102 11.1537C21.9706 11.3574 20.487 11.9778 20.4664 12.2982C20.4373 12.7252 21.9703 13.3374 22.2711 13.5121C22.9309 13.9002 23.5621 14.3564 23.2613 15.2201C23.0866 15.7342 22.7079 16.2095 22.4459 16.6752C21.7763 17.83 21.1354 19.7423 19.7477 20.1693C18.9036 20.4214 18.3017 20.1881 17.5934 19.7806L16.7945 19.3158C16.7784 19.534 16.7496 19.7545 16.7496 19.8588C16.7496 20.2468 16.7593 20.6348 16.7496 21.0228C16.7205 21.9059 16.1865 22.4491 15.3326 22.682C14.7795 22.8373 14.1679 22.7796 13.5953 22.7796H10.9361C10.3927 22.7797 9.7231 22.8569 9.24765 22.5658C8.51043 22.1097 8.66556 21.2269 8.66562 20.4798C8.66562 20.1208 8.57828 19.6545 8.66562 19.3148C8.74338 19.0043 9.47084 18.6065 8.97617 18.849C8.32599 19.1595 7.7436 19.5962 7.10312 19.9261C6.24917 20.3628 5.12364 20.5084 4.50254 19.6449C4.20177 19.2374 3.96865 18.7426 3.7164 18.2963L2.43515 16.0736C2.0859 15.4818 1.8726 14.8803 2.40586 14.2884C2.84256 13.7935 3.61937 13.4827 4.18222 13.1625C4.37632 13.046 4.93912 12.8224 4.94882 12.638C4.9583 12.3567 4.43401 12.1628 4.25937 12.0658C3.69669 11.736 2.99836 11.4545 2.50351 11.0277C1.86302 10.4842 2.07609 9.80405 2.43515 9.18297C3.1241 7.9797 3.74584 6.67969 4.53183 5.55406C5.66974 3.93249 7.32011 4.8586 8.6207 5.61363C8.63513 5.40213 8.66562 5.18611 8.66562 5.06871C8.66561 4.45733 8.52031 3.58383 8.85996 3.04039ZM14.5953 3.00133C14.081 2.85576 13.3233 3.00133 12.7799 3.00133H10.5289C10.4708 3.00133 10.248 2.96286 10.2086 3.00133C10.0728 3.11776 10.2954 2.98236 10.2955 3.19566C10.2858 3.43816 10.2672 3.68079 10.2672 3.93297C10.2672 4.54426 10.3448 5.20448 10.2672 5.81578C10.1604 6.62125 9.18923 7.02891 8.44199 6.91246C7.85987 6.82498 7.27762 6.34026 6.78281 6.04918C6.63724 5.96184 6.16159 5.56395 5.98691 5.58336C6.0063 5.57366 6.04548 5.61238 5.93906 5.69957C5.51206 6.08775 5.21072 6.95171 4.92929 7.44664C4.57996 8.04824 4.17247 8.64992 3.87168 9.28063C3.56118 9.9599 3.84228 10.3776 4.44394 10.7269C5.28822 11.2121 7.51046 12.0755 5.93906 13.1234C5.36655 13.5018 4.74485 13.7442 4.15293 14.1517C3.56095 14.5593 3.69694 15.0546 4.01718 15.6078C4.67706 16.7528 5.54093 17.9075 6.05527 19.1302C6.21054 19.499 6.04563 19.5086 6.37558 19.4213C6.66664 19.3435 7.01602 19.053 7.27793 18.8978C7.83099 18.5776 8.41301 18.1503 9.06308 18.0629C10.8582 17.83 10.151 20.0518 10.2672 21.1097C10.3642 21.9831 10.8204 21.9642 11.5094 21.9642H14.8961C14.9546 21.9643 15.1192 21.9933 15.1773 21.9642C15.381 21.8479 15.1285 22.0125 15.1285 21.7699C15.1576 21.1198 15.1578 20.4407 15.1578 19.8197C15.1578 19.1986 15.0702 18.7128 15.7203 18.3343C16.3704 17.9559 17.0114 17.9948 17.6324 18.3343C18.0011 18.5381 18.3701 18.7517 18.7291 18.9652C18.8745 19.0428 19.2718 19.3727 19.4273 19.3636C19.505 19.3539 19.3502 19.3921 19.5055 19.2562C19.6703 19.1008 19.7963 18.7422 19.9127 18.5482L21.1168 16.4525C21.3982 15.9576 21.9504 15.3365 21.6305 14.7543C21.1841 13.9391 18.6711 13.6085 18.9137 12.4828C19.1908 11.2132 22.1983 11.3249 21.6578 9.78551C21.6403 9.76767 21.6237 9.74885 21.6109 9.72691L20.9029 8.50426L19.7096 6.43688C19.6028 6.2428 19.4571 6.04886 19.3697 5.84508C19.2145 5.47634 19.3793 5.46675 19.0494 5.55406C18.1275 5.78697 16.2835 7.83444 15.3131 6.61168C14.663 5.7965 15.8856 3.3606 14.5953 3.00133ZM9.26718 10.055C10.4608 8.6673 12.538 8.02734 14.2945 8.5902C15.8956 9.10458 17.0602 10.521 17.0797 12.2289C17.0797 12.2489 17.0771 12.2684 17.0748 12.2875C17.0774 12.3057 17.0797 12.3248 17.0797 12.3451C17.0506 14.3733 15.4201 15.9745 13.4986 16.3724C11.7811 16.7315 9.86961 16.1885 8.90879 14.6361C8.02569 13.1998 8.1706 11.3457 9.26718 10.055ZM13.0816 9.41441C11.9463 9.133 10.9752 9.58914 10.3541 10.6371C9.6748 11.7822 9.79196 13.3155 10.6168 14.3539C11.005 14.8391 11.5092 15.2184 12.1012 15.4222C12.3922 15.5192 12.7028 15.5677 13.0035 15.5677C13.1297 15.5677 13.2563 15.5578 13.3922 15.5287C13.3243 15.5384 13.6731 15.4507 13.6148 15.4701C14.7813 15.0685 15.4375 13.8193 15.4752 12.6039C15.435 11.1667 14.5293 9.77886 13.0816 9.41441Z" fill="#B99A4A"/>
                                </Svg>
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
        fontSize: 13,
        // fontFamily: Typography.sans.bold,
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
        backgroundColor: '#23272A',
        borderRadius: 16,
        marginBottom: 16,
        overflow: 'hidden',
        height: 110,
        alignItems: 'center',
        padding: 10,
    },
    cardImage: {
        width: 160,
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
        fontSize: 18,
        fontWeight: 'bold',
        color: '#F4F4F5',
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cardDetailText: {
        fontSize: Math.max(12, responsiveFontSize(12)),
        color: '#F4F4F5',
        fontFamily: Typography.sans.regular,
        letterSpacing: 0.2
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
