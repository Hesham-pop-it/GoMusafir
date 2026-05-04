import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Share,
    Platform,
    Dimensions,
    ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { responsiveFontSize } from '../../utils/responsive';
import { Colors } from '../../constants/Colors';

import GlowBackground from '../../components/GlowBackground';

const { width } = Dimensions.get('window');

const QRDownloadIcon = () => (
    <Svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ marginRight: 10 }}>
        <Path d="M12.75 20.0001H8.75V21.5001H12.75V20.0001ZM1.5 12.7501V8.75006H1.26578e-06V12.7501H1.5ZM20 12.3131V12.7501H21.5V12.3131H20ZM13.641 3.36106L17.6 6.92406L18.603 5.80806L14.645 2.24506L13.641 3.36106ZM21.5 12.3131C21.5 10.6241 21.515 9.55406 21.09 8.59805L19.719 9.20905C19.985 9.80705 20 10.4921 20 12.3131H21.5ZM17.6 6.92406C18.953 8.14206 19.453 8.61205 19.719 9.20905L21.09 8.59805C20.664 7.64106 19.859 6.93806 18.603 5.80806L17.6 6.92406ZM8.78 1.50006C10.362 1.50006 10.959 1.51206 11.49 1.71606L12.028 0.316056C11.176 -0.0119442 10.248 5.57854e-05 8.78 5.57854e-05V1.50006ZM14.645 2.24606C13.559 1.26906 12.88 0.642056 12.028 0.316056L11.491 1.71606C12.023 1.92006 12.471 2.30806 13.641 3.36106L14.645 2.24606ZM8.75 20.0001C6.843 20.0001 5.489 19.9981 4.46 19.8601C3.455 19.7251 2.875 19.4711 2.452 19.0481L1.392 20.1081C2.14 20.8581 3.089 21.1891 4.261 21.3471C5.411 21.5021 6.886 21.5001 8.75 21.5001V20.0001ZM1.26578e-06 12.7501C1.26578e-06 14.6141 -0.00199874 16.0881 0.153001 17.2391C0.311001 18.4111 0.643001 19.3601 1.391 20.1091L2.451 19.0491C2.029 18.6251 1.775 18.0451 1.64 17.0391C1.502 16.0121 1.5 14.6571 1.5 12.7501H1.26578e-06ZM12.75 21.5001C14.614 21.5001 16.088 21.5021 17.239 21.3471C18.411 21.1891 19.36 20.8571 20.109 20.1091L19.049 19.0491C18.625 19.4711 18.045 19.7251 17.039 19.8601C16.012 19.9981 14.657 20.0001 12.75 20.0001V21.5001ZM20 12.7501C20 14.6571 19.998 16.0121 19.86 17.0401C19.725 18.0451 19.471 18.6251 19.048 19.0481L20.108 20.1081C20.858 19.3601 21.189 18.4111 21.347 17.2391C21.502 16.0891 21.5 14.6141 21.5 12.7501H20ZM1.5 8.75006C1.5 6.84306 1.502 5.48906 1.64 4.46006C1.775 3.45506 2.029 2.87506 2.452 2.45206L1.392 1.39206C0.642001 2.14006 0.311001 3.08906 0.153001 4.26106C-0.00199874 5.41106 1.26578e-06 6.88606 1.26578e-06 8.75006H1.5ZM8.78 5.57854e-05C6.905 5.57854e-05 5.424 -0.00194421 4.269 0.153056C3.092 0.311056 2.14 0.643056 1.391 1.39106L2.451 2.45106C2.875 2.02906 3.456 1.77506 4.468 1.64006C5.501 1.50206 6.863 1.50006 8.78 1.50006V5.57854e-05Z" fill="#B99A4A" />
        <Path d="M11.75 1.25V3.75C11.75 6.107 11.75 7.286 12.482 8.018C13.214 8.75 14.393 8.75 16.75 8.75H20.75" stroke="#B99A4A" strokeWidth={1.5} />
        <Path d="M7.25 12.25V17.25M7.25 17.25L9.25 15.375M7.25 17.25L5.25 15.375" stroke="#B99A4A" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

