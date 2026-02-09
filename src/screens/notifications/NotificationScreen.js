import React, { useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    StatusBar,
    Platform
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import * as NavigationBar from 'expo-navigation-bar';

const NOTIFICATIONS_DATA = [
    {
        id: '1',
        title: 'Your trip has started',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
        seen: false, // Unseen -> Highlighted
    },
    {
        id: '2',
        title: 'Your trip has started',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
        seen: true,
    },
    {
        id: '3',
        title: 'Your trip has started',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
        seen: true,
    },
    {
        id: '4',
        title: 'Your trip has started',
        description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
        seen: true,
    },
];

const NotificationScreen = ({ navigation }) => {
    // If using AppRootLayout, we might not need to manually handle insets for the bottom if the layout handles it,
    // but usually Detail screens should just respect safe area.

    const rendernotificationItem = ({ item }) => (
        <View style={[styles.card, !item.seen && styles.cardUnseen]}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardDescription}>{item.description}</Text>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
                <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} translucent />

                {/* Header */}
                {/* Header */}
                <View style={styles.headerContainer}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Notification</Text>
                </View>

                <FlatList
                    data={NOTIFICATIONS_DATA}
                    renderItem={rendernotificationItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    headerContainer: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 34, // Larger title
        color: '#FFF',
        fontFamily: 'CormorantGaramond_700Bold',
        marginTop: 15,
    },
    backButton: {
        alignSelf: 'flex-start',
        padding: 4,
        marginLeft: -4, // Align icon visually
    },
    listContent: {
        padding: 20,
    },
    card: {
        // backgroundColor: '#1E2023', // Very Dark for seen
        borderRadius: 16,
        borderBottomColor: 'rgba(255, 255, 255, 0.5)',
        borderStartColor: Colors.dark.background,
        borderEndColor: Colors.dark.background,
        borderEndWidth: 0.5,
        borderStartWidth: 0.5,
        padding: 20,
        marginBottom: 16,
        borderBottomWidth: 1,
    },
    cardUnseen: {
        backgroundColor: '#333333', // Lighter for unseen/highlighted
        borderStartColor: '#333333',
        borderEndColor: '#333333',
        borderBottomColor: 'rgba(255, 255, 255, 0.5)',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#F4F4F5',
        marginBottom: 8,
    },
    cardDescription: {
        fontSize: 13,
        color: '#A1A1AA', // Grey description
        lineHeight: 20,
        fontFamily: 'IBM Plex Sans_400Regular'
    },
});

export default NotificationScreen;
