import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    PanResponder,
    Dimensions,
    Modal as RNModal,
    ActivityIndicator,
    Alert,
} from 'react-native';
import Modal from '../../components/CompatModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import GradientBorderButton from '../../components/GradientBorderButton';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { functions, storage } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';

const EditIcon = () => (
    <Svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Path d="M9.72852 1.38037C10.6674 0.459267 11.996 -0.638403 13.2891 0.459473C13.309 0.476424 13.3233 0.494754 13.333 0.513184C14.0164 1.21397 14.66 1.87448 15.3799 2.60303C16.115 3.34701 16.9651 4.15294 16 5.1626C13.5553 7.72249 10.9336 10.1326 8.40918 12.6128L6.76172 14.2241C6.39863 14.5783 6.16798 14.8005 5.62793 14.8979C3.98044 15.1991 2.2794 15.3143 0.623047 15.5269C0.437092 15.5534 -0.0410185 15.571 0.00292969 15.2612C0.242089 13.658 0.392897 12.0099 0.729492 10.4155C0.871412 9.76015 1.82754 9.13089 2.28809 8.6792L6.11426 4.92432L9.72852 1.38037ZM2.06641 10.9829C1.88025 12.2212 1.69299 13.4594 1.50684 14.6978C2.63939 14.5547 3.77175 14.4101 4.9043 14.2671C4.84547 12.4691 4.06287 11.5962 3.33887 11.146C2.95346 10.9065 2.5652 10.775 2.27148 10.7046C2.21887 10.692 2.16931 10.6822 2.12402 10.6733C2.10325 10.7802 2.08086 10.8854 2.06641 10.9829ZM2.80176 9.49463C2.77139 9.525 2.74205 9.55864 2.71094 9.59229C3.07042 9.69157 3.51688 9.85563 3.9668 10.1353C4.91269 10.7233 5.81881 11.7783 6.04492 13.5894L7.2041 12.4526L12.6699 7.09424L12.2803 6.69775C11.1903 5.59997 10.1066 4.49566 9.02441 3.39014L2.80176 9.49463ZM11.916 0.994629C11.5498 0.700174 11.4507 1.00486 11.1543 1.30127L9.99902 2.43408L10.4814 2.92432C11.5406 3.99104 12.5929 5.06497 13.6445 6.13916L13.9453 5.84521C14.5919 5.21637 15.4597 4.66681 14.6006 3.73682C13.7415 2.80688 12.8202 1.92142 11.9346 1.01807C11.9274 1.01073 11.9217 1.0021 11.916 0.994629Z" fill="#B99A4A"/>
    </Svg>
);

const CROP_SIZE = 280;

const getBaseDimensions = (imgWidth, imgHeight) => {
    const width = Number(imgWidth);
    const height = Number(imgHeight);
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        return { width: CROP_SIZE, height: CROP_SIZE };
    }
    const imgRatio = width / height;
    if (imgRatio > 1) {
        return {
            width: CROP_SIZE * imgRatio,
            height: CROP_SIZE,
        };
    } else {
        return {
            width: CROP_SIZE,
            height: CROP_SIZE / imgRatio,
        };
    }
};

const CustomSlider = ({ value, onChange, min = 1, max = 3 }) => {
    const sliderWidth = 180;
    const knobSize = 24;
    
    const percentage = (value - min) / (max - min);
    const knobLeft = percentage * (sliderWidth - knobSize);

    const handleTouch = (evt) => {
        const x = evt.nativeEvent.locationX;
        const newPercentage = Math.max(0, Math.min(1, x / sliderWidth));
        const newValue = min + newPercentage * (max - min);
        onChange(newValue);
    };

    return (
        <View style={styles.sliderContainer}>
            <TouchableOpacity onPress={() => onChange(Math.max(min, value - 0.2))} style={styles.sliderBtn}>
                <Feather name="minus" size={20} color="#FFF" />
            </TouchableOpacity>
            <View 
                style={styles.sliderTrackWrapper}
                onStartShouldSetResponder={() => true}
                onResponderGrant={handleTouch}
                onResponderMove={handleTouch}
            >
                <View style={styles.sliderTrackBackground} />
                <View 
                    style={[
                        styles.sliderTrackActive,
                        { width: `${percentage * 100}%` }
                    ]}
                />
                <View 
                    style={[
                        styles.sliderKnob,
                        { left: knobLeft }
                    ]}
                />
            </View>
            <TouchableOpacity onPress={() => onChange(Math.min(max, value + 0.2))} style={styles.sliderBtn}>
                <Feather name="plus" size={20} color="#FFF" />
            </TouchableOpacity>
        </View>
    );
};

const EditParticipantScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { participant, tripId } = route.params || {};

    const [firstName, setFirstName] = useState(participant?.name ? (participant.name.split(' ')[0] || '') : '');
    const [lastName, setLastName] = useState(participant?.name ? (participant.name.split(' ')[1] || '') : '');
    const [email, setEmail] = useState(participant?.email || '');
    const [phone, setPhone] = useState(participant?.phone || '');
    const [avatarUri, setAvatarUri] = useState(participant?.image || 'https://randomuser.me/api/portraits/men/32.jpg');
    const [successVisible, setSuccessVisible] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Image cropping states
    const [cropModalVisible, setCropModalVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null); // { uri, width, height }
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const stateRef = React.useRef({ zoom: 1, pan: { x: 0, y: 0 }, selectedImage: null });
    stateRef.current = { zoom, pan, selectedImage };

    const clampOffset = (x, y, currentZoom) => {
        const img = stateRef.current.selectedImage;
        if (!img) return { x: 0, y: 0 };
        const base = getBaseDimensions(img.width, img.height);
        const displayWidth = base.width * currentZoom;
        const displayHeight = base.height * currentZoom;
        
        const minX = -(displayWidth - CROP_SIZE);
        const minY = -(displayHeight - CROP_SIZE);
        
        const safeX = isNaN(x) ? 0 : x;
        const safeY = isNaN(y) ? 0 : y;
        
        return {
            x: Math.max(minX, Math.min(0, safeX)),
            y: Math.max(minY, Math.min(0, safeY)),
        };
    };

    const handleZoomChange = (newZoom) => {
        const prevZoom = stateRef.current.zoom > 0 ? stateRef.current.zoom : 1;
        const prevPan = stateRef.current.pan || { x: 0, y: 0 };
        
        const centerX = CROP_SIZE / 2;
        const centerY = CROP_SIZE / 2;
        
        let newX = centerX - (newZoom / prevZoom) * (centerX - prevPan.x);
        let newY = centerY - (newZoom / prevZoom) * (centerY - prevPan.y);
        
        const clamped = clampOffset(newX, newY, newZoom);
        setZoom(newZoom);
        setPan(clamped);
    };

    const startPan = React.useRef({ x: 0, y: 0 });
    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                startPan.current = { x: stateRef.current.pan.x, y: stateRef.current.pan.y };
            },
            onPanResponderMove: (evt, gestureState) => {
                const { zoom } = stateRef.current;
                const newX = startPan.current.x + gestureState.dx;
                const newY = startPan.current.y + gestureState.dy;
                setPan(clampOffset(newX, newY, zoom));
            },
        })
    ).current;

    const handlePickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            alert('Sorry, we need camera roll permissions to make this work!');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.9,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            const asset = result.assets[0];
            
            const openCropper = (uri, width, height) => {
                const w = Number(width) || CROP_SIZE;
                const h = Number(height) || CROP_SIZE;
                
                setSelectedImage({
                    uri,
                    width: w,
                    height: h,
                });
                setZoom(1);
                
                const base = getBaseDimensions(w, h);
                const initialX = -(base.width - CROP_SIZE) / 2;
                const initialY = -(base.height - CROP_SIZE) / 2;
                setPan({ x: isNaN(initialX) ? 0 : initialX, y: isNaN(initialY) ? 0 : initialY });
                
                setCropModalVisible(true);
            };

            const resizeAndOpen = async (uri, origWidth, origHeight) => {
                let w = Number(origWidth) || 0;
                let h = Number(origHeight) || 0;
                let localUri = uri;

                // Resolve non-file URIs (like ph:// on iOS) by copying them to the local app cache
                if (uri && !uri.startsWith('file://') && !uri.startsWith('http://') && !uri.startsWith('https://')) {
                    try {
                        const filename = uri.split('/').pop() || 'temp_picked_image';
                        const ext = uri.includes('ext=') ? uri.split('ext=').pop()?.split('&')[0] : 'jpg';
                        const targetPath = `${FileSystem.cacheDirectory}${filename}.${ext}`;
                        await FileSystem.copyAsync({
                            from: uri,
                            to: targetPath
                        });
                        localUri = targetPath;
                    } catch (copyErr) {
                        console.warn("Failed to copy asset to local file cache:", copyErr);
                    }
                }

                if (w > 1200 || h > 1200 || w <= 0 || h <= 0) {
                    try {
                        if (w <= 0 || h <= 0) {
                            await new Promise((resolve) => {
                                Image.getSize(
                                    localUri,
                                    (width, height) => {
                                        w = width;
                                        h = height;
                                        resolve();
                                    },
                                    () => {
                                        w = CROP_SIZE;
                                        h = CROP_SIZE;
                                        resolve();
                                    }
                                );
                            });
                        }
                        
                        const ratio = w / h;
                        let targetWidth = w;
                        let targetHeight = h;
                        
                        if (w > 1200 || h > 1200) {
                            if (ratio > 1) {
                                targetWidth = 1200;
                                targetHeight = Math.round(1200 / ratio);
                            } else {
                                targetHeight = 1200;
                                targetWidth = Math.round(1200 * ratio);
                            }
                        }

                        const manip = await manipulateAsync(
                            localUri,
                            [{ resize: { width: targetWidth, height: targetHeight } }],
                            { compress: 0.9, format: SaveFormat.JPEG }
                        );
                        
                        openCropper(manip.uri, manip.width, manip.height);
                    } catch (err) {
                        console.warn("Error processing/downscaling image:", err);
                        openCropper(localUri, w || CROP_SIZE, h || CROP_SIZE);
                    }
                } else {
                    openCropper(localUri, w, h);
                }
            };

            // On iOS, waiting for the ImagePicker modal to dismiss before opening our cropper modal prevents the app from hanging.
            setTimeout(() => {
                resizeAndOpen(asset.uri, asset.width, asset.height);
            }, 500);
        }
    };

    const handleSaveCrop = async () => {
        if (!selectedImage) return;

        try {
            const width = Number(selectedImage.width) || CROP_SIZE;
            const height = Number(selectedImage.height) || CROP_SIZE;

            // Get base display dimensions at zoom = 1
            const base = getBaseDimensions(width, height);
            // Display dimensions at current zoom
            const displayWidth = base.width * zoom;
            const displayHeight = base.height * zoom;
            
            // Map the top-left offset (-pan.x, -pan.y) and crop dimensions (CROP_SIZE, CROP_SIZE) to original image pixels
            const scaleRatio = displayWidth > 0 ? (width / displayWidth) : 1;
            
            const originX = Math.round(-pan.x * scaleRatio);
            const originY = Math.round(-pan.y * scaleRatio);
            const cropWidth = Math.round(CROP_SIZE * scaleRatio);
            const cropHeight = Math.round(CROP_SIZE * scaleRatio);

            // Double check bounds to prevent crash
            let safeX = Math.max(0, Math.min(width - 1, originX));
            let safeY = Math.max(0, Math.min(height - 1, originY));
            let safeWidth = Math.min(width - safeX, cropWidth);
            let safeHeight = Math.min(height - safeY, cropHeight);

            if (isNaN(safeX) || isNaN(safeY) || isNaN(safeWidth) || isNaN(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
                console.warn("Invalid crop bounds detected:", { safeX, safeY, safeWidth, safeHeight });
                safeX = 0;
                safeY = 0;
                safeWidth = width;
                safeHeight = height;
            }

            const manipResult = await manipulateAsync(
                selectedImage.uri,
                [
                    {
                        crop: {
                            originX: safeX,
                            originY: safeY,
                            width: safeWidth,
                            height: safeHeight,
                        },
                    },
                ],
                { compress: 0.9, format: SaveFormat.JPEG }
            );

            setAvatarUri(manipResult.uri);
            setCropModalVisible(false);
        } catch (error) {
            console.error("Error cropping image:", error);
            alert("Could not crop image. Please try again.");
        }
    };

    const handleSave = async () => {
        if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
            Alert.alert("Error", "All fields are required.");
            return;
        }

        setIsSaving(true);
        let blob = null;
        try {
            let finalPhotoUrl = avatarUri;

            if (avatarUri && (avatarUri.startsWith('file://') || avatarUri.startsWith('content://'))) {
                // Upload to Firebase Storage
                blob = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.onload = function () {
                        resolve(xhr.response);
                    };
                    xhr.onerror = function (e) {
                        console.log("[EditParticipantScreen] XHR failed for URI:", avatarUri, e);
                        reject(new TypeError("Network request failed"));
                    };
                    xhr.responseType = "blob";
                    xhr.open("GET", avatarUri, true);
                    xhr.send(null);
                });
                
                // Create a unique filename
                const filename = `participant_avatars/${participant.id || participant.uid}_${Date.now()}.jpg`;
                const imageRef = storageRef(storage, filename);
                
                await uploadBytes(imageRef, blob);
                finalPhotoUrl = await getDownloadURL(imageRef);
            }

            const updateProfile = httpsCallable(functions, 'updateParticipantProfile');
            await updateProfile({
                targetUid: participant.id || participant.uid,
                tripId: tripId,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                photoURL: finalPhotoUrl
            });
            setSuccessVisible(true);
        } catch (error) {
            console.error("Error updating participant profile:", error);
            Alert.alert("Error", "Failed to update participant. " + error.message);
        } finally {
            if (blob) {
                try {
                    blob.close();
                } catch (e) {
                    console.log("[EditParticipantScreen] Error closing blob:", e);
                }
            }
            setIsSaving(false);
        }
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#1A1E21' }}>
            <LinearGradient
                colors={['#332F2B', '#1A1E21']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120 }}
            />
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                            <Ionicons name="arrow-back" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Edit Participants</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        {/* Avatar Section */}
                        <View style={styles.avatarSection}>
                            <View style={styles.avatarWrapper}>
                                <Image
                                    source={{ uri: avatarUri }}
                                    style={styles.avatar}
                                />
                                <TouchableOpacity style={styles.editIconContainer} onPress={handlePickImage}>
                                    <EditIcon />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Form */}
                        <View style={styles.form}>
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>First Name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={firstName}
                                    onChangeText={setFirstName}
                                    placeholder="Ethan"
                                    placeholderTextColor="#636D77"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Last Name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={lastName}
                                    onChangeText={setLastName}
                                    placeholder="Carter"
                                    placeholderTextColor="#636D77"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Email Address</Text>
                                <TextInput
                                    style={styles.input}
                                    value={email}
                                    onChangeText={setEmail}
                                    placeholder="ethan@gmail.com"
                                    placeholderTextColor="#636D77"
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Phone Number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={phone}
                                    onChangeText={setPhone}
                                    placeholder="+444545456"
                                    placeholderTextColor="#636D77"
                                    keyboardType="phone-pad"
                                />
                            </View>
                        </View>
                    </ScrollView>

                     <View style={styles.footer}>
                        <TouchableOpacity 
                            style={[styles.saveButton, isSaving && { opacity: 0.7 }]} 
                            onPress={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text style={styles.saveButtonText}>Save Changes</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                {/* Success Modal */}
                <Modal
                    isVisible={successVisible}
                    onBackdropPress={() => setSuccessVisible(false)}
                    onSwipeComplete={() => setSuccessVisible(false)}
                    swipeDirection="down"
                    useNativeDriver={true}
                    hideModalContentWhileAnimating={true}
                    style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.successIconCircle}>
                            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <Path d="M8.11513 16.7791L3.31918 12.0475C2.78478 11.5203 1.93521 11.5203 1.4008 12.0475C0.866399 12.5747 0.866399 13.4129 1.4008 13.9402L7.14224 19.6046C7.67665 20.1318 8.53992 20.1318 9.07432 19.6046L23.5992 5.28807C24.1336 4.76083 24.1336 3.92266 23.5992 3.39543C23.0648 2.86819 22.2152 2.86819 21.6808 3.39543L8.11513 16.7791Z" fill="white"/>
                            </Svg>
                        </View>
                        <Text style={styles.modalTitle}>Changes Saved</Text>
                        <Text style={styles.modalDesc}>
                            Your participant has been updated successfully.
                        </Text>

                        <GradientBorderButton
                            text="OK"
                            onPress={() => {
                                setSuccessVisible(false);
                                navigation.goBack();
                            }}
                            innerBg="#1E2124"
                        />
                    </View>
                </Modal>

                {/* Custom Image Cropper Modal */}
                <RNModal
                    visible={cropModalVisible}
                    animationType="fade"
                    transparent={true}
                    statusBarTranslucent={true}
                    onRequestClose={() => setCropModalVisible(false)}
                >
                    <View style={styles.cropperModalBackground}>
                        <View style={styles.cropperHeader}>
                            <Text style={styles.cropperHeaderTitle}>Crop Photo</Text>
                        </View>

                        {/* Image viewport container */}
                        <View 
                            style={[
                                styles.cropContainer,
                                {
                                    left: (Dimensions.get('window').width - CROP_SIZE) / 2,
                                    top: (Dimensions.get('window').height - CROP_SIZE) / 2 - 40,
                                    width: CROP_SIZE,
                                    height: CROP_SIZE,
                                }
                            ]}
                            {...panResponder.panHandlers}
                        >
                            {selectedImage && (
                                <Image
                                    source={{ uri: selectedImage.uri }}
                                    style={{
                                        position: 'absolute',
                                        left: pan.x,
                                        top: pan.y,
                                        width: getBaseDimensions(selectedImage.width, selectedImage.height).width * zoom,
                                        height: getBaseDimensions(selectedImage.width, selectedImage.height).height * zoom,
                                    }}
                                    resizeMode="cover"
                                />
                            )}
                        </View>

                        {/* SVG Circular cutout mask */}
                        <Svg height="100%" width="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
                            <Path
                                fillRule="evenodd"
                                d={`M 0 0 h ${Dimensions.get('window').width} v ${Dimensions.get('window').height} h -${Dimensions.get('window').width} Z M ${Dimensions.get('window').width / 2} ${Dimensions.get('window').height / 2 - 40 - CROP_SIZE / 2} a ${CROP_SIZE / 2} ${CROP_SIZE / 2} 0 1 0 0 ${CROP_SIZE} a ${CROP_SIZE / 2} ${CROP_SIZE / 2} 0 1 0 0 -${CROP_SIZE} Z`}
                                fill="rgba(26, 30, 33, 0.85)"
                            />
                        </Svg>

                        {/* Ring highlight over cutout */}
                        <View 
                            style={[
                                styles.cropRing,
                                {
                                    left: (Dimensions.get('window').width - CROP_SIZE) / 2 - 1,
                                    top: (Dimensions.get('window').height - CROP_SIZE) / 2 - 41,
                                    width: CROP_SIZE + 2,
                                    height: CROP_SIZE + 2,
                                    borderRadius: (CROP_SIZE + 2) / 2,
                                }
                            ]}
                            pointerEvents="none"
                        />

                        {/* Zoom Slider */}
                        <View style={[styles.sliderWrapper, { top: (Dimensions.get('window').height - CROP_SIZE) / 2 - 40 + CROP_SIZE + 15, left: 0, right: 0 }]}>
                            <CustomSlider
                                value={zoom}
                                onChange={handleZoomChange}
                                min={1}
                                max={3.5}
                            />
                            <Text style={styles.zoomTip}>Drag to pan, slide to zoom</Text>
                        </View>

                        {/* Actions */}
                        <View style={styles.cropperFooter}>
                            <TouchableOpacity style={styles.cropperCancelBtn} onPress={() => setCropModalVisible(false)}>
                                <Text style={styles.cropperCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.cropperSaveBtn} onPress={handleSaveCrop}>
                                <Text style={styles.cropperSaveText}>Apply Crop</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </RNModal>
            </SafeAreaView>
        </View>
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
        paddingVertical: 10,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 20,
        // fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    avatarSection: {
        alignItems: 'center',
        marginBottom: 40,
    },
    avatarWrapper: {
        position: 'relative',
    },
    avatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
    },
    editIconContainer: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#3F4346',
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#2C2F33',
    },
    form: {
        gap: 20,
    },
    inputGroup: {
        gap: 12,
    },
    label: {
        color: '#FFFBF3',
        fontSize: 14,
        fontWeight: '600',
    },
    input: {
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        height: 56,
        paddingHorizontal: 16,
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
    },
    footer: {
        paddingHorizontal: 20,
        paddingBottom: 40,
        paddingTop: 10,
    },
    saveButton: {
        backgroundColor: '#B99A4A',
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    modalContent: {
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 30,
        width: '100%',
        alignItems: 'center',
    },
    successIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#34C759',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.semiBold,
        marginBottom: 12,
        letterSpacing: 0.2
    },
    modalDesc: {
        color: '#9BA1A6',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 22,
    },
    // Cropper styles
    cropperModalBackground: {
        flex: 1,
        backgroundColor: '#1A1E21',
    },
    cropperHeader: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    cropperHeaderTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
    },
    cropContainer: {
        position: 'absolute',
        overflow: 'hidden',
        backgroundColor: '#000',
    },
    cropRing: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#B99A4A',
        backgroundColor: 'transparent',
    },
    sliderWrapper: {
        position: 'absolute',
        alignItems: 'center',
    },
    zoomTip: {
        color: '#9BA1A6',
        fontSize: 12,
        marginTop: 4,
    },
    cropperFooter: {
        position: 'absolute',
        bottom: 50,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    cropperCancelBtn: {
        flex: 1,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
        backgroundColor: '#2C2F33',
        borderWidth: 1,
        borderColor: '#3F4346',
    },
    cropperCancelText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    cropperSaveBtn: {
        flex: 2,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
        backgroundColor: '#B99A4A',
    },
    cropperSaveText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Custom Slider styles
    sliderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E2124',
        paddingHorizontal: 16,
        paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2C2F33',
        height: 48,
    },
    sliderBtn: {
        padding: 8,
    },
    sliderTrackWrapper: {
        width: 180,
        height: 40,
        justifyContent: 'center',
        marginHorizontal: 10,
        position: 'relative',
    },
    sliderTrackBackground: {
        height: 4,
        backgroundColor: '#3F4346',
        borderRadius: 2,
    },
    sliderTrackActive: {
        position: 'absolute',
        left: 0,
        height: 4,
        backgroundColor: '#B99A4A',
        borderRadius: 2,
    },
    sliderKnob: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#B99A4A',
        borderWidth: 2,
        borderColor: '#FFF',
        top: 8, // vertically centered relative to sliderTrackWrapper height 40
    },
});

export default EditParticipantScreen;
