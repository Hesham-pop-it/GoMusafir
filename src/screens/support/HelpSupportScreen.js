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

const FAQItem = ({ question, onPress }) => (
    <TouchableOpacity style={styles.faqItem} onPress={onPress}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Feather name="chevron-right" size={20} color="#636D77" />
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
                'How to broadcast audio?',
                'Changing channel settings',
            ],
        },
    ];

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={28} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.title}>Help & Support</Text>
                <Text style={styles.subtitle}>What can we help you with?</Text>
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Feather name="search" size={20} color="#636D77" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Enter your keyword"
                        placeholderTextColor="#636D77"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {sections.map((section, index) => (
                    <SupportSection key={index} title={section.title} items={section.items} />
                ))}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121417',
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
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#9BA1A6',
    },
    searchContainer: {
        paddingHorizontal: 20,
        marginBottom: 30,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#262626',
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
        backgroundColor: '#1E2124',
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
        color: '#F4F4F5',
        flex: 1,
        marginRight: 10,
    },
    separator: {
        height: 1,
        backgroundColor: '#2C2E33',
        marginHorizontal: 20,
    },
});

export default HelpSupportScreen;
