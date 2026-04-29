import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Image,
    ScrollView,
    Linking,
    PanResponder,
    Animated,
    TextInput,
    Alert,
    ActivityIndicator,
} from 'react-native';
import Modal from 'react-native-modal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import { Typography } from '../../constants/Typography';
import { database, auth } from '../../config/firebase';
import { ref, onValue, set, off, serverTimestamp, get, remove } from 'firebase/database';

const { width, height } = Dimensions.get('window');

const PeopleIcon = ({ color = "#FFF", size = 20 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M11.9831 15.1797C13.66 15.1797 15.2155 15.5431 16.1658 17.0615C16.9576 18.3191 16.7342 19.9307 16.7341 21.3467C16.7341 21.8218 15.2068 22.055 15.2068 21.7568C15.2068 20.3409 15.4673 18.7759 14.6384 17.4717C13.8093 16.1674 12.4954 15.8594 11.0701 15.8594H7.02709C6.66376 15.8594 6.28105 15.8319 5.91772 15.8691C4.94914 15.9532 4.19511 16.8194 3.83178 17.667C3.35669 18.7755 3.54269 20.145 3.54272 21.3281C3.54272 21.8033 2.0144 22.0364 2.0144 21.7383C2.01439 20.0521 1.80947 18.2444 2.94604 16.8936C4.08262 15.5428 5.81602 15.1797 7.49291 15.1797H11.9831ZM18.1599 15.1797C18.9797 15.189 19.8001 15.4219 20.4802 15.8877C21.5514 16.605 22.1657 17.8254 22.1658 19.1016V21.3379C22.1654 21.8127 20.6397 22.0455 20.6384 21.748V20.415C20.6384 19.9307 20.6665 19.4277 20.6013 18.9434C20.3684 17.2293 18.9243 15.8694 17.1824 15.8506C16.8656 15.8506 16.8562 15.6271 17.0798 15.4688C17.3872 15.2546 17.7874 15.1797 18.1599 15.1797ZM15.1033 2C16.3329 2.01863 17.5163 2.41914 18.4665 3.21094C20.0875 4.56177 20.6184 6.90945 19.78 8.83789C18.8764 10.9153 16.7154 12.0803 14.5076 12.1084C14.2375 12.1177 13.9204 11.9498 14.0876 11.6426C14.2646 11.3258 14.7591 11.2227 15.0945 11.2227C17.2557 11.1945 18.737 9.04257 18.6345 7.01172C18.5318 4.81337 16.7432 2.93144 14.5076 2.90332L14.5164 2.88477C14.2462 2.88468 13.9204 2.7263 14.0974 2.41895C14.2745 2.11177 14.7773 2.00005 15.1033 2ZM5.19994 3.99219C6.64396 2.31553 9.14046 1.57104 11.2644 2.25098C13.286 2.89378 14.7207 4.71921 14.7488 6.85254C14.7489 6.86168 14.7474 6.87088 14.7468 6.87988C14.7532 6.90619 14.7585 6.93438 14.7585 6.96484C14.7211 9.47063 12.7648 11.4827 10.3708 11.9766C8.23742 12.4144 5.86087 11.5852 4.74291 9.76855C3.62519 7.95194 3.75602 5.66901 5.19994 3.99219ZM10.0349 3.01465C8.45116 2.61408 6.96072 3.34093 6.13158 4.71973C5.22811 6.22887 5.37673 8.23163 6.46655 9.61035C7.42605 10.8307 9.12183 11.5855 10.6589 11.0547C12.2891 10.4958 13.1929 8.80019 13.2117 7.15137H13.2156C13.1429 5.26405 11.9262 3.48976 10.0349 3.01465Z" fill={color} />
    </Svg>
);

const SafetyIcon = ({ color = "white", size = 24 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M12 2C10.4889 2.0217 9.03999 2.5964 7.93501 3.61236C6.83003 4.62832 6.14795 6.01292 6.0214 7.49693C5.89485 8.98094 6.33287 10.4583 7.2503 11.6417C8.16773 12.8252 9.49898 13.6301 10.9852 13.9V21C10.9852 21.2652 11.0921 21.5196 11.2824 21.7071C11.4727 21.8946 11.7309 22 12 22C12.2691 22 12.5273 21.8946 12.7176 21.7071C12.9079 21.5196 13.0148 21.2652 13.0148 21V13.9C14.501 13.6301 15.8323 12.8252 16.7497 11.6417C17.6671 10.4583 18.1052 8.98094 17.9786 7.49693C17.8521 6.01292 17.17 4.62832 16.065 3.61236C14.96 2.5964 13.5111 2.0217 12 2ZM12 10C11.5986 10 11.2062 9.8827 10.8724 9.66294C10.5387 9.44318 10.2785 9.13082 10.1249 8.76537C9.97131 8.39991 9.93112 7.99778 10.0094 7.60982C10.0877 7.22186 10.281 6.86549 10.5649 6.58579C10.8487 6.30608 11.2104 6.1156 11.6041 6.03843C11.9977 5.96126 12.4058 6.00087 12.7767 6.15224C13.1475 6.30362 13.4645 6.55996 13.6875 6.88886C13.9105 7.21776 14.0296 7.60444 14.0296 8C14.0296 8.53043 13.8157 9.03914 13.4351 9.41421C13.0545 9.78929 12.5383 10 12 10Z" fill={color} />
    </Svg>
);

const HideLocationIcon = ({ color = "#B99A4A", size = 26 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M5.41406 8.62891C5.00054 10.1995 5.07135 11.8789 5.41113 13.4863C6.29736 17.633 8.99142 20.7111 12.6211 22.6631C14.4257 21.6371 15.9732 20.3203 17.1523 18.7295L18.1836 19.6162C17.3965 20.5582 16.4839 21.4017 15.4658 22.1162C14.5962 22.7249 12.8134 24.0832 11.6504 23.7246C10.129 23.268 8.55265 21.9745 7.44434 20.8877C4.40119 17.9097 2.52031 12.8124 3.65039 8.79102C3.77533 8.34731 3.93422 7.92239 4.12305 7.51855L5.41406 8.62891ZM5.86816 4.06543L6.43652 4.55469C8.15713 3.12791 10.4063 2.31712 12.7012 2.25977L12.7373 2.25879C12.7824 2.25733 12.8264 2.25811 12.8682 2.26172C17.6493 2.41796 21.5188 6.11447 21.4326 11.0078C21.4001 12.8896 20.9681 14.7225 20.2051 16.4023L23.8047 19.5L23.1543 20.2549L22.5 21.0156L18.7959 17.8281L17.7178 16.9004L13.7578 13.4941L12.7227 12.6025L9.89648 10.1709L8.25391 8.75781L5.75977 6.61133L4.61133 5.62305L1.30273 2.77637L1 2.51562L2.30469 1L5.86816 4.06543ZM12.0195 3.21484C10.2021 3.25513 8.53089 4.06153 7.30371 5.30078L9.3418 7.05469L9.95215 7.58008C11.1323 6.81595 12.6974 6.58054 14.0098 7.04297C15.558 7.59433 16.5678 8.95289 16.6367 10.583C16.6411 10.6013 16.6441 10.6207 16.6465 10.6406C16.6489 10.6613 16.6504 10.6836 16.6504 10.7061C16.6381 11.472 16.3939 12.1761 15.9912 12.7754L18.6602 15.0723L18.9424 15.3154C19.1774 14.6231 19.3581 13.8974 19.4756 13.1387C19.8564 10.7366 19.4868 8.21442 18.0518 6.3125C16.6172 4.41079 14.4109 3.26929 12.0312 3.21484H12.0195ZM12.5381 14.7588C11.007 14.8793 9.39343 14.229 8.60742 12.9121C8.23269 12.2844 8.05518 11.5933 8.06348 10.9082L12.5381 14.7588ZM12.542 8.03223C12.2923 7.97795 12.0852 7.97818 11.8135 8.01074C11.7688 8.01111 11.5877 8.043 11.7373 8.01074L11.6611 8.02539C11.6281 8.03269 11.5941 8.0417 11.5635 8.05371C11.5568 8.05492 11.5164 8.07033 11.4775 8.08496L11.4199 8.10645C11.3772 8.12863 11.3343 8.1451 11.292 8.16211C11.1794 8.21841 11.0401 8.30313 10.9082 8.40234L14.4453 11.4463L14.752 11.71C14.8097 11.4907 14.8436 11.2641 14.8535 11.0312C14.8414 10.9891 14.835 10.942 14.835 10.8906C14.8133 9.55383 13.8461 8.30393 12.542 8.03223Z" fill={color} />
    </Svg>
);

const CrosshairsIcon = ({ color = "#B99A4A", size = 26 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path d="M11 5.07C9.50411 5.28638 8.11833 5.9808 7.04956 7.04956C5.9808 8.11833 5.28638 9.50411 5.07 11H7V13H5.07C5.28561 14.4962 5.97978 15.8824 7.04868 16.9513C8.11759 18.0202 9.50379 18.7144 11 18.93V17H13V18.93C14.4962 18.7144 15.8824 18.0202 16.9513 16.9513C18.0202 15.8824 18.7144 14.4962 18.93 13H17V11H18.93C18.7144 9.50379 18.0202 8.11759 16.9513 7.04868C15.8824 5.97978 14.4962 5.28561 13 5.07V7H11V5.07ZM3.055 11C3.28241 8.97114 4.19257 7.07978 5.63618 5.63618C7.07978 4.19257 8.97114 3.28241 11 3.055V1H13V3.055C15.0289 3.28241 16.9202 4.19257 18.3638 5.63618C19.8074 7.07978 20.7176 8.97114 20.945 11H23V13H20.945C20.7176 15.0289 19.8074 16.9202 18.3638 18.3638C16.9202 19.8074 15.0289 20.7176 13 20.945V23H11V20.945C8.97114 20.7176 7.07978 19.8074 5.63618 18.3638C4.19257 16.9202 3.28241 15.0289 3.055 13H1V11H3.055ZM15 12C15 12.7956 14.6839 13.5587 14.1213 14.1213C13.5587 14.6839 12.7956 15 12 15C11.2044 15 10.4413 14.6839 9.87868 14.1213C9.31607 13.5587 9 12.7956 9 12C9 11.2044 9.31607 10.4413 9.87868 9.87868C10.4413 9.31607 11.2044 9 12 9C12.7956 9 13.5587 9.31607 14.1213 9.87868C14.6839 10.4413 15 11.2044 15 12Z" fill={color} />
    </Svg>
);

const LocationPinIcon = ({ color = "#FFF", size = 28 }) => (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <Path d="M14.085 3.5C14.136 3.49841 14.1852 3.5011 14.2314 3.50586C19.0059 3.66966 22.8664 7.36166 22.7803 12.25C22.7042 16.6737 20.422 20.8259 16.8135 23.3584C15.944 23.9671 14.161 25.3255 12.998 24.9668C11.4764 24.5103 9.9006 23.2167 8.79199 22.1299C5.74876 19.1519 3.86884 14.0547 4.99902 10.0332C6.12939 6.01172 10.0417 3.587 14.085 3.5ZM13.3682 4.45703C10.9009 4.51138 8.70523 5.97909 7.52051 8.02246C6.33592 10.0658 6.28155 12.4679 6.75977 14.7285C7.64548 18.8751 10.3389 21.9524 13.9688 23.9043C17.5813 21.8505 20.1646 18.6316 20.8242 14.3799C21.2045 11.9781 20.8349 9.4566 19.4004 7.55469C17.9657 5.6527 15.7591 4.51147 13.3789 4.45703H13.3896C13.3868 4.45698 13.3837 4.45612 13.3809 4.45605C13.3766 4.4561 13.3723 4.45703 13.3682 4.45703ZM10.3789 9.62207C11.5419 8.25258 13.6619 7.68736 15.3574 8.28516C16.9013 8.83523 17.9072 10.188 17.9805 11.8125C17.9918 11.8534 17.998 11.8988 17.998 11.9482C17.9652 13.9805 16.3026 15.5778 14.3682 15.9365C12.7052 16.2517 10.8246 15.6107 9.95508 14.1543C9.08559 12.6979 9.28124 10.9046 10.3789 9.62207ZM13.8896 9.27441C13.6397 9.22007 13.4329 9.21935 13.1611 9.25195C13.1172 9.2521 12.9337 9.28439 13.085 9.25195C13.0307 9.2628 12.9654 9.2742 12.9111 9.2959C12.8963 9.29761 12.6302 9.4036 12.8027 9.32812C12.7484 9.36073 12.694 9.38256 12.6396 9.4043C12.4658 9.49124 12.2266 9.6435 12.0527 9.81738C11.8571 10.0022 11.7046 10.1984 11.5742 10.4375C10.9767 11.4917 11.1077 12.828 11.8467 13.7734C12.1945 14.2191 12.6724 14.5782 13.2158 14.7412C13.4658 14.8281 13.7706 14.8604 13.9336 14.8604C14.0202 14.8495 14.0961 14.8389 14.1719 14.8389C14.1543 14.8383 14.4538 14.7958 14.3242 14.8174C14.2712 14.8279 14.6821 14.7091 14.6182 14.7305C14.8246 14.6544 14.9874 14.5668 15.2373 14.3604C15.145 14.4321 15.3333 14.2719 15.3457 14.2627C15.3892 14.2192 15.4224 14.1763 15.4658 14.1328C15.5528 14.0459 15.6174 13.9473 15.6826 13.8604C16.0144 13.3778 16.1774 12.8397 16.2002 12.2627C16.1898 12.2232 16.1826 12.1802 16.1826 12.1328C16.1609 10.7959 15.1939 9.54617 13.8896 9.27441Z" fill={color} />
    </Svg>
);

// Mock participant locations
const MOCK_PARTICIPANTS = [
    {
        id: '1',
        name: 'Ethan Carter',
        avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
        latitude: 37.78825,
        longitude: -122.4324,
    },
    {
        id: '2',
        name: 'Sophia Bennett',
        avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
        latitude: 37.78925,
        longitude: -122.4314,
    },
];

const LiveLocationScreen = () => {
    const navigation = useNavigation();
    const mapRef = useRef(null);
    const route = useRoute();
    const { trip, isAdmin: passedIsAdmin } = route.params || {};
    const [isAdmin, setIsAdmin] = useState(passedIsAdmin !== undefined ? passedIsAdmin : (trip?.isAdmin !== undefined ? trip.isAdmin : false));
    const tripId = trip?.id || trip?.tripId;
    const orgId = trip?.orgId || trip?.org_id;

    const [userLocation, setUserLocation] = useState(null);
    const [participants, setParticipants] = useState({});
    const [selectedMarker, setSelectedMarker] = useState(null);
    const [isSafetyActive, setIsSafetyActive] = useState(false);
    const [safetyPoint, setSafetyPoint] = useState(null);
    const [incomingRequest, setIncomingRequest] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [mapRegion, setMapRegion] = useState({
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    });

    const [showParticipantsList, setShowParticipantsList] = useState(false);
    const [locationRequestModal, setLocationRequestModal] = useState(false);
    const [googleMapsModal, setGoogleMapsModal] = useState(false);
    const [userName, setUserName] = useState('User');
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [participantsList, setParticipantsList] = useState([]);
    const [requestSentVisible, setRequestSentVisible] = useState(false);
    const [resolvedOrgId, setResolvedOrgId] = useState(orgId);
    const [globalVisibilityConfig, setGlobalVisibilityConfig] = useState({});
    const [userRole, setUserRole] = useState('participant');
    const [locationPermissions, setLocationPermissions] = useState({});


    // Swipe down to close logic for modals - Interactive version
    const createDraggableResponder = (setter, animatedValue) => PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
            const { dy, dx } = gestureState;
            return dy > 5 && dy > Math.abs(dx);
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
            const { dy, dx } = gestureState;
            return dy > 20 && dy > Math.abs(dx);
        },
        onPanResponderMove: (_, gestureState) => {
            if (gestureState.dy > 0) {
                animatedValue.setValue(gestureState.dy);
            }
        },
        onPanResponderRelease: (_, gestureState) => {
            if (gestureState.dy > 120 || (gestureState.dy > 50 && gestureState.vy > 0.5)) {
                Animated.timing(animatedValue, {
                    toValue: height,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => {
                    setter(false);
                    animatedValue.setValue(0);
                });
            } else {
                Animated.spring(animatedValue, {
                    toValue: 0,
                    friction: 8,
                    useNativeDriver: true,
                }).start();
            }
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => true,
    });

    const panYParticipants = React.useRef(new Animated.Value(0)).current;
    const panYLocationReq = React.useRef(new Animated.Value(0)).current;
    const panYGoogleMaps = React.useRef(new Animated.Value(0)).current;
    const panYRequestSent = React.useRef(new Animated.Value(0)).current;

    const participantsSwipe = createDraggableResponder(setShowParticipantsList, panYParticipants);
    const locationRequestSwipe = createDraggableResponder(setLocationRequestModal, panYLocationReq);
    const googleMapsSwipe = createDraggableResponder(setGoogleMapsModal, panYGoogleMaps);
    const requestSentSwipe = createDraggableResponder(setRequestSentVisible, panYRequestSent);

    // Robust ID Resolution: If orgId is missing, try to find it in the user's joined_trips
    useEffect(() => {
        const resolveIds = async () => {
            if (!resolvedOrgId && tripId && auth.currentUser) {
                try {
                    const joinedTripRef = ref(database, `users/${auth.currentUser.uid}/joined_trips/${tripId}`);
                    const snap = await get(joinedTripRef);
                    if (snap.exists()) {
                        const val = snap.val();
                        const foundOrgId = val.org_id || val.orgId;
                        if (foundOrgId) {
                            setResolvedOrgId(foundOrgId);
                        }
                    } else {
                        if (trip?.orgId || trip?.org_id) {
                            setResolvedOrgId(trip.orgId || trip.org_id);
                        }
                    }
                } catch (err) {
                }
            }
        };
        resolveIds();
    }, [tripId, resolvedOrgId]);

    // Fetch Current User Name and Role
    useEffect(() => {
        const fetchUserData = async () => {
            if (auth.currentUser) {
                // 1. Fetch Profile for Name
                const myProfileRef = ref(database, `users/${auth.currentUser.uid}/profile`);
                get(myProfileRef).then((snap) => {
                    if (snap.exists()) {
                        const profile = snap.val();
                        setUserName(`${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User');
                    }
                });

                // 2. Fetch Role
                try {
                    const tokenResult = await auth.currentUser.getIdTokenResult();
                    const role = tokenResult.claims.role || 'participant';
                    setUserRole(role);
                    setIsAdmin(role === 'admin' || role === 'co-host' || role === 'manager');
                } catch (error) {
                }
            }
        };
        fetchUserData();
    }, []);

    const profileCache = useRef({});

    // 0. Fetch Global Visibility Config
    useEffect(() => {
        if (!resolvedOrgId || !tripId) return;
        const configRef = ref(database, `orgs/${resolvedOrgId}/trips/${tripId}/visibility_config`);
        const unsubscribe = onValue(configRef, (snapshot) => {
            if (snapshot.exists()) {
                setGlobalVisibilityConfig(snapshot.val());
            } else {
                setGlobalVisibilityConfig({});
            }
        });
        return () => unsubscribe();
    }, [resolvedOrgId, tripId]);
    const [hasAutoCentered, setHasAutoCentered] = useState(false);

    // Auto-center once when user location is first found
    useEffect(() => {
        if (userLocation && !hasAutoCentered && mapRef.current) {
            mapRef.current.animateToRegion({
                ...userLocation,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            }, 1000);
            setHasAutoCentered(true);
        }
    }, [userLocation, hasAutoCentered]);

    useEffect(() => {
        let locationWatcher = null;
        if (!resolvedOrgId || !tripId) {
            return;
        }

        const startTracking = async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                return;
            }

            try {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                const userCoords = {
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                };
                setUserLocation(userCoords);
                
                // Start continuous tracking - Reduced distanceInterval for better sensitivity
                locationWatcher = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.High,
                        timeInterval: 3000, 
                        distanceInterval: 5, 
                    },
                    (newLocation) => {
                        const coords = newLocation.coords;
                        const newCoords = {
                            latitude: coords.latitude,
                            longitude: coords.longitude,
                        };
                        setUserLocation(newCoords);

                        // Sync to Firebase
                        if (auth.currentUser) {
                            const uid = auth.currentUser.uid;
                            const locationRef = ref(database, `trips_active/${resolvedOrgId}/${tripId}/locations/${uid}`);
                            
                            // 1. Local Preview Update (Make it feel instant)
                            setParticipants(prev => ({
                                ...prev,
                                [uid]: { lat: coords.latitude, lng: coords.longitude, updated_at: Date.now() }
                            }));

                            // 2. Firebase Remote Update
                            set(locationRef, {
                                lat: coords.latitude,
                                lng: coords.longitude,
                                updated_at: serverTimestamp(),
                            }).then(() => {
                                // Log only occasionally or on first success
                                // console.log("[LiveLocation] Remote sync successful");
                            }).catch(err => {
                            });
                        }
                    }
                );
            } catch (err) {
            }

        };

        startTracking();

        if (resolvedOrgId && tripId) {

            let locationsRef = ref(database, `trips_active/${resolvedOrgId}/${tripId}/locations`);
            onValue(locationsRef, (snapshot) => {
                const locData = snapshot.val() || {};
                setParticipants(locData);
            });

            // Listen for Safety Point
            const safetyRef = ref(database, `trips_active/${resolvedOrgId}/${tripId}/safety_point`);
            onValue(safetyRef, (snap) => {
                setSafetyPoint(snap.val());
                setIsSafetyActive(!!snap.val());
            });

            // Listen for Incoming Requests
            if (auth.currentUser) {
                const notifRef = ref(database, `trips_active/${resolvedOrgId}/${tripId}/notifications/${auth.currentUser.uid}`);
                onValue(notifRef, (snap) => {
                    if (snap.exists()) {
                        const notifs = snap.val();
                        const latest = Object.values(notifs).sort((a,b) => b.timestamp - a.timestamp)[0];
                        if (latest && latest.type === 'location_request' && (!incomingRequest || latest.timestamp > incomingRequest.timestamp)) {
                            setIncomingRequest(latest);
                            setLocationRequestModal(true);
                        }
                    }
                });
            }

            return () => {
                if (locationWatcher) locationWatcher.remove();
                if (locationsRef) off(locationsRef);
            };
        }

        return () => {
            if (locationWatcher) locationWatcher.remove();
        };
    }, [resolvedOrgId, tripId]);

    // Listener for Location Permissions
    useEffect(() => {
        if (!resolvedOrgId || !tripId || !auth.currentUser) return;

        const myUid = auth.currentUser.uid;
        const permsRef = ref(database, `trips_active/${resolvedOrgId}/${tripId}/location_permissions`);
        
        const unsubscribe = onValue(permsRef, (snapshot) => {
            const allPerms = snapshot.val() || {};
            const myPermissions = {};
            
            // Extract permissions granted to ME
            Object.keys(allPerms).forEach(targetUid => {
                if (allPerms[targetUid] && allPerms[targetUid][myUid] === true) {
                    myPermissions[targetUid] = true;
                }
            });
            
            setLocationPermissions(myPermissions);
        });

        return () => unsubscribe();
    }, [resolvedOrgId, tripId]);

    // Fetch Trip Participants Profile Data - UID Targeted & Cached
    useEffect(() => {
        const uidsToFetch = Object.keys(participants);
        if (uidsToFetch.length === 0 || !tripId) return;

        uidsToFetch.forEach(async (uid) => {
            // Skip if already in cache and not forced (or just once per session)
            if (profileCache.current[uid]) return;

            try {
                const profileRef = ref(database, `users/${uid}/profile`);
                const nameRef = ref(database, `users/${uid}/full_name`);
                const visibilityRef = ref(database, `users/${uid}/participant_visibility/${tripId}`);
                
                const [userSnap, nameSnap, visSnap] = await Promise.all([
                    get(profileRef),
                    get(nameRef),
                    get(visibilityRef)
                ]);

                const profile = userSnap.val() || {};
                const fullName = nameSnap.val();
                const visibility = visSnap.val() || {};
                const isCurrentUser = uid === auth.currentUser?.uid;
                const amIAdmin = isAdmin;

                const canSeePII = (field) => {
                    if (isCurrentUser) return true;
                    
                    // 1. Check Global Admin Config
                    const globalSetting = globalVisibilityConfig[field] || 'Show to everyone';
                    
                    if (globalSetting === 'Do not show') return false;
                    if (globalSetting === 'Show to organizer') return amIAdmin;
                    if (globalSetting === 'Show to everyone') return true;
                    
                    // 2. If 'Custom choice', check personal choice
                    if (globalSetting === 'Custom choice') {
                        const personalSetting = visibility[field] || 'Show to organizer';
                        if (personalSetting === 'Do not show') return false;
                        if (personalSetting === 'Show to organizer') return amIAdmin;
                        if (personalSetting === 'Show to everyone') return true;
                    }
                    
                    return false;
                };

                let displayName = 'User';
                if (canSeePII('name')) {
                    if (profile.firstName || profile.lastName) {
                        displayName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
                    } else if (fullName) {
                        displayName = fullName;
                    } else if (isCurrentUser) {
                        displayName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'You';
                    }
                } else if (isCurrentUser) {
                    displayName = 'You';
                }

                const displayImage = canSeePII('photo') && profile.photoURL 
                    ? profile.photoURL 
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName[0] || 'U')}&background=B99A4A&color=fff`;

                const pData = {
                    id: uid,
                    name: displayName,
                    image: displayImage,
                    canSeeLocation: canSeePII('location'),
                    visibility: visibility
                };

                // Store in cache
                profileCache.current[uid] = pData;

                // Update state
                setParticipantsList(prev => {
                    const filtered = prev.filter(p => p.id !== uid);
                    return [...filtered, pData];
                });
            } catch (err) {
            }
        });
    }, [participants, tripId, isAdmin, globalVisibilityConfig]);


    const centerOnUser = () => {
        if (userLocation && mapRef.current) {
            mapRef.current.animateToRegion({
                ...userLocation,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
            }, 1000);
        }
    };

    const toggleSafetyPoint = async () => {
        if (!isAdmin || !userLocation || !orgId || !tripId) return;
        
        const safetyRef = ref(database, `trips_active/${orgId}/${tripId}/safety_point`);
        if (isSafetyActive) {
            await remove(safetyRef);
        } else {
            await set(safetyRef, {
                lat: userLocation.latitude,
                lng: userLocation.longitude,
                created_at: serverTimestamp(),
                by: auth.currentUser.uid
            });
        }
    };

    const checkLocationPermission = async (participant) => {
        if (!orgId || !tripId || !auth.currentUser) return false;

        const myUid = auth.currentUser.uid;
        const targetUid = participant.id;
        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';

        // 1. Check Global Setting
        const globalSetting = globalVisibilityConfig?.location || 'Show to everyone';
        
        // "Do not show" for Everyone
        if (globalSetting === 'Do not show') {
            // Need to check explicit permission
        } else if (globalSetting === 'Show to everyone') {
            return true;
        } else if (globalSetting === 'Show to organizer') {
            if (isStaff) return true;
        } else if (globalSetting === 'Custom choice') {
            const pProfile = participantsList.find(p => p.id === targetUid);
            const personalSetting = pProfile?.visibility?.location || 'Show to organizer';
            if (personalSetting === 'Show to everyone') return true;
            if (personalSetting === 'Show to organizer' && isStaff) return true;
        }

        // 2. Check explicit permission
        try {
            const permRef = ref(database, `trips_active/${orgId}/${tripId}/location_permissions/${targetUid}/${myUid}`);
            const permSnap = await get(permRef);
            return permSnap.exists() && permSnap.val() === true;
        } catch (e) {
            return false;
        }
    };

    const handleQuestionPress = async (participant) => {
        const hasPerm = await checkLocationPermission(participant);
        
        if (hasPerm) {
            // Directly route to Google Maps
            handleLocationPress(participant, true);
        } else {
            // Send request
            if (!orgId || !tripId || !auth.currentUser) return;
            const targetUid = participant.id;
            try {
                await set(ref(database, `trips_active/${orgId}/${tripId}/notifications/${targetUid}/${Date.now()}`), {
                    fromUid: auth.currentUser.uid,
                    name: userName,
                    type: 'location_request',
                    timestamp: serverTimestamp(),
                });
                setRequestSentVisible(true);
            } catch (error) {
            }
        }
    };

    const handleLocationPress = async (participant, forceBypass = false) => {
        let hasPerm = forceBypass;
        if (!hasPerm) {
            hasPerm = await checkLocationPermission(participant);
        }

        if (hasPerm) {
            setSelectedParticipant(participant);
            setShowParticipantsList(false);
            setTimeout(() => {
                setGoogleMapsModal(true);
            }, 500);
        } else {
            // If no permission, treat it as a request button too
            handleQuestionPress(participant);
        }
    };

    const openGoogleMaps = () => {
        if (selectedParticipant) {
            const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedParticipant.latitude},${selectedParticipant.longitude}`;
            Linking.openURL(url);
            setGoogleMapsModal(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <SafeAreaView edges={['top']} style={{ flex: 1, marginTop: 20 }}>
                {/* Fixed Background Header (Z-Index: 10) - Box-none allows touching through to Map */}
                <View style={[styles.header, { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }]} pointerEvents="box-none">
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>Live Location</Text>

                    <View style={{ width: 40 }} />
                </View>

                {/* Content Layer (Z-Index: 0) */}
                <View style={{ flex: 1, zIndex: 0 }}>

                    {/* Map */}
                    <MapView
                        ref={mapRef}
                        provider={PROVIDER_GOOGLE}
                        style={[styles.map, { marginTop: 55 }]}
                        initialRegion={mapRegion}
                        customMapStyle={darkMapStyle}
                        onPress={() => setSelectedMarker(null)}
                        moveOnMarkerPress={false}
                    >
                        {/* Public Safety Point Marker */}
                        {safetyPoint && (
                            <Marker
                                coordinate={{ latitude: safetyPoint.lat, longitude: safetyPoint.lng }}
                                title="Safe Point"
                                onPress={() => handleLocationPress({ latitude: safetyPoint.lat, longitude: safetyPoint.lng, name: 'Safe Point' })}
                                tracksViewChanges={false}
                            >
                                <View style={[styles.participantMarker, { backgroundColor: 'rgba(148, 47, 49, 0.2)', borderRadius: 32 }]}>
                                    <View style={[styles.markerCircle, { borderColor: '#942F31' }]}>
                                        <SafetyIcon color="#942F31" size={30} />
                                    </View>
                                </View>
                            </Marker>
                        )}


                        {/* Participant Markers */}
                        {Object.entries(participants)
                            .filter(([uid, loc]) => {
                                if (!loc.lat || !loc.lng) return false;
                                const profile = profileCache.current[uid];
                                // If PII for location is blocked, hide the marker
                                if (uid !== auth.currentUser?.uid && profile && profile.canSeeLocation === false) {
                                    return false;
                                }
                                return true;
                            })
                            .map(([uid, loc]) => {
                                const isMe = uid === auth.currentUser?.uid;
                                const isSelected = selectedMarker?.id === uid;
                                const p = participantsList.find(part => part.id === uid);
                                
                                // Default to user's auth photo for "Me" if list hasn't loaded
                                let avatarUri = p?.image;
                                if (isMe && !avatarUri) {
                                    avatarUri = auth.currentUser?.photoURL || `https://ui-avatars.com/api/?name=${userName?.[0] || 'U'}&background=B99A4A&color=fff`;
                                } else if (!avatarUri) {
                                    avatarUri = `https://ui-avatars.com/api/?name=U&background=B99A4A&color=fff`;
                                }

                                return (
                                    <Marker
                                        key={`participant-${uid}`}
                                        identifier={uid}
                                        coordinate={{
                                            latitude: loc.lat,
                                            longitude: loc.lng,
                                        }}
                                        zIndex={isSelected ? 100 : (isMe ? 50 : 10)}
                                        anchor={{ x: 0.5, y: 0.5 }}
                                        tracksViewChanges={false}
                                        onSelect={() => {

                                            setSelectedMarker({ id: uid, latitude: loc.lat, longitude: loc.lng });
                                        }}
                                        onDeselect={() => {
                                            setSelectedMarker(null);
                                        }}
                                        title={p?.name || "Participant"}
                                    >



                                        <View
                                            style={[
                                                styles.participantMarker,
                                                isSelected && styles.selectedMarkerGlow,
                                                isMe && { borderColor: '#FFF' } // Optional: White border for "Me"
                                            ]}
                                        >
                                            <View style={styles.markerCircle}>
                                                <Image
                                                    source={{ uri: avatarUri }}
                                                    style={styles.markerAvatar}
                                                    resizeMode="cover"
                                                />
                                            </View>
                                        </View>

                                        {/* {!isMe && (
                                            <Callout
                                                tooltip
                                                onPress={() => handleQuestionPress({ id: uid, latitude: loc.lat, longitude: loc.lng })}
                                            >
                                                <View style={styles.calloutContainer}>
                                                    <View style={styles.calloutContent}>
                                                        <View style={styles.requestBtn}>
                                                            <Text style={styles.requestBtnText}>Request Location</Text>
                                                        </View>
                                                    </View>
                                                    <View style={styles.calloutPointer} />
                                                </View>
                                            </Callout>
                                        )} */}
                                    </Marker>
                                );
                        })}
                    </MapView>


                    {/* Control Buttons */}
                    <View style={styles.controlButtons}>
                        <TouchableOpacity style={styles.controlBtn} onPress={centerOnUser}>
                            <CrosshairsIcon />
                        </TouchableOpacity>
                        {isAdmin && (
                            <TouchableOpacity
                                style={[styles.controlBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#fff' }, isSafetyActive && { borderWidth: 1, borderColor: '#942F31' }]}
                                onPress={toggleSafetyPoint}
                            >
                                <SafetyIcon color={isSafetyActive ? "#942F31" : "white"} size={26} />
                            </TouchableOpacity>
                        )}
                    </View>


                    {/* List Participant Button */}
                    <TouchableOpacity
                        style={[styles.listButton, !userLocation && { opacity: 0.8 }]}
                        onPress={() => userLocation && setShowParticipantsList(true)}
                        disabled={!userLocation}
                    >
                        {!userLocation ? (
                            <ActivityIndicator color="#FFF" size="small" style={{ marginRight: 8 }} />
                        ) : (
                            <PeopleIcon color="#FFF" size={22} />
                        )}
                        <Text style={styles.listButtonText}>
                            {!userLocation ? 'Loading location...' : 'List Participant'}
                        </Text>
                    </TouchableOpacity>

                    {/* Participants List Modal */}
                    {/* Participants List Modal */}
                    <Modal
                        isVisible={showParticipantsList}
                        onBackdropPress={() => setShowParticipantsList(false)}
                        onSwipeComplete={() => setShowParticipantsList(false)}
                        swipeDirection="down"
                        style={{ margin: 0, justifyContent: 'flex-end' }}
                        useNativeDriver={true}
                        hideModalContentWhileAnimating={true}
                    >
                        <Animated.View
                            style={[
                                styles.participantsModal,
                                { transform: [{ translateY: panYParticipants }] }
                            ]}
                            {...participantsSwipe.panHandlers}
                        >
                            <View style={styles.modalHandle} />
                            <Text style={styles.modalTitle}>Participants</Text>

                            {/* Search Bar */}
                            <View style={styles.searchContainer}>
                                <Ionicons name="search" size={20} color="#71717A" style={styles.searchIcon} />
                                <TextInput 
                                    style={styles.searchTextInput}
                                    placeholder="Search participant"
                                    placeholderTextColor="#71717A"
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                            </View>


                            <ScrollView style={styles.participantsList}>
                                {Object.entries(participants).map(([uid, loc]) => {
                                    const p = participantsList.find(part => part.id === uid);
                                    if (uid === auth.currentUser?.uid) return null;
                                    
                                    // Removed filter: show everyone in list irrespective of restriction
                                    // if (p && p.canSeeLocation === false) return null;

                                    return (
                                        <TouchableOpacity
                                            key={uid}
                                            style={styles.participantItem}
                                            onPress={() => {
                                                const activePart = { id: uid, latitude: loc.lat, longitude: loc.lng };
                                                setSelectedMarker(activePart);
                                                setShowParticipantsList(false);
                                                if (mapRef.current && loc.lat && loc.lng) {
                                                    mapRef.current.animateToRegion({
                                                        latitude: loc.lat,
                                                        longitude: loc.lng,
                                                        latitudeDelta: 0.01,
                                                        longitudeDelta: 0.01,
                                                    }, 1000);
                                                }
                                            }}
                                        >
                                            
                                            <Image
                                                source={{ uri: p?.image || `https://ui-avatars.com/api/?name=U&background=B99A4A&color=fff` }}
                                                style={styles.participantAvatar}
                                            />
                                            <View style={{ flex: 1, height: 60, justifyContent: 'center' }}>
                                                <Text style={[styles.participantName, { flex: 0 }]}>{p?.name || `User (${uid.substring(0, 5)})`}</Text>
                                            </View>

                                            <View style={styles.actionButtons}>
                                                {locationPermissions[uid] || (globalVisibilityConfig?.location === 'Show to everyone') || (isAdmin && globalVisibilityConfig?.location === 'Show to organizer') ? (
                                                    <TouchableOpacity
                                                        style={styles.locateBtn}
                                                        onPress={() => handleLocationPress({ id: uid, latitude: loc.lat, longitude: loc.lng })}
                                                    >
                                                        <LocationPinIcon />
                                                    </TouchableOpacity>
                                                ) : (
                                                    <TouchableOpacity
                                                        style={styles.questionBtn}
                                                        onPress={() => handleQuestionPress({ id: uid, latitude: loc.lat, longitude: loc.lng })}
                                                    >
                                                        <Text style={styles.questionText}>?</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}


                            </ScrollView>
                        </Animated.View>
                    </Modal>

                    {/* Location Request Modal */}
                    <Modal
                        isVisible={locationRequestModal}
                        onBackdropPress={() => setLocationRequestModal(false)}
                        onSwipeComplete={() => setLocationRequestModal(false)}
                        swipeDirection="down"
                        backdropOpacity={0.7}
                        style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}
                        useNativeDriver={true}
                        hideModalContentWhileAnimating={true}
                    >
                        <Animated.View
                            style={[
                                styles.alertModal,
                                { transform: [{ translateY: panYLocationReq }] }
                            ]}
                            {...locationRequestSwipe.panHandlers}
                        >
                            <View style={styles.modalHandle} />
                            <Text style={styles.alertTitle}>Location requested</Text>
                            <Text style={{ color: '#A1A1AA', textAlign: 'center', marginBottom: 20 }}>
                                {incomingRequest?.name} is asking for your live location.
                            </Text>
                            <TouchableOpacity
                                style={styles.gradientButtonWrapper}
                                onPress={() => setLocationRequestModal(false)}
                            >

                                <LinearGradient
                                    colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.gradientBorder}
                                >
                                    <View style={styles.buttonInner}>
                                        <Text style={styles.okButtonText}>OK</Text>
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>
                    </Modal>

                    {/* Request Sent Modal */}
                    <Modal
                        isVisible={requestSentVisible}
                        onBackdropPress={() => setRequestSentVisible(false)}
                        onSwipeComplete={() => setRequestSentVisible(false)}
                        swipeDirection="down"
                        backdropOpacity={0.7}
                        style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}
                        useNativeDriver={true}
                        hideModalContentWhileAnimating={true}
                    >
                        <Animated.View
                            style={[
                                styles.alertModal,
                                { transform: [{ translateY: panYRequestSent }] }
                            ]}
                            {...requestSentSwipe.panHandlers}
                        >
                            <View style={styles.modalHandle} />
                            <Text style={styles.alertTitle}>Request Sent</Text>
                            <Text style={{ color: '#A1A1AA', textAlign: 'center', marginBottom: 20 }}>
                                A location request has been sent. Once accepted, you can locate them on the map.
                            </Text>
                            <TouchableOpacity
                                style={styles.gradientButtonWrapper}
                                onPress={() => setRequestSentVisible(false)}
                            >
                                <LinearGradient
                                    colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.gradientBorder}
                                >
                                    <View style={styles.buttonInner}>
                                        <Text style={styles.okButtonText}>OK</Text>
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>
                    </Modal>

                    {/* Google Maps Modal */}
                    <Modal
                        isVisible={googleMapsModal}
                        onBackdropPress={() => setGoogleMapsModal(false)}
                        onSwipeComplete={() => setGoogleMapsModal(false)}
                        swipeDirection="down"
                        style={{ margin: 0, justifyContent: 'flex-end' }}
                        useNativeDriver={true}
                        hideModalContentWhileAnimating={true}
                    >
                        <Animated.View
                            style={[
                                styles.mapsModal,
                                { transform: [{ translateY: panYGoogleMaps }] }
                            ]}
                            {...googleMapsSwipe.panHandlers}
                        >
                            <View style={styles.modalHandle} />
                            <Text style={styles.mapsMessage}>Route will start through</Text>
                            <TouchableOpacity
                                style={styles.gradientButtonWrapper}
                                onPress={openGoogleMaps}
                            >
                                <LinearGradient
                                    colors={['#B99A4A', 'rgba(185, 154, 74, 0.44)']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.gradientBorder}
                                >
                                    <View style={styles.buttonInner}>
                                        <Text style={styles.googleMapsButtonText}>Google Maps</Text>
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>
                    </Modal>

                    <TripBottomTabBar activeRoute="LiveLocation" tripData={trip} />
                </View >
            </SafeAreaView >
        </View >
    );
};

// Dark map style for Google Maps
const darkMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#212121' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
    {
        featureType: 'administrative',
        elementType: 'geometry',
        stylers: [{ color: '#757575' }],
    },
    {
        featureType: 'administrative.country',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#9e9e9e' }],
    },
    {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#bdbdbd' }],
    },
    {
        featureType: 'poi',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#757575' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'geometry',
        stylers: [{ color: '#181818' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#616161' }],
    },
    {
        featureType: 'poi.park',
        elementType: 'labels.text.stroke',
        stylers: [{ color: '#1b1b1b' }],
    },
    {
        featureType: 'road',
        elementType: 'geometry.fill',
        stylers: [{ color: '#2c2c2c' }],
    },
    {
        featureType: 'road',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#8a8a8a' }],
    },
    {
        featureType: 'road.arterial',
        elementType: 'geometry',
        stylers: [{ color: '#373737' }],
    },
    {
        featureType: 'road.highway',
        elementType: 'geometry',
        stylers: [{ color: '#3c3c3c' }],
    },
    {
        featureType: 'road.highway.controlled_access',
        elementType: 'geometry',
        stylers: [{ color: '#4e4e4e' }],
    },
    {
        featureType: 'road.local',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#616161' }],
    },
    {
        featureType: 'transit',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#757575' }],
    },
    {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#000000' }],
    },
    {
        featureType: 'water',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#3d3d3d' }],
    },
];

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1E21',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 50,
        backgroundColor: '#1A1E21',
        zIndex: 10,
        paddingBottom: 15
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 20,
        color: '#FFF',
        fontFamily: Typography.sans.regular
    },
    map: {
        flex: 1,
    },
    userMarker: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#FFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: '#B99A4A',
    },
    participantMarker: {
        width: 64,
        height: 64,
        alignItems: 'center',
        justifyContent: 'center',
    },

    selectedMarkerGlow: {
        // Glow effect
        shadowColor: '#B99A4A',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 20,
        elevation: 20,
    },
    markerCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 3,
        borderColor: '#B99A4A',
        backgroundColor: '#1E2124',
        overflow: 'hidden',
        // Force circular shape on Android
        borderStyle: 'solid',
    },
    markerAvatar: {
        width: 54, // slightly smaller to avoid border overlap issues
        height: 54,
        borderRadius: 27,
    },
    controlButtons: {
        position: 'absolute',
        right: 20,
        top: height * 0.5,
        gap: 15,
    },
    controlBtn: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#23272A',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    listButton: {
        position: 'absolute',
        bottom: 100,
        left: '20%',
        right: '20%',
        backgroundColor: '#B99A4A',
        borderRadius: 30,
        marginBottom: "5%",
        width: '60%',
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    listButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
    },
    requestLocationBtn: {
        position: 'absolute',
        bottom: 80,
        left: '25%',
        right: '25%',
        backgroundColor: '#B99A4A',
        borderRadius: 40,
        width: '50%',
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 10,
        shadowColor: '#B99A4A',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        zIndex: 20,
    },
    requestLocationBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    participantsModal: {
        backgroundColor: '#1A1E21',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 12,
        paddingBottom: 80,
        maxHeight: height * 0.6,
    },
    modalHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#444',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 24,
        color: '#FFF',
        fontFamily: 'CormorantGaramond',
        paddingHorizontal: 24,
        marginBottom: 20,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#23272A',
        marginHorizontal: 24,
        marginBottom: 20,
        borderRadius: 12,
        paddingHorizontal: 16,
        // paddingVertical: 14,
    },
    searchIcon: {
        marginRight: 12,
    },
    searchPlaceholder: {
        color: '#71717A',
        fontSize: 16,
    },
    searchTextInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.regular,
        paddingVertical: 10,
    },
    participantsList: {

        paddingHorizontal: 24,
    },
    participantItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 0,
    },
    participantAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        marginRight: 16,
    },
    participantName: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    questionBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#942F31',
        alignItems: 'center',
        justifyContent: 'center',
    },
    questionText: {
        color: '#FFF',
        fontSize: 24,
        fontWeight: 'bold',
    },
    locateBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#3F4346',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Location Request Modal
    centeredModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    alertModal: {
        backgroundColor: '#23272A',
        borderRadius: 20,
        padding: 32,
        width: '100%',
        alignItems: 'center',
    },
    alertTitle: {
        fontSize: 18,
        color: '#FFF',
        fontFamily: Typography.sans.bold,
        marginBottom: 24,
        textAlign: 'center',
    },
    gradientButtonWrapper: {
        width: '100%',
    },
    gradientBorder: {
        borderRadius: 30,
        padding: 2, // Border width
    },
    buttonInner: {
        backgroundColor: '#23272A',
        borderRadius: 28,
        paddingVertical: 16,
        alignItems: 'center',
    },
    okButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Google Maps Modal
    mapsModal: {
        backgroundColor: '#23272A',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 12,
        paddingBottom: 40,
        paddingHorizontal: 24,
    },
    mapsMessage: {
        fontSize: 18,
        color: '#FFF',
        textAlign: 'center',
        marginBottom: 24,
        marginTop: 20,
    },
    googleMapsButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Callout Styles
    calloutContainer: {
        alignItems: 'center',
        width: 240,
    },
    calloutContent: {
        width: '100%',
        alignItems: 'center',
    },
    calloutTitle: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    requestBtn: {
        backgroundColor: '#B99A4A',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 20,
    },
    requestBtnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    calloutPointer: {
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderLeftWidth: 8,
        borderRightWidth: 8,
        borderTopWidth: 8,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#B99A4A',
    },
});

export default LiveLocationScreen;
