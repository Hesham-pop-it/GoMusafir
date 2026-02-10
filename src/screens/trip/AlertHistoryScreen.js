import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Image,
    Dimensions,
} from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import GlowBackground from '../../components/GlowBackground';

const { width } = Dimensions.get('window');

const InfoIcon = ({ size = 24 }) => (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <Path d="M14 4C19.5228 4 24 8.47715 24 14C24 19.5228 19.5228 24 14 24C8.47715 24 4 19.5228 4 14C4 8.47715 8.47715 4 14 4ZM14 5.66699C9.39763 5.66699 5.66699 9.39763 5.66699 14C5.66699 18.6024 9.39763 22.333 14 22.333C18.6024 22.333 22.333 18.6024 22.333 14C22.333 9.39763 18.6024 5.66699 14 5.66699ZM14.833 19.417H13.167V12.75H14.833V19.417ZM14.833 9.41699V11.083H13.167V9.41699H14.833Z" fill="#B99A4A" />
    </Svg>
);

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
                <InfoIcon />
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
        <GlowBackground>
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
        backgroundColor: '#23272A',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#2C2E33',
        alignItems: 'center',
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
        color: '#fff',
        fontSize: 13,
    },
    timeText: {
        color: '#fff',
        fontSize: 12,
    },
});

export default AlertHistoryScreen;
