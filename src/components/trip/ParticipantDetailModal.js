import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import Modal from 'react-native-modal';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '../../constants/Typography';
import { responsiveFontSize } from '../../utils/responsive';

const { width } = Dimensions.get('window');

const ParticipantDetailModal = ({
    isVisible,
    onClose,
    participant,
    liveLocations = {},
    isAdmin,
    onDelete,
    mapDarkStyle
}) => {
    if (!participant) return null;

    const participantLocation = liveLocations[participant.id];

    const latitude = participantLocation?.lat || 21.4225;
    const longitude = participantLocation?.lng || 39.8262;

    return (
        <Modal
            isVisible={isVisible}
            onBackdropPress={onClose}
            onBackButtonPress={onClose}
            onSwipeComplete={onClose}
            swipeDirection="down"
            swipeThreshold={100}
            propagateSwipe={true}
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
