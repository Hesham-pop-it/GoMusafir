import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ScrollView,
    LayoutAnimation,
    Platform,
    UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Typography } from '../../constants/Typography';
import GlowBackground from '../../components/GlowBackground';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQItem = ({ question, answer, isExpanded, onPress }) => (
    <View style={styles.faqItemContainer}>
        <TouchableOpacity
            style={styles.faqItem}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={styles.faqQuestion}>{question}</Text>
            <Feather
                name={isExpanded ? "chevron-down" : "chevron-right"}
                size={20}
                color={"#A1A1AA"}
            />
        </TouchableOpacity>
        {isExpanded && (
            <View style={styles.answerContainer}>
                <Text style={styles.faqAnswer}>{answer}</Text>
            </View>
        )}
    </View>
);

const SupportSection = ({ title, items, expandedId, onToggleItem, showTitle = true }) => (
    <View style={styles.section}>
        {showTitle && <Text style={styles.sectionTitle}>{title}</Text>}
        <View style={styles.sectionCard}>
            {items.map((item, index) => {
                const itemId = `${title}-${index}`;
                return (
                    <React.Fragment key={itemId}>
                        <FAQItem
                            question={item.question}
                            answer={item.answer}
                            isExpanded={expandedId === itemId}
                            onPress={() => onToggleItem(itemId)}
                        />
                        {index < items.length - 1 && <View style={styles.separator} />}
                    </React.Fragment>
                );
            })}
        </View>
    </View>
);

const HelpSupportScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { isAdmin = false } = route.params || {};

    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    const adminFaqData = [
        {
            title: 'Product & Use',
            items: [
                {
                    question: 'What does GoMusāfir do?',
                    answer: 'GoMusāfir provides live audio communication for group trips. Organisations create a trip and share a link/QR; travellers join without an account and can listen or speak when allowed.'
                },
                {
                    question: 'Does it work without traveller accounts?',
                    answer: 'Yes. Travellers join via link or QR and enter basic details.'
                },
                {
                    question: 'Which platforms are supported?',
                    answer: 'iOS and Android for organisers and travellers.'
                },
                {
                    question: 'How long is a trip link valid?',
                    answer: 'Until the organiser deletes the trip or the end date passes. Then it expires automatically.'
                },
            ],
        },
        {
            title: 'Onboarding & Access',
            items: [
                {
                    question: 'How do companies log in?',
                    answer: 'Business email with password and MFA Team invites are supported.'
                },
                {
                    question: 'Can we set team roles?',
                    answer: 'Yes. Organiser (full control), Co-host (nearly all, no delete), Manager (moderation/data edits, no delete/purchases).'
                },
                {
                    question: 'Can unwanted participants be blocked?',
                    answer: 'Yes. Removed/blocked participants cannot re-enter that trip unless reinstated.'
                },
            ],
        },
        {
            title: 'Audio & Channels',
            items: [
                {
                    question: 'What does “Mute All” do?',
                    answer: 'Disables speaking for everyone except organiser/co-hosts.'
                },
                {
                    question: 'How does push-to-talk work?',
                    answer: 'Travellers get a speak button when the organiser enables it. Press and hold to speak.'
                },
                {
                    question: 'Does audio work on weak networks?',
                    answer: 'Yes. The app lowers bitrate automatically to preserve intelligibility on Wi-Fi/4G/5G.'
                },
                {
                    question: 'Is audio recorded?',
                    answer: 'Not by default. If recording is enabled in future, a visible indicator and consent text will appear.'
                },
            ],
        },
        {
            title: 'Participants & Data',
            items: [
                {
                    question: 'What traveller data do you collect?',
                    answer: 'Name, email, phone, and optional profile photo. Location sharing is optional and policy-controlled.'
                },
                {
                    question: 'Can we control data visibility?',
                    answer: 'Yes. Per field: show to organiser, show to everyone, hide, or custom.'
                },
                {
                    question: 'Can we correct participant details?',
                    answer: 'Yes. Organiser and Manager can edit via the participant sheet.'
                },
            ],
        },
        {
            title: 'Live Location',
            items: [
                {
                    question: 'Is live location required?',
                    answer: 'No. It’s optional and governed by organiser policy. Travellers may use Incognito Mode if allowed.'
                },
            ],
        },
        {
            title: 'Group Chat',
            items: [
                {
                    question: 'What does the group chat include?',
                    answer: 'Text, images, location, and standard templates (e.g., “Bus departs in 5 minutes”). Opens directly to the trip’s group chat.'
                },
            ],
        },
        {
            title: 'Seats, Pricing & Payments',
            items: [
                {
                    question: 'How do seats work?',
                    answer: 'Seats define the maximum number of travellers per trip. You can add more later.'
                },
                {
                    question: 'How do we pay?',
                    answer: 'Via a Stripe checkout after creating or expanding a trip.'
                },
                {
                    question: 'What happens if we delete a trip?',
                    answer: 'All trip data is permanently deleted and seats are cancelled. As confirmed in the popup, there is no refund after deletion.'
                },
            ],
        },
        {
            title: 'Security & Compliance',
            items: [
                {
                    question: 'Do you comply with GDPR?',
                    answer: 'Yes. Data minimisation, encrypted transport, clear retention. A DPA is available for B2B customers.'
                },
                {
                    question: 'MFA?',
                    answer: 'MFA has been enforced.'
                },
                {
                    question: 'Where is data hosted?',
                    answer: 'EU data residency is available by default.'
                },
            ],
        },
        {
            title: 'Devices & Earbuds',
            items: [
                {
                    question: 'Which headsets do you recommend?',
                    answer: 'Use “Order earbuds (partner)” to buy pre-tested, low-latency devices optimised for GoMusāfir.'
                },
                {
                    question: 'Will standard earbuds work?',
                    answer: 'Yes, though certified low-latency headsets offer the best clarity.'
                },
            ],
        },
        {
            title: 'Support & SLA',
            items: [
                {
                    question: 'Do you provide support during trips?',
                    answer: 'Yes. Via Help & Support and app.gomusafir.app/contact. SLA options are available on contract.'
                },
                {
                    question: 'What should we do during an incident?',
                    answer: 'Check network, restart the channel, reduce active speakers if needed, and contact support via the link if issues persist.'
                },
            ],
        },
        {
            title: 'Legal',
            items: [
                {
                    question: 'Where are the Terms, Privacy Policy and DPA?',
                    answer: 'On our website. Companies accept them at sign-up; travellers can access them from Help & Support.'
                },
            ],
        },
    ];

    const participantFaqData = [
        {
            title: 'Joining & Access',
            items: [
                {
                    question: 'How do I join a trip?',
                    answer: 'Open the link or scan the QR you received from the organiser. Fill in your name, email, phone and optional profile photo, then tap Join.'
                },
                {
                    question: 'Do I need an account or password?',
                    answer: 'Yes. You join with the organiser’s link or QR.'
                },
                {
                    question: 'What information is required to join?',
                    answer: 'Name and a valid email. Phone number helps the organiser reach you if needed. A profile photo is required to recognize.'
                },
                {
                    question: 'I can’t open the link. What should I do?',
                    answer: 'Ask the organiser to resend the link, try another network (Wi-Fi or mobile data) and make sure your phone’s date and time are set automatically.'
                },
                {
                    question: 'Can I switch phones and rejoin?',
                    answer: 'Yes. Use the same trip link on your new device. You may need to re-enter your details.'
                },
            ],
        },
        {
            title: 'Audio & Speaking',
            items: [
                {
                    question: 'I joined but I can’t hear anything.',
                    answer: 'Check your volume, silent mode. Make sure the organiser has started the audio channel. Try headphones.'
                },
                {
                    question: 'Where is the speak button?',
                    answer: 'The speak button appears only when the organiser allows participants to speak. If “Mute All” is on, the button is hidden or disabled.'
                },
                {
                    question: 'How do I speak?',
                    answer: 'Press and hold the speak button to talk. Release to stop. Keep it brief and clear.'
                },
                {
                    question: 'The audio cuts out or sounds robotic.',
                    answer: 'Move to an area with better signal or switch to Wi-Fi. The app reduces audio quality automatically to stay connected.'
                },
                {
                    question: 'Is audio recorded?',
                    answer: 'By default, no. If the organiser enables recording, you will see a clear recording indicator and consent message.'
                },
                {
                    question: 'The speak button is grey even when others talk.',
                    answer: 'The organiser may allow only host and co-hosts to speak. Wait until they enable participant speaking.'
                },
            ],
        },
        {
            title: 'App Usage & Devices',
            items: [
                {
                    question: 'What devices are supported?',
                    answer: 'iOS and Android phones. Use recent versions for best audio quality.'
                },
                {
                    question: 'Can I use the app while the screen is off?',
                    answer: 'Yes, you can listen with the screen off. Keep the app in the foreground for the most reliable connection.'
                },
                {
                    question: 'Do I need special earbuds?',
                    answer: 'No, standard earbuds work. Low-latency headsets give clearer sound in noisy places.'
                },
                {
                    question: 'Will this use a lot of data or battery?',
                    answer: 'Audio uses modest data and the app is optimised for battery. Using Wi-Fi helps reduce data use.'
                },
            ],
        },
        {
            title: 'Privacy & Profile',
            items: [
                {
                    question: 'Can I change my name, photo or contact details?',
                    answer: 'No, ask your organizer. The organiser or manager can correct details if needed.'
                },
                {
                    question: 'Can others see my phone number or email?',
                    answer: 'Visibility is controlled by the organiser’s settings.'
                },
                {
                    question: 'Is my location shared with the group?',
                    answer: 'Only if you choose to share it and the organiser enables location. You can turn sharing on or off at any time. An Incognito option may be available.'
                },
                {
                    question: 'I think I was muted or removed. What now?',
                    answer: 'If you are muted, you can still listen. If removed, you cannot rejoin that trip unless the organiser reinstates you.'
                },
            ],
        },
        {
            title: 'Trip Management',
            items: [
                {
                    question: 'The group chat shows only one chat. Is that correct?',
                    answer: 'Each trip has one group chat for all participants in that trip.'
                },
                {
                    question: 'I’m not receiving notifications or I missed an update.',
                    answer: 'Check your system notification settings for the app, and re-open the trip to sync.'
                },
                {
                    question: 'How do I leave a trip?',
                    answer: 'Open the trip settings and choose Leave trip. You can rejoin later using the link if the trip is still active and you’re not blocked.'
                },
                {
                    question: 'What happens when the trip ends or is deleted?',
                    answer: 'Access to the trip closes and all related data for that trip is removed according to policy.'
                },
            ],
        },
        {
            title: 'Support',
            items: [
                {
                    question: 'How do I get help?',
                    answer: 'Use Help & Support in the app or visit app.gomusafir.app/contact. Include your device type and a brief description of the issue.'
                },
            ],
        },
    ];

    const toggleItem = (id) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedId(expandedId === id ? null : id);
    };

    // Transformation logic based on role
    const getDisplayData = () => {
        const sourceData = isAdmin ? adminFaqData : participantFaqData;

        if (isAdmin) {
            return sourceData.map(section => ({
                ...section,
                items: section.items.filter(item =>
                    item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    item.answer.toLowerCase().includes(searchQuery.toLowerCase())
                )
            })).filter(section => section.items.length > 0);
        } else {
            // Flatten everything for participants
            const allItems = sourceData.flatMap(section => section.items).filter(item =>
                item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.answer.toLowerCase().includes(searchQuery.toLowerCase())
            );
            return allItems.length > 0 ? [{ title: 'All Questions', items: allItems }] : [];
        }
    };

    const filteredSections = getDisplayData();

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
                    {filteredSections.map((section, index) => (
                        <SupportSection
                            key={index}
                            title={section.title}
                            items={section.items}
                            expandedId={expandedId}
                            onToggleItem={toggleItem}
                            showTitle={isAdmin} // Only show section titles for admins
                        />
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
        fontFamily: Typography.serif.bold,
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
        fontFamily: Typography.sans.bold,
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
        color: '#FFF',
        fontFamily: Typography.sans.bold,
        marginBottom: 16,
    },
    sectionCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        overflow: 'hidden',
    },
    faqItemContainer: {
        width: '100%',
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
        fontFamily: Typography.sans.regular,
    },
    answerContainer: {
        paddingHorizontal: 20,
        paddingBottom: 18,
        marginTop: -5,
    },
    faqAnswer: {
        fontSize: 14,
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
        lineHeight: 20,
    },
    separator: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        marginHorizontal: 20,
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
        fontFamily: Typography.sans.bold,
        fontSize: 16,
    },
});

export default HelpSupportScreen;

