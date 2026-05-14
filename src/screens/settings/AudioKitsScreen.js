import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    ScrollView,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';

const { width } = Dimensions.get('window');

const AudioKitsScreen = ({ navigation }) => {
    
    const PlaceholderCard = ({ showHeart = true }) => (
        <View style={styles.cardContainer}>
            {/* Checkerboard pattern simulation or just a light gray placeholder */}
            <View style={styles.placeholderImage}>
                {/* We use a solid light grey instead of a literal checkerboard image for cleanliness, 
                    but to match the design we can add a subtle pattern or just a clean block */}
                <View style={styles.checkerPattern} />
                
                {showHeart && (
                    <TouchableOpacity style={styles.heartIcon}>
                        <Ionicons name="heart" size={28} color="#B99A4A" />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} translucent />
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
                
                {/* Header */}
                <View style={styles.headerContainer}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Get audio kits for travellers</Text>
                </View>

                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    
                    {/* Hero Card */}
                    <PlaceholderCard />
                    
                    {/* Section Title */}
                    <Text style={styles.sectionTitle}>Audio Kits</Text>
                    
                    {/* List of Cards */}
                    <PlaceholderCard />
                    <PlaceholderCard />
                    
                </ScrollView>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1C1C1E', // Very dark gray/black background as in mockup
    },
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingTop: 10,
        paddingBottom: 20,
    },
    backButton: {
        padding: 5,
        marginRight: 5,
    },
    headerTitle: {
        fontSize: 22,
        color: '#FFF',
        fontFamily: Typography.serif.regular,
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    cardContainer: {
        width: '100%',
        aspectRatio: 1, // Makes it a square as shown in the picture
        borderRadius: 16,
        backgroundColor: '#D1D5DB', // Placeholder gray
        marginBottom: 20,
        overflow: 'hidden',
    },
    placeholderImage: {
        flex: 1,
        backgroundColor: '#E5E5EA', // Light gray background
    },
    checkerPattern: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#EFEFF4', // Slightly different gray to give a placeholder feel
        opacity: 0.5,
    },
    heartIcon: {
        position: 'absolute',
        top: 15,
        right: 15,
        zIndex: 10,
    },
    sectionTitle: {
        fontSize: 16,
        color: '#FFF',
        fontFamily: Typography.sans.bold,
        marginBottom: 15,
        marginTop: 5,
    }
});

export default AudioKitsScreen;
