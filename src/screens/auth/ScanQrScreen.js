import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Image,
    Dimensions,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width, height } = Dimensions.get('window');
const SCAN_FRAME_SIZE = width * 0.7;

const ScanQrScreen = ({ navigation }) => {
    const [permission, requestPermission] = useCameraPermissions();

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
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                <CameraView
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    onBarcodeScanned={(result) => {
                        // Pass the scanned QR data (e.g., Trip ID or Token) to the registration flow
                        navigation.navigate('JoinFirstName', { invitationCode: result.data });
                    }}
                />

                {/* Overlay is now a sibling, not a child */}
                <View style={{ flex: 1 }}>
                    {/* Header with Close Button */}
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.closeButton}
                        >
                            <Ionicons name="close" size={28} color="#FFF" />
                        </TouchableOpacity>

                    </View>
                    <Text style={styles.headerTitle}>Scan to Join</Text>
                    <Text style={styles.instructionText}>
                        Point your camera at a QR code and capture it.
                    </Text>
                    <View style={styles.overlay} >
                        {/* Masking Overlays */}
                        <View style={styles.topMask} />
                        <View style={styles.bottomMask} />
                        <View style={styles.leftMask} />
                        <View style={styles.rightMask} />

                        {/* Scanning Frame */}
                        <View style={styles.scanFrameContainer}>
                            <View style={styles.frameCornerTopLeft} />
                            <View style={styles.frameCornerTopRight} />
                            <View style={styles.frameCornerBottomLeft} />
                            <View style={styles.frameCornerBottomRight} />
                            <View style={styles.frameSideTop} />
                            <View style={styles.frameSideBottom} />
                            <View style={styles.frameSideLeft} />
                            <View style={styles.frameSideRight} />
                            <View style={styles.scanArea} />
                        </View>
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
    camera: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        alignItems: 'center',
    },
    topMask: {
        position: 'absolute',
        top: 0,
        width: '100%',
        height: 50,
        backgroundColor: '#000',
    },
    bottomMask: {
        position: 'absolute',
        top: 50 + SCAN_FRAME_SIZE,
        width: '100%',
        bottom: 0,
        backgroundColor: '#000',
    },
    leftMask: {
        position: 'absolute',
        top: 50,
        left: 0,
        width: (width - SCAN_FRAME_SIZE) / 2,
        height: SCAN_FRAME_SIZE,
        backgroundColor: '#000',
    },
    rightMask: {
        position: 'absolute',
        top: 50,
        right: 0,
        width: (width - SCAN_FRAME_SIZE) / 2,
        height: SCAN_FRAME_SIZE,
        backgroundColor: '#000',
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
        fontSize: 24,
        color: '#FFF',
        fontFamily: 'IBMPlexSans',
        marginLeft: 15,
    },
    instructionText: {
        color: '#FFF',
        fontSize: 16,
        marginTop: 20,
        paddingHorizontal: 15,
        lineHeight: 20,
        fontWeight: 'bold',
        textAlign: 'center'
    },
    scanFrameContainer: {
        width: SCAN_FRAME_SIZE,
        height: SCAN_FRAME_SIZE,
        marginTop: 50,
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanArea: {
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(255,255,255,0.1)', // Slight highlight for scan area
        borderRadius: 20,
    },
    frameCornerTopLeft: {
        position: 'absolute',
        top: -2,
        left: -2,
        width: 40,
        height: 40,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderColor: '#B99A4A',
        borderTopLeftRadius: 20,
        zIndex: 10,
    },
    frameCornerTopRight: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 40,
        height: 40,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderColor: '#B99A4A',
        borderTopRightRadius: 20,
        zIndex: 10,
    },
    frameCornerBottomLeft: {
        position: 'absolute',
        bottom: -2,
        left: -2,
        width: 40,
        height: 40,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderColor: '#B99A4A',
        borderBottomLeftRadius: 20,
        zIndex: 10,
    },
    frameCornerBottomRight: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 40,
        height: 40,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderColor: '#B99A4A',
        borderBottomRightRadius: 20,
        zIndex: 10,
    },

    permButton: {
        marginTop: 20,
        padding: 10,
        backgroundColor: '#B99A4A',
        alignSelf: 'center',
        borderRadius: 5,
    },
    permButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    frameSideTop: {
        position: 'absolute',
        top: 0,
        left: '42%',
        marginLeft: -30,
        width: 100,
        height: 5,
        backgroundColor: '#B99A4A',
        borderRadius: 4,
        zIndex: 10,
    },
    frameSideBottom: {
        position: 'absolute',
        bottom: 0,
        left: '42%',
        marginLeft: -30,
        width: 100,
        height: 5,
        backgroundColor: '#B99A4A',
        borderRadius: 4,
        zIndex: 10,
    },
    frameSideLeft: {
        position: 'absolute',
        left: 0,
        top: '42%',
        marginTop: -30,
        height: 100,
        width: 5,
        backgroundColor: '#B99A4A',
        borderRadius: 4,
        zIndex: 10,
    },
    frameSideRight: {
        position: 'absolute',
        right: 0,
        top: '42%',
        marginTop: -30,
        height: 100,
        width: 5,
        backgroundColor: '#B99A4A',
        borderRadius: 4,
        zIndex: 10,
    }
});

export default ScanQrScreen;
