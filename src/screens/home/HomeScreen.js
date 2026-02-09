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
    Dimensions,
    Modal,
    TouchableWithoutFeedback,
    ScrollView,
    KeyboardAvoidingView
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome, MaterialIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import CustomBottomTabBar from '../../components/CustomBottomTabBar';
import { Colors } from '../../constants/Colors';
import * as NavigationBar from 'expo-navigation-bar';

const { width } = Dimensions.get('window');

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

const FilterModal = ({ visible, onClose, sortOption, setSortOption }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [activeDateInput, setActiveDateInput] = useState(null);

    const [showCalendar, setShowCalendar] = useState(false);
    const [showDestinations, setShowDestinations] = useState(false);

    const [destination, setDestination] = useState('Makkah');
    const [participants, setParticipants] = useState('90');

    const onDateSelect = (day) => {
        if (activeDateInput === 'start') setStartDate(day.dateString);
        if (activeDateInput === 'end') setEndDate(day.dateString);
        setShowCalendar(false);
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ width: '100%' }}
                    >
                        <View style={styles.filterModalContainer}>
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                contentContainerStyle={{ paddingBottom: 20 }}
                            >
                                <TouchableWithoutFeedback onPress={() => {
                                    setShowCalendar(false);
                                    setShowDestinations(false);
                                }}>
                                    <View>
                                        {/* Dates */}
                                        <View style={[styles.filterRow, { zIndex: 1100 }]}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.filterLabel}>Start Date</Text>
                                                <TouchableOpacity
                                                    style={styles.filterInput}
                                                    onPress={() => {
                                                        setActiveDateInput('start');
                                                        setShowCalendar(!showCalendar);
                                                        setShowDestinations(false);
                                                    }}
                                                >
                                                    <Feather name="calendar" size={18} color="#9BA1A6" />
                                                    <Text style={styles.filterInputText}>
                                                        {startDate || 'Start date'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                            <View style={{ width: 12 }} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.filterLabel}>End Date</Text>
                                                <TouchableOpacity
                                                    style={styles.filterInput}
                                                    onPress={() => {
                                                        setActiveDateInput('end');
                                                        setShowCalendar(!showCalendar);
                                                        setShowDestinations(false);
                                                    }}
                                                >
                                                    <Feather name="calendar" size={18} color="#9BA1A6" />
                                                    <Text style={styles.filterInputText}>
                                                        {endDate || 'End date'}
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
                                            <Text style={styles.filterLabel}>Destination</Text>
                                            <TouchableOpacity
                                                style={styles.filterInput}
                                                onPress={() => {
                                                    setShowDestinations(!showDestinations);
                                                    setShowCalendar(false);
                                                }}
                                            >
                                                <Ionicons name="location-outline" size={20} color="#9BA1A6" />
                                                <Text style={styles.filterInputText}>{destination}</Text>
                                            </TouchableOpacity>

                                            {showDestinations && (
                                                <View style={styles.filterDropdown}>
                                                    <ScrollView
                                                        style={styles.dropdownScroll}
                                                        nestedScrollEnabled={true}
                                                        showsVerticalScrollIndicator={true}
                                                        keyboardShouldPersistTaps="handled"
                                                    >
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
                                            <Text style={styles.filterLabel}>Total Participants</Text>
                                            <View style={styles.filterInput}>
                                                <Ionicons name="people-outline" size={20} color="#9BA1A6" />
                                                <TextInput
                                                    style={styles.filterTextInputStyle}
                                                    keyboardType="numeric"
                                                    value={participants}
                                                    onChangeText={setParticipants}
                                                    placeholderTextColor="#636D77"
                                                    onFocus={() => {
                                                        setShowCalendar(false);
                                                        setShowDestinations(false);
                                                    }}
                                                />
                                            </View>
                                        </View>

                                        {/* Sort */}
                                        <View style={styles.filterSectionContainer}>
                                            <Text style={styles.filterLabel}>Sort by</Text>
                                            <View style={styles.filterGrid}>
                                                {sortOptions.map(opt => (
                                                    <TouchableOpacity
                                                        key={opt}
                                                        style={styles.filterChip}
                                                        onPress={() => {
                                                            setSortOption(opt);
                                                            setShowCalendar(false);
                                                            setShowDestinations(false);
                                                        }}
                                                    >
                                                        {sortOption === opt ? (
                                                            <LinearGradient
                                                                colors={['#B99A4A', '#8E773A']}
                                                                start={{ x: 0, y: 0 }}
                                                                end={{ x: 1, y: 0 }}
                                                                style={StyleSheet.absoluteFill}
                                                            />
                                                        ) : null}
                                                        <Text
                                                            style={[
                                                                styles.filterChipText,
                                                                sortOption === opt && styles.filterChipTextActive
                                                            ]}
                                                        >
                                                            {opt}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                </TouchableWithoutFeedback>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};




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

const LanguageModal = ({ visible, onClose, onSelect, selectedLanguage }) => {
    const renderLanguageItem = ({ item }) => (
        <TouchableOpacity
            style={styles.languageItem}
            onPress={() => {
                onSelect(item.code);
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
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.languageModalOverlay}>
                    <View style={styles.languageModalContent}>
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
    );
};

const HomeScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const [filterVisible, setFilterVisible] = useState(false);
    const [languageVisible, setLanguageVisible] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('EN');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOption, setSortOption] = useState('Newest');
    const [filteredData, setFilteredData] = useState(TRIPS_DATA);

    useEffect(() => {
        let result = [...TRIPS_DATA];

        if (searchQuery) {
            result = result.filter(item =>
                item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.location.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        if (sortOption === 'A-Z') {
            result.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sortOption === 'Z-A') {
            result.sort((a, b) => b.title.localeCompare(a.title));
        } else if (sortOption === 'Newest') {
            result.sort((a, b) => parseInt(b.id) - parseInt(a.id));
        } else if (sortOption === 'Oldest') {
            result.sort((a, b) => parseInt(a.id) - parseInt(b.id));
        }

        setFilteredData(result);
    }, [searchQuery, sortOption]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning!';
        if (hour < 18) return 'Good Afternoon!';
        return 'Good Evening!';
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
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('TripOverview', { trip: { ...item, image: item.image || imageSource } })}
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
                        <Text style={styles.cardDetailText}>{item.participants}</Text>
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
                />
                <LanguageModal
                    visible={languageVisible}
                    onClose={() => setLanguageVisible(false)}
                    onSelect={setSelectedLanguage}
                    selectedLanguage={selectedLanguage}
                />

                <View style={styles.contentContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.greetingText}>{getGreeting()}</Text>
                            <Text style={styles.subtitleText}>May Allah Guide Every Step</Text>
                        </View>
                        <View style={styles.headerIcons}>
                            <TouchableOpacity
                                style={styles.iconButton}
                                onPress={() => setLanguageVisible(true)}
                            >
                                <FontAwesome name="language" size={24} color={Colors.dark.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.iconButton}
                                onPress={() => navigation.navigate('Notifications')}
                            >
                                <Ionicons name="notifications-outline" size={24} color={Colors.dark.primary} />
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
                                placeholder="Search your trip"
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
        fontFamily: 'CormorantGaramond_700Bold',
    },
    subtitleText: {
        fontSize: 14,
        color: Colors.dark.textSecondary,
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
        backgroundColor: '#23272A',
        borderRadius: 16,
        marginBottom: 16,
        overflow: 'hidden',
        height: 110,
        alignItems: 'center',
        padding: 10,
    },
    cardImage: {
        width: 140,
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
        borderRadius: 20,
        padding: 16,
        maxHeight: '100%'
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
        color: '#fff'
    },
    filterTextInputStyle: {
        color: '#fff',
        flex: 1
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
        borderColor: '#2C2E33',
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
        maxHeight: 160,
    },
    filterDropdownItem: {
        padding: 14
    },
    filterDropdownText: {
        color: '#fff'
    },
    filterGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10
    },
    filterChip: {
        backgroundColor: '#14191D',
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 14,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterChipActive: {
        backgroundColor: 'transparent',
    },
    filterChipText: {
        color: '#BFC6CC'
    },
    filterChipTextActive: {
        color: '#FFF',
        fontWeight: 'bold'
    },

    // Language Modal Styles
    languageItem: {
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    languageItemText: {
        color: '#9BA1A6',
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
        backgroundColor: '#2C2E33',
        borderRadius: 12,
        width: 180,
        maxHeight: 400,
        paddingVertical: 8,
        elevation: 5,
    },
});

export default HomeScreen;
