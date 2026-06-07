import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, ScrollView, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const ParticipantDetailModal = ({
    isVisible,
    onClose,
    participant,
    liveLocations = {},
    isAdmin,
    onDelete,
    mapDarkStyle,
    isDecrypting,
    tripId
}) => {
    if (!participant) return null;

    const navigation = useNavigation();
    const [scrollOffset, setScrollOffset] = useState(0);
    const scrollViewRef = useRef(null);

    const handleOnScroll = (event) => {
        setScrollOffset(event.nativeEvent.contentOffset.y);
    };

    const handleScrollTo = (p) => {
        if (scrollViewRef.current) {
            scrollViewRef.current.scrollTo(p);
        }
    };

    const { t } = useLanguage();
    const participantLocation = liveLocations[participant.id];

    const latitude = participantLocation?.lat || 21.4225;
    const longitude = participantLocation?.lng || 39.8262;

    const nameParts = participant.name ? participant.name.trim().split(/\s+/) : ['Guest'];
    const firstName = participant.firstName || nameParts[0] || 'Guest';
    const lastName = participant.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

    return (
        <Modal
            isVisible={isVisible}
            onBackdropPress={onClose}
            onBackButtonPress={onClose}
            onSwipeComplete={onClose}
            swipeDirection="down"
            swipeThreshold={100}
            propagateSwipe={true}
            scrollTo={handleScrollTo}
            scrollOffset={scrollOffset}
            scrollOffsetMax={300}
            useNativeDriver={false}
            useNativeDriverForBackdrop={true}
            animationIn="bounceInUp"
            animationOut="bounceOutDown"
            style={{ margin: 0, justifyContent: 'flex-end' }}
        >
            <View style={styles.bottomSheet}>
                <View style={styles.handle} />
                <Text style={styles.sheetTitle}>Participant Detail</Text>
                <View style={styles.divider} />
                
                <ScrollView 
                    ref={scrollViewRef}
                    onScroll={handleOnScroll}
                    scrollEventThrottle={16}
                    style={{ flexShrink: 1 }} 
                    contentContainerStyle={{ paddingBottom: 20 }} 
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.detailHeader}>
                        <Image source={{ uri: participant.image }} style={styles.detailAvatar} />
                        <Text style={styles.detailName}>{participant.name}</Text>
                    </View>

                    {/* Real Map View */}
                    <View style={styles.mapPlaceholder}>
                        <MapView
                            style={StyleSheet.absoluteFill}
                            initialRegion={{
                                latitude,
                                longitude,
                                latitudeDelta: 0.01,
                                longitudeDelta: 0.01,
                            }}
                            region={{
                                latitude,
                                longitude,
                                latitudeDelta: 0.01,
                                longitudeDelta: 0.01,
                            }}
                            customMapStyle={mapDarkStyle}
                        >
                            <Marker
                                coordinate={{ latitude, longitude }}
                            >
                                <View style={styles.mapPinContainer}>
                                    <Image source={{ uri: participant.image }} style={styles.mapPinAvatar} />
                                </View>
                            </Marker>
                        </MapView>
                    </View>

                    {/* Name Fields */}
                    <View style={styles.row}>
                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>{t('first_name')}</Text>
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputText}>{firstName}</Text>
                            </View>
                        </View>
                        <View style={styles.halfWidth}>
                            <Text style={styles.label}>{t('last_name')}</Text>
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputText}>{lastName}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Email */}
                    <Text style={styles.label}>{t('email')}</Text>
                    <View style={styles.inputContainer}>
                        {isDecrypting && (!participant.email || participant.email === 'N/A' || participant.email.includes('*') || !participant.email.includes('@')) ? (
                            <ActivityIndicator size="small" color="#B99A4A" style={{ alignSelf: 'flex-start' }} />
                        ) : (
                            <Text style={styles.inputText}>{participant.email || 'N/A'}</Text>
                        )}
                    </View>

                    {/* Phone */}
                    <Text style={styles.label}>{t('phone')}</Text>
                    <View style={styles.inputContainer}>
                        {isDecrypting && (!participant.phone || participant.phone === 'N/A' || participant.phone.includes('*')) ? (
                            <ActivityIndicator size="small" color="#B99A4A" style={{ alignSelf: 'flex-start' }} />
                        ) : (
                            <Text style={styles.inputText}>{participant.phone || 'N/A'}</Text>
                        )}
                    </View>

                    {isAdmin && (
                        <>
                            <TouchableOpacity
                                style={styles.editButtonPill}
                                onPress={() => {
                                    onClose();
                                    navigation.navigate('EditParticipant', { participant, tripId });
                                }}
                            >
                                <Text style={styles.editButtonText}>Edit Participant</Text>
                            </TouchableOpacity>
 
                            <TouchableOpacity
                                style={styles.deleteButtonPill}
                                onPress={() => onDelete('this')}
                            >
                                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <Path d="M2.75002 6.167C2.75002 5.707 3.09502 5.333 3.52102 5.333H6.18602C6.71502 5.318 7.18202 4.955 7.36202 4.417L7.39202 4.322L7.50702 3.95C7.57702 3.722 7.63802 3.523 7.72402 3.345C8.06202 2.643 8.68802 2.156 9.41102 2.031C9.59502 2 9.78802 2 10.011 2H13.489C13.712 2 13.906 2 14.089 2.031C14.812 2.156 15.439 2.643 15.776 3.345C15.862 3.523 15.923 3.722 15.993 3.95L16.108 4.322L16.138 4.417C16.318 4.955 16.878 5.319 17.408 5.333H19.978C20.405 5.333 20.75 5.706 20.75 6.167C20.75 6.628 20.405 7 19.979 7H3.52002C3.09402 7 2.75002 6.627 2.75002 6.167ZM11.607 22H12.394C15.101 22 16.454 22 17.335 21.137C18.215 20.273 18.305 18.857 18.485 16.026L18.745 11.945C18.843 10.408 18.892 9.64 18.45 9.153C18.008 8.666 17.263 8.666 15.771 8.666H8.23002C6.73902 8.666 5.99302 8.666 5.55102 9.153C5.10902 9.64 5.15902 10.408 5.25602 11.945L5.51602 16.025C5.69602 18.858 5.78602 20.273 6.66602 21.137C7.54602 22.001 8.90002 22 11.607 22Z" fill="white"/>
                                </Svg>
                                <Text style={{ color: '#fff', fontFamily: Typography.sans.semiBold, fontSize: 16, marginLeft: 5 }}>Delete for this trip</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.deleteButtonPill}
                                onPress={() => onDelete('all')}
                            >
                                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <Path d="M2.75002 6.167C2.75002 5.707 3.09502 5.333 3.52102 5.333H6.18602C6.71502 5.318 7.18202 4.955 7.36202 4.417L7.39202 4.322L7.50702 3.95C7.57702 3.722 7.63802 3.523 7.72402 3.345C8.06202 2.643 8.68802 2.156 9.41102 2.031C9.59502 2 9.78802 2 10.011 2H13.489C13.712 2 13.906 2 14.089 2.031C14.812 2.156 15.439 2.643 15.776 3.345C15.862 3.523 15.923 3.722 15.993 3.95L16.108 4.322L16.138 4.417C16.318 4.955 16.878 5.319 17.408 5.333H19.978C20.405 5.333 20.75 5.706 20.75 6.167C20.75 6.628 20.405 7 19.979 7H3.52002C3.09402 7 2.75002 6.627 2.75002 6.167ZM11.607 22H12.394C15.101 22 16.454 22 17.335 21.137C18.215 20.273 18.305 18.857 18.485 16.026L18.745 11.945C18.843 10.408 18.892 9.64 18.45 9.153C18.008 8.666 17.263 8.666 15.771 8.666H8.23002C6.73902 8.666 5.99302 8.666 5.55102 9.153C5.10902 9.64 5.15902 10.408 5.25602 11.945L5.51602 16.025C5.69602 18.858 5.78602 20.273 6.66602 21.137C7.54602 22.001 8.90002 22 11.607 22Z" fill="white"/>
                                </Svg>
                                <Text style={{ color: '#fff', fontFamily: Typography.sans.semiBold, fontSize: 16, marginLeft: 5 }}>Delete for all trip</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    bottomSheet: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
        width: '100%',
        marginTop: 'auto',
        maxHeight: Dimensions.get('window').height * 0.9,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    halfWidth: {
        flex: 1,
    },
    label: {
        fontSize: 14,
        color: '#fff',
        fontFamily: Typography.sans.regular,
        marginBottom: 8,
    },
    inputContainer: {
        backgroundColor: '#23272A',
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    inputText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
    },
    handle: {
        width: 130,
        height: 5,
        backgroundColor: '#FFF',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,

    },
    sheetTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(28),
        fontFamily: Typography.serif.regular,
        marginBottom: 16,
    },
    divider: {
        height: 1,
        opacity: 0.5,
        backgroundColor: '#EEEEEE',
        marginBottom: 24,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    detailAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        marginRight: 16,
    },
    detailName: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    mapPlaceholder: {
        width: '100%',
        height: 180,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 30,
        backgroundColor: '#1A1E21',
    },
    mapPinContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#B99A4A',
        overflow: 'hidden',
        backgroundColor: '#1E2124',
    },
    mapPinAvatar: {
        width: '100%',
        height: '100%',
    },
    deleteButtonPill: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        backgroundColor: '#942F31',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    editButtonPill: {
        width: '100%',
        height: 56,
        borderRadius: 28,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    editButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
    },
});

export default ParticipantDetailModal;
