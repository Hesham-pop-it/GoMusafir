import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';
import GlowBackground from '../../components/GlowBackground';

const FAQItem = ({ question, onPress }) => (
    <TouchableOpacity style={styles.faqItem} onPress={onPress}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Feather name="chevron-right" size={20} color="#A1A1AA" />
    </TouchableOpacity>
);

const SupportSection = ({ title, items }) => (
    <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionCard}>
            {items.map((item, index) => (
                <React.Fragment key={index}>
                    <FAQItem question={item} />
                    {index < items.length - 1 && <View style={styles.separator} />}
                </React.Fragment>
            ))}
        </View>
    </View>
);

const HelpSupportScreen = () => {
    const navigation = useNavigation();
    const [searchQuery, setSearchQuery] = useState('');

    const sections = [
        {
            title: 'Product & Use',
            items: [
                'What does GoMusāfir do?',
                'Does it work without traveller accounts?',
                'Which platforms are supported?',
                'How long is a trip link valid?',
            ],
        },
        {
            title: 'Onboarding & Access',
            items: [
                'How do companies log in?',
                'Can we set team roles?',
                'Can unwanted participants be blocked?',
            ],
        },
        {
            title: 'Audio & Channels',
            items: [
                'Can unwanted participants be blocked?',
                'How does push-to-talk work?',
                'Does audio work on weak networks?',
                'Is audio recorded?',
            ],
        },
        {
            title: 'Participants & Data',
            items: [
                'What traveller data do you collect?',
                'Can we control data visibility?',
                'Can we correct participant details?',
            ],
        },
        {
            title: 'Live Location',
            items: [
                'Is live location required?',
            ],
        },
        {
            title: 'Group Chat',
            items: [
                'What does the group chat include?',
            ],
        },
        {
            title: 'Seats, Pricing & Payments',
            items: [
                'How do seats work?',
                'How do we pay?',
                'What happens if we delete a trip?'
            ],
        },
        {
            title: 'Security & Compliance',
            items: [
                'Do you comply with GDPR?',
                'MFA?',
                'Where is data hosted?',
            ],
        },
        {
            title: 'Devices & Earbuds',
            items: [
                'Which headsets do you recommend?',
                'Will standard earbuds work?',
            ],
        },
        {
            title: 'Support & SLA',
            items: [
                'Do you provide support during trips?',
                'What should we do during an incident?',
            ],
        },
        {
            title: 'Legal',
            items: [
                'Where are the Terms, Privacy Policy and DPA?',
            ],
        }
    ];

    return (
        <GlowBackground>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={styles.title}>Help & Support</Text>
                    <Text style={styles.subtitle}>What can we help you with?</Text>
                </View>

                <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                        <Feather name="search" size={20} color="#A1A1AA" style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Enter your keyword"
                            placeholderTextColor="#A1A1AA"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {sections.map((section, index) => (
                        <SupportSection key={index} title={section.title} items={section.items} />
                    ))}
                    <TouchableOpacity style={styles.contactButton}>
                        <Text style={styles.contactButtonText}>Contact Support</Text>
                    </TouchableOpacity>
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
    header: {
        paddingHorizontal: 20,
        paddingTop: 10,
        marginBottom: 30,
    },
    backButton: {
        marginLeft: -5,
        marginBottom: 20,
    },
    title: {
        fontSize: 32,
        color: '#FFF',
        fontFamily: 'CormorantGaramond_Bold',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#A1A1AA',
    },
    searchContainer: {
        paddingHorizontal: 20,
        marginBottom: 30,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(253, 253, 253, 0.1)',
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 56,
    },
    searchIcon: {
        marginRight: 12,
    },
    searchInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 16,
    },
    sectionCard: {
        backgroundColor: '#23272A',
        borderRadius: 16,
        overflow: 'hidden',
    },
    faqItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 18,
        paddingHorizontal: 20,
    },
    faqQuestion: {
        fontSize: 15,
        color: '#fff',
        flex: 1,
        marginRight: 10,
    },
    separator: {
        // height: 1,
        // backgroundColor: '#23272A',
        // marginHorizontal: 20,
    },
    contactButton: {
        backgroundColor: '#B99A4A',
        padding: 16,
        borderRadius: 50,
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 30,
    },
    contactButtonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});

export default HelpSupportScreen;
