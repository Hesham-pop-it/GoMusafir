import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const ALERT_DATA = [
    {
        id: '1',
        title: 'Bus Departure: The bus for the city tour will depart in 30 minutes.',
        sender: 'Ethan Carter',
        senderImage: 'https://randomuser.me/api/portraits/men/32.jpg',
        time: '18:00 - 12/12/2025'
    },
    {
        id: '2',
        title: 'Bus Departure: The bus for the city tour will depart in 30 minutes.',
        sender: 'Ethan Carter',
        senderImage: 'https://randomuser.me/api/portraits/men/32.jpg',
        time: '18:00 - 12/12/2025'
    },
    {
        id: '3',
        title: 'Bus Departure: The bus for the city tour will depart in 30 minutes.',
        sender: 'Ethan Carter',
        senderImage: 'https://randomuser.me/api/portraits/men/32.jpg',
        time: '18:00 - 12/12/2025'
    },
    {
        id: '4',
        title: 'Bus Departure: The bus for the city tour will depart in 30 minutes.',
        sender: 'Ethan Carter',
        senderImage: 'https://randomuser.me/api/portraits/men/32.jpg',
        time: '18:00 - 12/12/2025'
    },
    {
        id: '5',
        title: 'Bus Departure: The bus for the city tour will depart in 30 minutes.',
        sender: 'Ethan Carter',
        senderImage: 'https://randomuser.me/api/portraits/men/32.jpg',
        time: '18:00 - 12/12/2025'
    },
    {
        id: '6',
        title: 'Bus Departure: The bus for the city tour will depart in 30 minutes.',
        sender: 'Ethan Carter',
        senderImage: 'https://randomuser.me/api/portraits/men/32.jpg',
        time: '18:00 - 12/12/2025'
    },
];

const AlertHistoryScreen = () => {
    const navigation = useNavigation();

    const renderAlertItem = ({ item }) => (
        <View style={styles.alertCard}>
            <View style={styles.iconContainer}>
                <Ionicons name="information-outline" size={24} color="#B99A4A" />
            </View>
            <View style={styles.contentContainer}>
                <Text style={styles.alertTitle}>{item.title}</Text>
                <View style={styles.senderContainer}>
                    <Image source={{ uri: item.senderImage }} style={styles.avatar} />
                    <Text style={styles.senderName}>{item.sender}</Text>
                </View>
                <Text style={styles.timeText}>{item.time}</Text>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Alert History</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={ALERT_DATA}
                renderItem={renderAlertItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
            />
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
    headerTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
        textAlign: 'center',
    },
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
    },
    alertCard: {
        backgroundColor: '#1E2124',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#2C2E33',
    },
    iconContainer: {
        marginRight: 15,
        marginTop: 2,
    },
    contentContainer: {
        flex: 1,
    },
    alertTitle: {
        color: '#FFF',
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 12,
        fontWeight: '500',
    },
    senderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    avatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        marginRight: 8,
    },
    senderName: {
        color: '#9BA1A6',
        fontSize: 13,
    },
    timeText: {
        color: '#636D77',
        fontSize: 12,
    },
});

export default AlertHistoryScreen;
