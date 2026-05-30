import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, ScrollView, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';
import { useLanguage } from '../../context/LanguageContext';

const { width } = Dimensions.get('window');

const ParticipantDetailModal = ({
    isVisible,
    onClose,
    participant,
    liveLocations = {},
    isAdmin,
    onDelete,
    mapDarkStyle,
    isDecrypting
}) => {
    if (!participant) return null;

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

                    {isAdmin && (
                        <>
                            <TouchableOpacity
                                style={styles.deleteButtonPill}
                                onPress={() => onDelete('this')}
                            >
                                <Ionicons name="trash-outline" size={20} color="#FFF" style={{ marginRight: 10 }} />
                                <Text style={{ color: '#fff' }}>Delete for this trip</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.deleteButtonPill}
                                onPress={() => onDelete('all')}
                            >
                                <Ionicons name="trash-outline" size={20} color="#FFF" style={{ marginRight: 10 }} />
                                <Text style={{ color: '#fff' }}>Delete for all trip</Text>
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
        width: 60,
        height: 5,
        backgroundColor: '#FFF',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
        opacity: 0.8,
    },
    sheetTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(28),
        fontFamily: Typography.serif.regular,
        marginBottom: 16,
    },
    divider: {
        height: 0.2,
        backgroundColor: '#eeeeee',
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
});

export default ParticipantDetailModal;
