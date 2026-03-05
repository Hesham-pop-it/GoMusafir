import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    Platform
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../constants/Colors';
import GradientBorderButton from '../../components/GradientBorderButton';
import GlowBackground from '../../components/GlowBackground';
import { Typography } from '../../constants/Typography';

const TrashIcon = ({ color = "#FF383C" }) => (
    <Svg width="24" height="28" viewBox="0 0 24 28" fill="none">
        <Path
            d="M2.75002 10.167C2.75002 9.707 3.09502 9.333 3.52102 9.333H6.18602C6.71502 9.318 7.18202 8.955 7.36202 8.417L7.39202 8.322L7.50702 7.95C7.57702 7.722 7.63802 7.523 7.72402 7.345C8.06202 6.643 8.68802 6.156 9.41102 6.031C9.59502 6 9.78802 6 10.011 6H13.489C13.712 6 13.906 6 14.089 6.031C14.812 6.156 15.439 6.643 15.776 7.345C15.862 7.523 15.923 7.722 15.993 7.95L16.108 8.322L16.138 8.417C16.318 8.955 16.878 9.319 17.408 9.333H19.978C20.405 9.333 20.75 9.706 20.75 10.167C20.75 10.628 20.405 11 19.979 11H3.52002C3.09402 11 2.75002 10.627 2.75002 10.167ZM11.607 26H12.394C15.101 26 16.454 26 17.335 25.137C18.215 24.273 18.305 22.857 18.485 20.026L18.745 15.945C18.843 14.408 18.892 13.64 18.45 13.153C18.008 12.666 17.263 12.666 15.771 12.666H8.23002C6.73902 12.666 5.99302 12.666 5.55102 13.153C5.10902 13.64 5.15902 14.408 5.25602 15.945L5.51602 20.025C5.69602 22.858 5.78602 24.273 6.66602 25.137C7.54602 26.001 8.90002 26 11.607 26Z"
            fill={color}
        />
    </Svg>
);

const MOCK_TEAM = [
    { id: '1', name: 'Rahman', role: 'Manager', avatar: 'https://randomuser.me/api/portraits/men/32.jpg' },
    { id: '2', name: 'Gofur', role: 'Co-Host', avatar: 'https://randomuser.me/api/portraits/men/33.jpg' },
];

const JourneyTeamScreen = () => {
    const navigation = useNavigation();
    const [isDeleteMode, setIsDeleteMode] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);

    const toggleDeleteMode = () => {
        setIsDeleteMode(!isDeleteMode);
        setSelectedMembers([]);
    };

    const toggleSelectMember = (id) => {
        if (selectedMembers.includes(id)) {
            setSelectedMembers(prev => prev.filter(memberId => memberId !== id));
        } else {
            setSelectedMembers(prev => [...prev, id]);
        }
    };

    const renderMember = ({ item }) => (
        <View style={styles.memberItem}>
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
            <View style={styles.memberInfo}>
                <Text style={styles.nameText}>{item.name}</Text>
                <Text style={styles.roleText}>{item.role}</Text>
            </View>
            {isDeleteMode && (
                <TouchableOpacity onPress={() => toggleSelectMember(item.id)}>
                    {selectedMembers.includes(item.id) ? (
                        <View style={styles.customCheckboxActive}>
                            <Ionicons name="checkmark" size={18} color="#FFF" />
                        </View>
                    ) : (
                        <View style={styles.customCheckboxInactive} />
                    )}
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <GlowBackground>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={toggleDeleteMode}>
                        <TrashIcon color={isDeleteMode ? "#FF383C" : "#FFF"} />
                    </TouchableOpacity>
                </View>

                <Text style={styles.title}>Journey Team</Text>

                <FlatList
                    data={MOCK_TEAM}
                    keyExtractor={item => item.id}
                    renderItem={renderMember}
                    contentContainerStyle={styles.listContent}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    ListFooterComponent={() => <View style={styles.separator} />}
                />

                <View style={styles.footer}>
                    {!isDeleteMode ? (
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={() => navigation.navigate('InviteMember')}
                        >
                            <Text style={styles.addButtonText}>Add</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() => setDeleteModalVisible(true)}
                            disabled={selectedMembers.length === 0}
                        >
                            <Text style={styles.deleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Delete Confirmation Modal */}
                <Modal
                    isVisible={deleteModalVisible}
                    onBackdropPress={() => setDeleteModalVisible(false)}
                    onSwipeComplete={() => setDeleteModalVisible(false)}
                    swipeDirection="down"
                    style={{ margin: 0, justifyContent: 'flex-end' }}
                    useNativeDriver={true}
                    hideModalContentWhileAnimating={true}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalIndicator} />
                        <Text style={styles.modalTitle}>
                            Are you sure want to delete Co-Host/ Manager from your team?
                        </Text>
                        <View style={styles.modalButtons}>
                            <GradientBorderButton
                                text="Cancel"
                                onPress={() => setDeleteModalVisible(false)}
                                style={{ flex: 1 }}
                                innerBg="#1E2124"
                            />
                            <TouchableOpacity
                                style={styles.confirmDeleteButton}
                                onPress={() => {
                                    setDeleteModalVisible(false);
                                    setIsDeleteMode(false);
                                    setSelectedMembers([]);
                                    // Real app would handle actual deletion here
                                }}
                            >
                                <Text style={styles.confirmDeleteButtonText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
        </GlowBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    backButton: {
        marginLeft: -10,
        padding: 10,
    },
    title: {
        fontSize: 28,
        color: '#FFF',
        fontFamily: Typography.serif.regular,
        paddingHorizontal: 20,
        marginTop: 20,
        marginBottom: 30,
    },
    listContent: {
        paddingHorizontal: 20,
    },
    memberItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 12,
        marginRight: 16,
    },
    memberInfo: {
        flex: 1,
    },
    nameText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
        marginBottom: 4,
    },
    roleText: {
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
        fontSize: 13,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#404347', // Equivalent to white at ~20-30% opacity on dark background
    },
    footer: {
        padding: 24,
        paddingBottom: 40
    },
    addButton: {
        height: 56,
        backgroundColor: '#B99A4A',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
    },
    deleteButton: {
        height: 56,
        backgroundColor: '#FF383C',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: 50,
        alignItems: 'center',
    },
    modalIndicator: {
        width: 40,
        height: 4,
        backgroundColor: '#3A3F45',
        borderRadius: 2,
        marginBottom: 30,
    },
    modalTitle: {
        fontSize: 16,
        fontFamily: Typography.sans.semiBold,
        color: '#FFF',
        textAlign: 'center',
        fontWeight: 'bold',
        marginBottom: 40,
        lineHeight: 28,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 16,
    },
    cancelButton: {
        flex: 1,
        height: 56,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    confirmDeleteButton: {
        flex: 1,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#FF4D4F',
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmDeleteButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    customCheckboxActive: {
        width: 20,
        height: 20,
        backgroundColor: '#B99A4A',
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    customCheckboxInactive: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#636D77',
        backgroundColor: 'transparent',
    },
});

export default JourneyTeamScreen;
