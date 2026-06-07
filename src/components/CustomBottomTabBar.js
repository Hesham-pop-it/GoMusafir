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
import { Typography } from '../constants/Typography';
import { useState } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
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
    const [isRequesting, setIsRequesting] = useState(false);

    const handleFabPress = async () => {
        setIsRequesting(true);
        try {
            const requestLink = httpsCallable(functions, 'requestTripLink');
            await requestLink();
            setEmailModalVisible(true);
        } catch (error) {
            console.warn("Failed to request trip link:", error);
            Alert.alert("Link Request Failed", error.message || "Please try again later.");
        } finally {
            setIsRequesting(false);
        }
    };

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
                    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <Path d="M4.7274 7.81524C6.3561 6.64735 7.98479 5.47945 9.61349 4.32246C10.1944 3.90769 10.8663 3.22005 11.5383 2.94718C12.2672 2.65247 13.0645 3.42744 13.6226 3.83129L19.1921 7.81524C19.9438 8.35008 20.388 8.97223 20.4107 9.9C20.4335 10.7404 20.4107 11.5809 20.4107 12.4213V19.3851C20.4107 20.171 20.4449 21.3934 19.4426 21.6336C18.9757 21.7427 18.3265 21.6336 17.8481 21.6336H6.95974C6.28776 21.6336 5.593 21.7318 5.00074 21.3825C3.95291 20.7713 3.99847 19.6907 3.99847 18.6865V14.9209C3.99847 13.5674 3.99847 12.203 3.99847 10.8496C3.99847 9.82359 3.79346 8.56837 4.70462 7.82616C5.45632 7.20401 3.61123 7.38956 3.24676 7.69518C2.29004 8.48105 2.1192 9.34333 2.1192 10.4676V14.0695C2.1192 15.4557 2.1192 16.8419 2.1192 18.2281C2.1192 18.9267 2.03947 19.6689 2.13059 20.3565C2.46088 22.8997 5.67273 22.4522 7.58616 22.4522H16.1738C18.2126 22.4522 21.265 22.7578 22.1306 20.4547C22.3811 19.7671 22.2672 18.8939 22.2672 18.1735V10.3148C22.2672 9.33242 22.3356 8.39374 21.5269 7.61877C20.9347 7.0512 20.1374 6.60368 19.4654 6.12342L15.9802 3.63482C15.1943 3.07816 14.3401 2.28137 13.3606 2.07398C11.8344 1.76836 10.5588 2.45601 9.39709 3.28554C7.34698 4.74814 5.29687 6.21074 3.24676 7.68426C2.92786 7.91348 3.04175 8.08812 3.38343 8.16452C3.77068 8.25184 4.38571 8.05537 4.70462 7.82616L4.7274 7.81524Z" fill={activeRoute === 'Home' ? "#FFF" : "#A1A1AA"} />
                        <Path d="M10.1402 21.7082V19.1213C10.1402 18.1826 10.0035 17.113 10.4591 16.2507C10.63 15.9233 10.8919 15.6176 11.1994 15.3993C11.3247 15.312 11.4158 15.2684 11.5069 15.2356C11.6322 15.181 11.5867 15.2029 11.712 15.192C12.4637 15.1483 13.1926 15.5631 13.6823 16.087C14.4682 16.9493 14.3885 18.0408 14.3885 19.0995V22.112C14.3885 22.494 16.2564 22.2103 16.2564 21.6318V18.7175C16.2564 18.3136 16.2564 17.8989 16.2564 17.495C16.2564 16.72 15.9489 15.9887 15.4022 15.4103C13.9329 13.8603 11.1197 14.1441 9.54796 15.4103C8.80764 15.9997 8.32928 16.8183 8.27233 17.746C8.24955 18.1062 8.27233 18.4664 8.27233 18.8157V22.1775C8.27233 22.5595 10.1402 22.2757 10.1402 21.6973V21.7082Z" fill={activeRoute === 'Home' ? "#FFF" : "#A1A1AA"} />
                    </Svg>
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
                    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <Path d="M11.9831 15.1797C13.66 15.1797 15.2155 15.5431 16.1658 17.0615C16.9576 18.3191 16.7342 19.9307 16.7341 21.3467C16.7341 21.8218 15.2068 22.055 15.2068 21.7568C15.2068 20.3409 15.4673 18.7759 14.6384 17.4717C13.8093 16.1674 12.4954 15.8594 11.0701 15.8594H7.02709C6.66376 15.8594 6.28105 15.8319 5.91772 15.8691C4.94914 15.9532 4.19511 16.8194 3.83178 17.667C3.35669 18.7755 3.54269 20.145 3.54272 21.3281C3.54272 21.8033 2.0144 22.0364 2.0144 21.7383C2.01439 20.0521 1.80947 18.2444 2.94604 16.8936C4.08262 15.5428 5.81602 15.1797 7.49291 15.1797H11.9831ZM18.1599 15.1797C18.9797 15.189 19.8001 15.4219 20.4802 15.8877C21.5514 16.605 22.1657 17.8254 22.1658 19.1016V21.3379C22.1654 21.8127 20.6397 22.0455 20.6384 21.748V20.415C20.6384 19.9307 20.6665 19.4277 20.6013 18.9434C20.3684 17.2293 18.9243 15.8694 17.1824 15.8506C16.8656 15.8506 16.8562 15.6271 17.0798 15.4688C17.3872 15.2546 17.7874 15.1797 18.1599 15.1797ZM15.1033 2C16.3329 2.01863 17.5163 2.41914 18.4665 3.21094C20.0875 4.56177 20.6184 6.90945 19.78 8.83789C18.8764 10.9153 16.7154 12.0803 14.5076 12.1084C14.2375 12.1177 13.9204 11.9498 14.0876 11.6426C14.2646 11.3258 14.7591 11.2227 15.0945 11.2227C17.2557 11.1945 18.737 9.04257 18.6345 7.01172C18.5318 4.81337 16.7432 2.93144 14.5076 2.90332L14.5164 2.88477C14.2462 2.88468 13.9204 2.7263 14.0974 2.41895C14.2745 2.11177 14.7773 2.00005 15.1033 2ZM5.19994 3.99219C6.64396 2.31553 9.14046 1.57104 11.2644 2.25098C13.286 2.89378 14.7207 4.71921 14.7488 6.85254C14.7489 6.86168 14.7474 6.87088 14.7468 6.87988C14.7532 6.90619 14.7585 6.93438 14.7585 6.96484C14.7211 9.47063 12.7648 11.4827 10.3708 11.9766C8.23742 12.4144 5.86087 11.5852 4.74291 9.76855C3.62519 7.95194 3.75602 5.66901 5.19994 3.99219ZM10.0349 3.01465C8.45116 2.61408 6.96072 3.34093 6.13158 4.71973C5.22811 6.22887 5.37673 8.23163 6.46655 9.61035C7.42605 10.8307 9.12183 11.5855 10.6589 11.0547C12.2891 10.4958 13.1929 8.80019 13.2117 7.15137H13.2156C13.1429 5.26405 11.9262 3.48976 10.0349 3.01465Z" fill={activeRoute === 'Participants' ? "#FFF" : "#A1A1AA"} />
                    </Svg>
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
                onPress={handleFabPress}
                disabled={isRequesting}
            >
                <LinearGradient
                    colors={['#523631', '#C9A443']} // Custom Brown-Gold Gradient
                    locations={[0, 0.76]} // Matches stops 0% and 76% from screenshot
                    style={styles.fab}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                >
                    {isRequesting ? (
                        <ActivityIndicator color="#23272A" />
                    ) : (
                        <Svg width="31" height="31" viewBox="0 0 31 31" fill="none">
                            <Path d="M15.2832 0C16.4701 9.97129e-05 17.4326 0.962519 17.4326 2.14941V13.1338H28.417C29.6039 13.1339 30.5664 14.0963 30.5664 15.2832C30.5663 16.47 29.6038 17.4325 28.417 17.4326H17.4326V28.417C17.4325 29.6038 16.47 30.5663 15.2832 30.5664C14.0963 30.5664 13.1339 29.6039 13.1338 28.417V17.4326H2.14941C0.962519 17.4326 9.97132e-05 16.4701 0 15.2832C0 14.0962 0.962458 13.1338 2.14941 13.1338H13.1338V2.14941C13.1338 0.962458 14.0962 0 15.2832 0Z" fill="#23272A" />
                        </Svg>
                    )}
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
        fontFamily: Typography.sans.bold,
    },
    fabPlaceholder: {
        width: 80,
    },
    fabContainer: {
        position: 'absolute',
        alignSelf: 'center',

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
