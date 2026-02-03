import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    Modal,
    TouchableWithoutFeedback,
    Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';

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
                    <MaterialCommunityIcons
                        name={selectedMembers.includes(item.id) ? "checkbox-marked" : "checkbox-blank-outline"}
                        size={26}
                        color={selectedMembers.includes(item.id) ? "#B99A4A" : "#636D77"}
                    />
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="chevron-back" size={28} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={toggleDeleteMode}>
                    <Ionicons
                        name="trash-outline"
                        size={24}
                        color={isDeleteMode ? "#FF4D4D" : "#FFF"}
                    />
                </TouchableOpacity>
            </View>

            <Text style={styles.title}>Journey Team</Text>

            <FlatList
                data={MOCK_TEAM}
                keyExtractor={item => item.id}
                renderItem={renderMember}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
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
                visible={deleteModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setDeleteModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setDeleteModalVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={styles.modalContent}>
                                <View style={styles.modalIndicator} />
                                <Text style={styles.modalTitle}>
                                    Are you sure want to delete Co-Host/ Manager from your team?
                                </Text>
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={styles.cancelButton}
                                        onPress={() => setDeleteModalVisible(false)}
                                    >
                                        <Text style={styles.cancelButtonText}>Cancel</Text>
                                    </TouchableOpacity>
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
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    title: {
        fontSize: 32,
        color: '#FFF',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
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
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    roleText: {
        color: '#9BA1A6',
        fontSize: 16,
    },
    separator: {
        height: 1,
        backgroundColor: '#2C2E33',
    },
    footer: {
        padding: 24,
        paddingBottom: 40,
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
        fontSize: 18,
        fontWeight: 'bold',
    },
    deleteButton: {
        height: 56,
        backgroundColor: '#FF4D4F',
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
        fontSize: 20,
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
});

export default JourneyTeamScreen;
