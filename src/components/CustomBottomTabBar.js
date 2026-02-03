import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import { useState } from 'react';
import EmailConfirmationModal from './EmailConfirmationModal';

const { width } = Dimensions.get('window');

const TabBarBackground = ({ width, height }) => {
    const center = width / 2;
    const scoopRadius = 51; // Increased for larger button
    const scoopDepth = 50;   // Deeper scoop for larger button

    const d = `
        M0,0
        L${center - scoopRadius - 15},0
        C${center - scoopRadius + 5},0 ${center - 50},${scoopDepth} ${center},${scoopDepth}
        C${center + 50},${scoopDepth} ${center + scoopRadius - 5},0 ${center + scoopRadius + 15},0
        L${width},0
        L${width},${height}
        L0,${height}
        Z
    `;

    return (
        <Svg width={width} height={height}>
            <Path d={d} fill="#23272A" />
        </Svg>
    );
};

// #23252A seems to match the dark grey in the screenshot better than #292B30

const CustomBottomTabBar = ({ state, navigation }) => {
    const insets = useSafeAreaInsets();
    // state.index isn't directly available if we aren't using a real tab navigator, 
    // but here we are manual. match activeRoute logic from usage.
    // Actually, to make this reusable for manual usage in HomeScreen/ParticipantsScreen:
    // We'll pass `activeRoute` name.

    const activeRoute = state; // 'Home' or 'Participants'
    const [emailModalVisible, setEmailModalVisible] = useState(false);

    return (
        <View style={[styles.bottomNavWrapper, { height: 80 + insets.bottom }]}>
            <View style={styles.svgContainer}>
                <TabBarBackground width={width} height={80 + insets.bottom} />
            </View>

            <View style={[styles.navItemsContainer, { paddingBottom: insets.bottom }]}>
                {/* Home Tab */}
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => navigation.navigate('Home')}
                    activeOpacity={0.8}
                >
                    <Ionicons
                        name={activeRoute === 'Home' ? "home" : "home-outline"}
                        size={24}
                        color={activeRoute === 'Home' ? "#FFF" : "#A1A1AA"}
                    />
                    <Text style={[
                        styles.navText,
                        { color: activeRoute === 'Home' ? "#FFF" : "#A1A1AA" }
                    ]}>
                        Home
                    </Text>
                </TouchableOpacity>

                {/* Spacer for FAB */}
                <View style={styles.fabPlaceholder} />

                {/* Participant Tab */}
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => navigation.navigate('Participants')}
                    activeOpacity={0.8}
                >
                    <Ionicons
                        name={activeRoute === 'Participants' ? "people" : "people-outline"}
                        size={24}
                        color={activeRoute === 'Participants' ? "#FFF" : "#A1A1AA"}
                    />
                    <Text style={[
                        styles.navText,
                        { color: activeRoute === 'Participants' ? "#FFF" : "#A1A1AA" }
                    ]}>
                        Participant
                    </Text>
                </TouchableOpacity>
            </View>

            {/* FAB */}
            <TouchableOpacity
                style={[styles.fabContainer, { bottom: 40 + insets.bottom }]}
                activeOpacity={0.9}
                onPress={() => setEmailModalVisible(true)}
            >
                <LinearGradient
                    colors={['#523631', '#C9A443']} // Custom Brown-Gold Gradient
                    locations={[0, 0.76]} // Matches stops 0% and 76% from screenshot
                    style={styles.fab}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <Ionicons name="add" size={42} color="#1A1C1E" />
                </LinearGradient>
            </TouchableOpacity>

            <EmailConfirmationModal
                visible={emailModalVisible}
                onClose={() => setEmailModalVisible(false)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    bottomNavWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        justifyContent: 'flex-end',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: -4,
        },
        shadowOpacity: 0.1,
        elevation: 10,
    },
    svgContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    navItemsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 40, // Increased spacing from edge
        height: '100%',
        paddingTop: 10,
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 50,
        width: 70,
    },
    navText: {
        fontSize: 12, // Slightly bigger and cleaner
        marginTop: 4,
        fontWeight: 'bold',
    },
    fabPlaceholder: {
        width: 80,
    },
    fabContainer: {
        position: 'absolute',
        alignSelf: 'center',
        shadowColor: 'rgba(212, 175, 55, 0.4)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.6,
        shadowRadius: 10,
        elevation: 8,
    },
    fab: {
        width: 75,
        height: 75,
        borderRadius: 37.5,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
});

export default CustomBottomTabBar;