const PresentationIcon = () => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginRight: 10 }}>
        <Path d="M2 2H22M9 10.5L10.293 9.207C10.626 8.874 10.793 8.707 11 8.707C11.207 8.707 11.374 8.874 11.707 9.207L12.293 9.793C12.626 10.126 12.793 10.293 13 10.293C13.207 10.293 13.374 10.126 13.707 9.793L15 8.5M12 21V17M12 21L10 22M12 21L14 22" stroke="#B99A4A" strokeWidth={1.5} strokeLinecap="round" />
        <Path d="M20 2V10.5C20 13.564 20 15.096 18.996 16.048C17.992 17 16.376 17 13.143 17H10.857C7.625 17 6.008 17 5.004 16.048C4 15.096 4 13.564 4 10.5V2" stroke="#B99A4A" strokeWidth={1.5} />
    </Svg>
);

const JourneySuccessScreen = ({ route }) => {
    const navigation = useNavigation();
    const { invitationCode } = route.params;
    const invitationLink = "gomusafir.app/link/" + invitationCode;

    const handleShare = async () => {
        try {
            await Share.share({
                message: `Join my journey on GoMusafir: ${invitationLink}`,
            });
        } catch (error) {
            console.log(error.message);
        }
    };

    const handleDownloadQR = async () => {
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission Required", "Please allow GoMusafir to access your photos to save the QR code.");
                return;
            }

            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=https://gomusafir.app/link/${invitationCode}`;
            const filename = FileSystem.documentDirectory + "gomusafir_qr.png";
            
            const { uri } = await FileSystem.downloadAsync(qrUrl, filename);
            await MediaLibrary.saveToLibraryAsync(uri);
            Alert.alert("Success", "QR Code saved to your gallery!");
        } catch (error) {
            console.error(error);
            Alert.alert("Error", "Failed to save QR code.");
        }
    };

    return (
        <GlowBackground>
            <SafeAreaView style={styles.container}>
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {/* Header / Title */}
                    <Text style={styles.title}>Journey Successfully Created</Text>

                    {/* Invitation Link Section */}
                    <View style={styles.section}>
                        <Text style={styles.label}>Invitation Link</Text>
                        <View style={styles.linkContainer}>
                            <Text style={styles.linkText}>{invitationLink}</Text>
                            <TouchableOpacity onPress={handleShare}>
                                <Ionicons name="copy-outline" size={20} color="#A1A1AA" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* QR Code Section */}
                    <View style={styles.section}>
                        <Text style={styles.label}>QR Code</Text>
                        <View style={styles.qrCard}>
                            <Image
                                source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=https://gomusafir.app/link/${invitationCode}` }}
                                style={styles.qrImage}
                            />
                        </View>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.buttonContainer}>
                        <TouchableOpacity style={styles.outlineButton} onPress={handleDownloadQR}>
                            <QRDownloadIcon />
                            <Text style={styles.outlineButtonText}>Download QR</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.outlineButton}>
                            <PresentationIcon />
                            <Text style={styles.outlineButtonText}>Download Presentation</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.solidButton} onPress={()=> navigation.goBack()}>
                            <Text style={styles.solidButtonText}>Back to App</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </GlowBackground>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 40,
    },
    title: {
        fontSize: responsiveFontSize(32),
        color: '#FFF',
        fontFamily: 'CormorantGaramond_SemiBold',
        marginBottom: 40,
        textAlign: 'left',
    },
    section: {
        marginBottom: 24,
    },
    label: {
        color: '#fff',
        fontSize: responsiveFontSize(14),
        marginBottom: 10,
        fontFamily: 'IBMPlexSans',
    },
    linkContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(253,253,253,0.1)',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 56
    },
    linkText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: 'IBMPlexSans',
    },
    qrCard: {
        backgroundColor: 'rgba(253,253,253,0.1)',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    qrImage: {
        width: width * 0.6,
        height: width * 0.6,
        borderRadius: 8,
        backgroundColor: '#fff',
        padding: 16
    },
    buttonContainer: {
        marginTop: 20,
        gap: 16,
    },
    outlineButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 56,
        borderRadius: 28,
        borderWidth: 0.8,
        borderColor: '#B99A4A',
        backgroundColor: 'transparent',
    },
    outlineButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontWeight: '600',
        fontFamily: 'IBMPlexSans',
    },
    solidButton: {
        height: 56,
        borderRadius: 28,
        backgroundColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    solidButtonText: {
        color: '#fff',
        fontSize: responsiveFontSize(16),
        fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
    },
});

export default JourneySuccessScreen;
