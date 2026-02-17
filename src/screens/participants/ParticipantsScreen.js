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
    Modal,
    TouchableWithoutFeedback
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../constants/Colors';
import CustomBottomTabBar from '../../components/CustomBottomTabBar';
import * as NavigationBar from 'expo-navigation-bar';
import ParticipantDetailsModal from '../../components/ParticipantDetailsModal';

const { width } = Dimensions.get('window');

const PARTICIPANTS_DATA = [
    {
        id: '1',
        name: 'Ahmed Badawi',
        trip: 'Umrah Trip',
        image: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=3387&auto=format&fit=crop',
        email: 'ahmed.badawi@example.com',
        phone: '+966 50 123 4567',
        tripHistory: [
            { name: 'Umrah Trip', status: 'Upcoming' },
            { name: 'Hajj 2024', status: 'Complete' },
            { name: 'Umrah Trip', status: 'Upcoming' },
            { name: 'Hajj 2024', status: 'Complete' }
        ],
        likes: 120
    },
    {
        id: '2',
        name: 'Sarah Johnson',
        trip: 'Umrah Trip',
        image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=1000&auto=format&fit=crop',
        email: 'sarah.j@example.com',
        phone: '+44 7700 900077',
        tripHistory: [
            { name: 'Umrah Trip', status: 'Upcoming' }
        ],
        likes: 85
    },
    {
        id: '3',
        name: 'Mohammed Ali',
        trip: 'Hajj Trip',
        image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=1000&auto=format&fit=crop',
        email: 'm.ali@example.com',
        phone: '+971 50 999 8888',
        tripHistory: [
            { name: 'Hajj Trip', status: 'Upcoming' },
            { name: 'Turkey Tour', status: 'Complete' }
        ],
        likes: 200
    },
    {
        id: '4',
        name: 'Fatima Zahra',
        trip: 'Umrah Trip',
        image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=1000&auto=format&fit=crop',
        email: 'fatima.z@example.com',
        phone: '+20 100 123 4567',
        tripHistory: [],
        likes: 45
    },
];

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

const FilterModal = ({ visible, onClose, sortOption, setSortOption, selectedJourney, setSelectedJourney }) => {
    const [showJourneys, setShowJourneys] = useState(false);
    const journeys = ['Umrah Trip', 'Hajj Trip', 'Turkey Tour', 'Egypt Tour', 'Morocco Tour'];

    const handleSelect = (option) => {
        setSortOption(option);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => {
                    setShowJourneys(false);
                    onClose();
                }}
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
                            <Text style={styles.journeyInputText}>{selectedJourney || 'Umrah Trip'}</Text>
                        </TouchableOpacity>

                        {showJourneys && (
                            <View style={styles.journeyDropdown}>
                                <ScrollView
                                    style={styles.dropdownScroll}
                                    nestedScrollEnabled={true}
                                    showsVerticalScrollIndicator={true}
                                    keyboardShouldPersistTaps="handled"
                                >
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
            </TouchableOpacity>
        </Modal>
    );
};

// Redundant TabBarBackground removed

const ParticipantsScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const [filterVisible, setFilterVisible] = useState(false);
    const [languageVisible, setLanguageVisible] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('EN');
    const [selectedJourney, setSelectedJourney] = useState('Umrah Trip');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOption, setSortOption] = useState('A-Z');

    const [filteredData, setFilteredData] = useState(PARTICIPANTS_DATA);
    const [detailsVisible, setDetailsVisible] = useState(false);
    const [selectedParticipant, setSelectedParticipant] = useState(null);

    const openDetails = (participant) => {
        setSelectedParticipant(participant);
        setDetailsVisible(true);
    };

    useEffect(() => {
        let result = [...PARTICIPANTS_DATA];

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
    }, [searchQuery, sortOption]);

    useEffect(() => {
        if (Platform.OS === 'android') {
            NavigationBar.setButtonStyleAsync('light');
        }
    }, []);

    const renderParticipantItem = ({ item }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => openDetails(item)}
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
                />

                <ParticipantDetailsModal
                    visible={detailsVisible}
                    onClose={() => setDetailsVisible(false)}
                    participant={selectedParticipant}
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
                            <Text style={styles.titleText}>Participants</Text>
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
