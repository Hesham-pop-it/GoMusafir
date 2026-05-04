import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Image,
    Dimensions,
    Alert,
    ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Typography } from '../../constants/Typography';
import { functions, auth } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';

import { useNavigation, useIsFocused } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';

const { width, height } = Dimensions.get('window');
const SCAN_FRAME_SIZE = width * 0.7;
const TOP_OFFSET = (height - SCAN_FRAME_SIZE) / 2.5; // Offset to push it slightly up from center

const ScanQrScreen = ({ navigation }) => {
    const [permission, requestPermission] = useCameraPermissions();
    const [isLoading, setIsLoading] = useState(false);
    const [isScanned, setIsScanned] = useState(false); // Prevent multiple scans
    const isFocused = useIsFocused();

    // Reset scan state when screen is refocused (e.g. coming back from next screen)
    useEffect(() => {
        if (isFocused) {
            setIsScanned(false);
            setIsLoading(false);
        }
    }, [isFocused]);

    useEffect(() => {
        if (!permission) {
            requestPermission();
        }
    }, [permission]);

    if (!permission) {
        // Camera permissions are still loading
        return <View style={styles.container} />;
    }

    if (!permission.granted) {
        // Camera permissions are not granted yet
        return (
            <View style={styles.container}>
                <Text style={{ textAlign: 'center', color: '#fff', marginTop: 100 }}>We need your permission to show the camera</Text>
                <TouchableOpacity onPress={requestPermission} style={styles.permButton}>
                    <Text style={styles.permButtonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }



    return (
        <SafeAreaView style={[styles.container]}>
            <View style={{ flex: 1 }}>
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    onBarcodeScanned={isScanned || isLoading ? undefined : async (result) => {
                        setIsScanned(true);
                        setIsLoading(true);
                        try {
                            // Extract code from link if scanned data is a full URL
                            let codeInput = result.data.trim();
                            if (codeInput.includes('/')) {
                                codeInput = codeInput.split('/').pop().split('?')[0];
                            }

                            // Call getInviteMetadata for validation
                            const getMetadata = httpsCallable(functions, 'getInviteMetadata');
                            const metadataResult = await getMetadata({ inviteCode: codeInput });
                            const tripDetails = metadataResult.data;

                            // Validation 1: Check if trip is full
                            const user = auth.currentUser;
                            const alreadyJoined = tripDetails.alreadyJoined;

                            if (tripDetails.isFull && !alreadyJoined && user) {
                                Alert.alert("Trip Full", `Sorry, this trip has reached its maximum capacity.`, [{ text: "OK", onPress: () => setIsScanned(false) }]);
                                setIsLoading(false);
                                return;
                            }

                            // Validation 2: Check if trip has ended
                            if (tripDetails.endDate) {
                                const now = Date.now();
                                const end = typeof tripDetails.endDate === 'number' 
                                    ? tripDetails.endDate 
                                    : new Date(tripDetails.endDate).getTime();
                                
                                if (now > end) {
                                    Alert.alert("Trip Ended", "This trip has already concluded.", [{ text: "OK", onPress: () => setIsScanned(false) }]);
                                    setIsLoading(false);
                                    return;
                                }
                            }

                            // Success: Navigate to JoinEmail
                            navigation.navigate('JoinEmail', { invitationCode: codeInput, tripDetails });
                        } catch (error) {
                            console.error(error);
                            Alert.alert("Invalid QR", "This QR code is not a valid GoMusafir invitation.", [{ text: "OK", onPress: () => setIsScanned(false) }]);
                        } finally {
                            setIsLoading(false);
                        }
                    }}
                />
                
                {isLoading && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#B99A4A" />
                        <Text style={styles.loadingText}>Validating Trip...</Text>
                    </View>
                )}

                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Svg height="100%" width="100%">
                        <Path
                            fillRule="evenodd"
                            d={`
                                M 0 0
                                H ${width}
                                V ${height}
                                H 0
                                Z
                                M ${(width - SCAN_FRAME_SIZE) / 2 + 30} ${TOP_OFFSET - 5}
                                h ${SCAN_FRAME_SIZE - 60}
                                a 30 30 0 0 1 30 30
                                v ${SCAN_FRAME_SIZE - 60}
                                a 30 30 0 0 1 -30 30
                                h -${SCAN_FRAME_SIZE - 60}
                                a 30 30 0 0 1 -30 -30
                                v -${SCAN_FRAME_SIZE - 60}
                                a 30 30 0 0 1 30 -30
                                z
                            `}
                            fill="rgba(0,0,0,0.6)"
                        />
                    </Svg>
                </View>

                {/* Content on top of everything */}
                <View style={StyleSheet.absoluteFill}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
                            <Ionicons name="close" size={28} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.headerTitle}>Scan to Join</Text>
                    <Text style={styles.instructionText}>
                        Point your camera at a QR code and capture it.
                    </Text>

                    {/* Centered Scan Frame */}
                    <View style={[styles.scanFrameContainer, { marginTop: TOP_OFFSET - 140 }]}>
                        {/* Corner Pieces */}
                        <View style={styles.frameCornerTopLeft} />
                        <View style={styles.frameCornerTopRight} />
                        <View style={styles.frameCornerBottomLeft} />
                        <View style={styles.frameCornerBottomRight} />
                        
                        {/* Side Segments */}
                        <View style={styles.frameSideTop} />
                        <View style={styles.frameSideBottom} />
                        <View style={styles.frameSideLeft} />
                        <View style={styles.frameSideRight} />
                        
                        <View style={styles.scanArea} />
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    mask: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    header: {
        width: '100%',
        flexDirection: 'row'
    },
    closeButton: {
        padding: 15,
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        width: '100%'
    },
    headerTitle: {
        fontSize: 28,
        color: '#FFF',
        fontFamily: Typography.serif.bold,
        marginLeft: 15,
    },
    instructionText: {
        color: '#FFF',
        fontSize: 16,
        marginTop: 20,
        paddingHorizontal: 15,
        lineHeight: 20,
        fontFamily: Typography.sans.bold,
        // textAlign: 'center'
    },
    scanFrameContainer: {
        width: SCAN_FRAME_SIZE,
        height: SCAN_FRAME_SIZE,
        // marginTop: 50,
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        alignSelf: 'center',
    },
    scanArea: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 30,
    },
    frameCornerTopLeft: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 60,
        height: 60,
        borderTopWidth: 5,
        borderLeftWidth: 5,
        borderColor: '#B99A4A',
        borderTopLeftRadius: 30,
        zIndex: 10,
    },
    frameCornerTopRight: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 60,
        height: 60,
        borderTopWidth: 5,
        borderRightWidth: 5,
        borderColor: '#B99A4A',
        borderTopRightRadius: 30,
        zIndex: 10,
    },
    frameCornerBottomLeft: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: 60,
        height: 60,
        borderBottomWidth: 5,
        borderLeftWidth: 5,
        borderColor: '#B99A4A',
        borderBottomLeftRadius: 30,
        zIndex: 10,
    },
    frameCornerBottomRight: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 60,
        height: 60,
        borderBottomWidth: 5,
        borderRightWidth: 5,
        borderColor: '#B99A4A',
        borderBottomRightRadius: 30,
        zIndex: 10,
    },
    frameSideTop: {
        position: 'absolute',
        top: 0,
        alignSelf: 'center',
        width: 80,
        height: 5,
        backgroundColor: '#B99A4A',
        borderRadius: 3,
        zIndex: 10,
    },
    frameSideBottom: {
        position: 'absolute',
        bottom: 0,
        alignSelf: 'center',
        width: 80,
        height: 5,
        backgroundColor: '#B99A4A',
        borderRadius: 3,
        zIndex: 10,
    },
    frameSideLeft: {
        position: 'absolute',
        left: 0,
        top: '50%',
        marginTop: -40,
        height: 80,
        width: 5,
        backgroundColor: '#B99A4A',
        borderRadius: 3,
        zIndex: 10,
    },
    frameSideRight: {
        position: 'absolute',
        right: 0,
        top: '50%',
        marginTop: -40,
        height: 80,
        width: 5,
        backgroundColor: '#B99A4A',
        borderRadius: 3,
        zIndex: 10,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    loadingText: {
        color: '#FFF',
        marginTop: 15,
        fontFamily: Typography.sans.bold,
    }
});

export default ScanQrScreen;
