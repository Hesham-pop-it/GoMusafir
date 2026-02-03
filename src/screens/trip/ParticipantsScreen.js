import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    TextInput,
    Modal,
    TouchableWithoutFeedback,
    Platform,
    Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';

const { width, height } = Dimensions.get('window');

const PARTICIPANTS = [
    { id: '1', name: 'Ethan Carter', status: 'Speaking', isSpeaking: true, image: 'https://randomuser.me/api/portraits/men/32.jpg' },
    { id: '2', name: 'Sophia Bennett', status: 'Muted', isSpeaking: false, image: 'https://randomuser.me/api/portraits/women/44.jpg' },
    { id: '3', name: 'Sophia Bennett', status: 'Muted', isSpeaking: false, image: 'https://randomuser.me/api/portraits/women/65.jpg' },
    { id: '4', name: 'Sophia Bennett', status: 'Muted', isSpeaking: false, image: 'https://randomuser.me/api/portraits/women/33.jpg' },
    { id: '5', name: 'Sophia Bennett', status: 'Muted', isSpeaking: false, image: 'https://randomuser.me/api/portraits/women/22.jpg' },
    { id: '6', name: 'Sophia Bennett', status: 'Muted', isSpeaking: false, image: 'https://randomuser.me/api/portraits/women/11.jpg' },
];

const ParticipantsScreen = () => {
    const navigation = useNavigation();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [detailVisible, setDetailVisible] = useState(false);
    const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

    const renderParticipant = ({ item }) => (
        <TouchableOpacity
            style={styles.participantRow}
            onPress={() => {
                setSelectedParticipant(item);
                setDetailVisible(true);
            }}
        >
            <View style={[
                styles.avatarContainer,
                item.isSpeaking && styles.speakingAvatar
            ]}>
                <Image source={{ uri: item.image }} style={styles.avatar} />
            </View>
            <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={[
                    styles.status,
                    item.isSpeaking ? styles.speakingText : styles.mutedText
                ]}>{item.status}</Text>
            </View>
        </TouchableOpacity>
    );

    const handleDeletePress = () => {
        setDetailVisible(false);
        setTimeout(() => setDeleteConfirmVisible(true), 300);
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#FFF" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Participants</Text>
                    <Text style={styles.headerSubtitle}>45/50 Joined</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Feather name="search" size={20} color="#9BA1A6" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search participant"
                        placeholderTextColor="#9BA1A6"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {/* List */}
            <FlatList
                data={PARTICIPANTS}
                renderItem={renderParticipant}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
            />

            {/* Participant Detail Modal (Bottom Sheet Style) */}
            <Modal
                visible={detailVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setDetailVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setDetailVisible(false)}>
                    <View style={styles.modalOverlay}>
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

                                        {/* Mini Map Placeholder */}
                                        <View style={styles.mapPlaceholder}>
                                            <Image
                                                source={{ uri: 'https://via.placeholder.com/400x200/1A1E21/FFFFFF?text=Map+View' }}
                                                style={styles.mapImage}
                                            />
                                            <View style={styles.mapPinContainer}>
                                                <Image source={{ uri: selectedParticipant.image }} style={styles.mapPinAvatar} />
                                            </View>
                                        </View>

                                        <TouchableOpacity
                                            style={styles.actionButtonOutline}
                                            onPress={() => {
                                                setDetailVisible(false);
                                                navigation.navigate('EditParticipant', { participant: selectedParticipant });
                                            }}
                                        >
                                            <Text style={styles.actionButtonText}>Edit Participant</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.deleteButton}
                                            onPress={handleDeletePress}
                                        >
                                            <Ionicons name="trash-outline" size={20} color="#FFF" style={styles.btnIcon} />
                                            <Text style={styles.deleteButtonText}>Delete for this trip</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.deleteButton}
                                            onPress={handleDeletePress}
                                        >
                                            <Ionicons name="trash-outline" size={20} color="#FFF" style={styles.btnIcon} />
                                            <Text style={styles.deleteButtonText}>Delete for all trip</Text>
                                        </TouchableOpacity>
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
                                style={styles.confirmCancel}
                                innerBg="#1E2124"
                            />
                            <TouchableOpacity
                                style={styles.confirmDelete}
                                onPress={() => setDeleteConfirmVisible(false)}
                            >
                                <Text style={styles.confirmDeleteText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

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
    },
    backButton: {
        padding: 5,
    },
    headerTitleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
    },
    headerSubtitle: {
        color: '#9BA1A6',
        fontSize: 14,
    },
    searchContainer: {
        paddingHorizontal: 20,
        marginTop: 20,
        marginBottom: 10,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#23272A',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    participantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    avatarContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        padding: 2,
        marginRight: 16,
    },
    speakingAvatar: {
        borderWidth: 2,
        borderColor: '#34C759',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 28,
    },
    info: {
        flex: 1,
    },
    name: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    status: {
        fontSize: 14,
    },
    speakingText: {
        color: '#9BA1A6',
    },
    mutedText: {
        color: '#636D77',
    },
    // Modal & Sheet Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    bottomSheet: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
        maxHeight: height * 0.85,
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
    actionButtonOutline: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        borderWidth: 1.5,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    actionButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    deleteButton: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        backgroundColor: '#942F31',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    btnIcon: {
        marginRight: 10,
    },
    deleteButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Confirm Box
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
    confirmCancel: {
        flex: 1,
    },
    confirmDelete: {
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
});

export default ParticipantsScreen;
