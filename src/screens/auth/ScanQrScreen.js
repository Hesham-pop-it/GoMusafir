import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Image,
    Dimensions,
    Alert,
    ActivityIndicator,
    Animated,
    Linking,
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

const SVG_SIZE = Math.max(width, height) * 3;
const SVG_OFFSET = (SVG_SIZE - SCAN_FRAME_SIZE) / 2;

const ScanQrScreen = ({ navigation }) => {
    const [permission, requestPermission] = useCameraPermissions();
    const [isLoading, setIsLoading] = useState(false);
    const [isScanned, setIsScanned] = useState(false); // Prevent multiple scans
    const [zoom, setZoom] = useState(0);
    const isFocused = useIsFocused();

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const translateXAnim = useRef(new Animated.Value(0)).current;
    const translateYAnim = useRef(new Animated.Value(0)).current;

    // Pulse animation logic
    useEffect(() => {
        if (isFocused && !isScanned && !isLoading) {
            // Animate frame back to center when returning to idle state
            Animated.parallel([
                Animated.spring(translateXAnim, {
                    toValue: 0,
                    friction: 6,
                    tension: 80,
                    useNativeDriver: true,
                }),
                Animated.spring(translateYAnim, {
                    toValue: 0,
                    friction: 6,
                    tension: 80,
                    useNativeDriver: true,
                })
            ]).start();

            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.75,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else if (!isFocused) {
            pulseAnim.stopAnimation();
            translateXAnim.stopAnimation();
            translateYAnim.stopAnimation();
            Animated.parallel([
                Animated.spring(pulseAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                }),
                Animated.spring(translateXAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                }),
                Animated.spring(translateYAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                })
            ]).start();
        }
        // When isScanned or isLoading is true, we keep the snap animation state
    }, [isFocused, isScanned, isLoading]);

    // Reset scan state when screen is refocused (e.g. coming back from next screen)
    useEffect(() => {
        if (isFocused) {
            setIsScanned(false);
            setIsLoading(false);
            setZoom(0);
            translateXAnim.setValue(0);
            translateYAnim.setValue(0);
        }
    }, [isFocused]);

    useEffect(() => {
        if (permission && permission.status === 'undetermined') {
            requestPermission();
        }
    }, [permission]);

    if (!permission) {
        // Camera permissions are still loading
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#B99A4A" />
            </View>
        );
    }

    if (!permission.granted) {
        // Camera permissions are not granted yet
        const canAskAgain = permission.canAskAgain;

        return (
            <View style={[styles.container, { paddingHorizontal: 40, justifyContent: 'center' }]}>
                <Ionicons name="camera-outline" size={80} color="#B99A4A" style={{ alignSelf: 'center', marginBottom: 20 }} />
                <Text style={{ textAlign: 'center', color: '#fff', fontSize: 18, fontFamily: Typography.sans.bold, marginBottom: 10 }}>
                    Camera Access Required
                </Text>
                <Text style={{ textAlign: 'center', color: '#aaa', fontSize: 14, fontFamily: Typography.sans.regular, marginBottom: 30, lineHeight: 20 }}>
                    {canAskAgain
                        ? "We need your permission to show the camera and scan the QR code."
                        : "You have denied camera access. Please enable it in your system settings to scan the QR code."}
                </Text>

                <TouchableOpacity
                    onPress={() => {
                        if (canAskAgain) {
                            requestPermission();
                        } else {
                            Linking.openSettings();
                        }
                    }}
                    style={styles.permButton}
                >
                    <Text style={styles.permButtonText}>
                        {canAskAgain ? "Grant Permission" : "Open Settings"}
                    </Text>
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
                    zoom={zoom}
                    onBarcodeScanned={isScanned || isLoading ? undefined : async (result) => {
                        const { bounds } = result;
                        if (!bounds) return;

                        // Calculate if the QR code is within the frame
                        const { origin, size } = bounds;
                        const centerX = origin.x + size.width / 2;
                        const centerY = origin.y + size.height / 2;

                        // ROI boundaries (matching the visual frame)
                        const ROI_LEFT = (width - SCAN_FRAME_SIZE) / 2;
                        const ROI_TOP = TOP_OFFSET;

                        if (
                            centerX < ROI_LEFT || 
                            centerX > ROI_LEFT + SCAN_FRAME_SIZE || 
                            centerY < ROI_TOP || 
                            centerY > ROI_TOP + SCAN_FRAME_SIZE
                        ) {
                            return; // Outside the visible boundary
                        }

                        setIsScanned(true);
                        setIsLoading(true);
                        
                        // Calculate target scale and translation to wrap the QR code
                        const qrCenterX = origin.x + size.width / 2;
                        const qrCenterY = origin.y + size.height / 2;
                        const frameCenterX = width / 2;
                        const frameCenterY = TOP_OFFSET + SCAN_FRAME_SIZE / 2;
                        
                        const targetX = qrCenterX - frameCenterX;
                        const targetY = qrCenterY - frameCenterY;
                        const maxQrSize = Math.max(size.width, size.height);
                        const targetScale = (maxQrSize * 1.4) / SCAN_FRAME_SIZE; // 1.4x for a little padding
                        
                        Animated.parallel([
                            Animated.spring(pulseAnim, {
                                toValue: targetScale,
                                friction: 6,
                                tension: 80,
                                useNativeDriver: true,
                            }),
                            Animated.spring(translateXAnim, {
                                toValue: targetX,
                                friction: 6,
                                tension: 80,
                                useNativeDriver: true,
                            }),
                            Animated.spring(translateYAnim, {
                                toValue: targetY,
                                friction: 6,
                                tension: 80,
                                useNativeDriver: true,
                            }),
                        ]).start();
                        
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
                                Alert.alert("Trip Full", `Sorry, this trip has reached its maximum capacity.`, [{ text: "OK", onPress: () => {
                                    setIsScanned(false);
                                    setZoom(0);
                                } }]);
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
                                    Alert.alert("Trip Ended", "This trip has already concluded.", [{ text: "OK", onPress: () => {
                                        setIsScanned(false);
                                        setZoom(0);
                                    } }]);
                                    setIsLoading(false);
                                    return;
                                }
                            }

                            // Success: Navigate to JoinEmail
                            navigation.navigate('JoinEmail', { invitationCode: codeInput, tripDetails });
                        } catch (error) {
                            console.log(error);
                            Alert.alert("Invalid QR", "This QR code is not a valid GoMusafir invitation.", [{ text: "OK", onPress: () => {
                                setIsScanned(false);
                                setZoom(0);
                            } }]);
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

                <Animated.View style={{
                    position: 'absolute',
                    top: TOP_OFFSET + SCAN_FRAME_SIZE / 2 - SVG_SIZE / 2,
                    left: width / 2 - SVG_SIZE / 2,
                    width: SVG_SIZE,
                    height: SVG_SIZE,
                    transform: [
                        { translateX: translateXAnim },
                        { translateY: translateYAnim },
                        { scale: pulseAnim }
                    ]
                }} pointerEvents="none">
                    <Svg height="100%" width="100%">
                        <Path
                            fillRule="evenodd"
                            d={`
                                M 0 0
                                H ${SVG_SIZE}
                                V ${SVG_SIZE}
                                H 0
                                Z
                                M ${SVG_OFFSET + 30} ${SVG_OFFSET}
                                h ${SCAN_FRAME_SIZE - 60}
                                q 30 0 30 30
                                v ${SCAN_FRAME_SIZE - 60}
                                q 0 30 -30 30
                                h -${SCAN_FRAME_SIZE - 60}
                                q -30 0 -30 -30
                                v -${SCAN_FRAME_SIZE - 60}
                                q 0 -30 30 -30
                                z
                            `}
                            fill="rgba(0,0,0,0.6)"
                        />
                    </Svg>
                </Animated.View>

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
                    <Animated.View style={[
                        styles.scanFrameContainer, 
                        { 
                            position: 'absolute',
                            top: TOP_OFFSET,
                            left: (width - SCAN_FRAME_SIZE) / 2,
                            transform: [
                                { translateX: translateXAnim },
                                { translateY: translateYAnim },
                                { scale: pulseAnim }
                            ]
                        }
                    ]}>
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
                    </Animated.View>
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
    },
    permButton: {
        backgroundColor: '#B99A4A',
        padding: 15,
        borderRadius: 10,
        alignSelf: 'center',
        marginTop: 20,
    },
    permButtonText: {
        color: '#fff',
        fontFamily: Typography.sans.bold,
    }
});

export default ScanQrScreen;
