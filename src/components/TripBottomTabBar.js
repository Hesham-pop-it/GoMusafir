
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const TripBottomTabBar = ({ activeRoute, tripData }) => {
    const navigation = useNavigation();

    const isActive = (route) => activeRoute === route;
    const getColor = (route) => isActive(route) ? "#B99A4A" : "#9BA1A6";
    const getIcon = (route, iconName) => isActive(route) ? iconName.replace('-outline', '') : iconName; // Simple toggle if outline exists

    return (
        <SafeAreaView edges={['bottom']} style={styles.safeArea}>
            <View style={styles.tripBottomNav}>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => navigation.navigate('LiveLocation', { trip: tripData })}
                >
                    <Ionicons
                        name={isActive('LiveLocation') ? "location" : "location-outline"}
                        size={24}
                        color={getColor('LiveLocation')}
                    />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => navigation.navigate('VoiceChat', { trip: tripData })}
                >
                    <Ionicons
                        name={isActive('VoiceChat') ? "mic" : "mic-outline"}
                        size={24}
                        color={getColor('VoiceChat')}
                    />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => navigation.navigate('TripOverview', { trip: tripData })}
                >
                    <Ionicons
                        name={isActive('TripOverview') ? "home" : "home-outline"}
                        size={24}
                        color={getColor('TripOverview')}
                    />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => navigation.navigate('TripChat', { trip: tripData })}
                >
                    <Ionicons
                        name={isActive('TripChat') ? "chatbubble" : "chatbubble-outline"}
                        size={24}
                        color={getColor('TripChat')}
                    />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => navigation.navigate('TripSettings', { trip: tripData })}
                >
                    <Ionicons
                        name={isActive('TripSettings') ? "settings" : "settings-outline"}
                        size={24}
                        color={getColor('TripSettings')}
                    />
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#1A1E21', // Matches nav bar color
    },
    tripBottomNav: {
        bottom: 0,
        left: 0,
        right: 0,
        height: 70,
        backgroundColor: '#1A1E21',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: 10
    },
    navItem: {
        padding: 10,
    },
});

export default TripBottomTabBar;
