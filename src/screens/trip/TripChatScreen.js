import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ImageBackground,
    TouchableOpacity,
    FlatList,
    TextInput,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    Modal,
    TouchableWithoutFeedback,
    Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';
import TripBottomTabBar from '../../components/TripBottomTabBar';

const { width } = Dimensions.get('window');

const MOCK_MESSAGES = [
    {
        id: '1',
        text: '1912. Again...',
        sender: 'other',
        senderName: 'Titor',
        time: '08:55',
        avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    },
    {
        id: '2',
        text: 'Anyway... Group trip? Any era’s fine, just not 2020. 😐',
        sender: 'me',
        time: '09:34',
        read: true,
    },
    {
        id: '3',
        text: 'You’ll all laugh...',
        sender: 'other',
        senderName: 'Titor',
        time: '10:01',
        avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
        replyTo: {
            sender: 'You',
            text: 'Anyway... Group trip? Any era’s fine, just not 2020. 😐',
            color: '#D32F2F' // Pinkish line color from screenshot
        }
    },
    {
        id: '4',
        text: '...until the clock hits 2:17 AM, March 14th, 2036.',
        sender: 'other',
        senderName: 'Titor',
        time: '10:01',
        avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    }
];

const QUICK_OPTIONS = [
    { id: 'photo', label: 'Photo', icon: 'image', type: 'ionicon', color: '#2196F3', bg: '#1A2733' },
    { id: 'location', label: 'Location', icon: 'location', type: 'ionicon', color: '#009688', bg: '#1A2927' },
    { id: '5min', label: '5 Minutes', icon: 'bus', type: 'font-awesome-5', color: '#FFC107', bg: '#2E2818' },
    { id: 'camera', label: 'Camera', icon: 'camera', type: 'ionicon', color: '#ECEFF1', bg: '#26292E' },
    { id: 'ontheway', label: 'On The Way', icon: 'chatplus', type: 'custom', color: '#FFFFFF', bg: '#2A2D33' }, // Custom icon shim
    { id: 'template1', label: 'Template', icon: 'chatprocessing', type: 'custom', color: '#FFFFFF', bg: '#2A2D33' },
    { id: 'template2', label: 'Template', icon: 'chatprocessing', type: 'custom', color: '#FFFFFF', bg: '#2A2D33' },
    { id: 'template3', label: 'Template', icon: 'chatprocessing', type: 'custom', color: '#FFFFFF', bg: '#2A2D33' },
];

const TripChatScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { trip, invitationCode: directCode } = route.params || {};
    const invitationCode = directCode || trip?.invitationCode;
    const isAdmin = !invitationCode;

    const [inputText, setInputText] = useState('');
    const [showAttachments, setShowAttachments] = useState(false);
    const [options, setOptions] = useState(QUICK_OPTIONS);
    const [messages, setMessages] = useState(MOCK_MESSAGES);
    const inputRef = useRef(null);
    const flatListRef = useRef(null);

    // Auto-focus keyboard on mount (like WhatsApp usually focuses if entering recent chat, or requested)
    // User requested: "for chat keyboard should be opened by default"
    useEffect(() => {
        // Small delay to ensure screen transition finishes
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    const toggleAttachments = () => {
        if (showAttachments) {
            // Switch to Keyboard
            setShowAttachments(false);
            inputRef.current?.focus();
        } else {
            // Switch to Attachments
            Keyboard.dismiss();
            // Wait for keyboard to dismiss before showing attachments to avoid jumpiness? 
            // Or immediate. WhatsApp is immediate but resize happens.
            // On React Native, removing focus dismisses keyboard.
            setShowAttachments(true);
        }
    };

    const handleInputFocus = () => {
        setShowAttachments(false);
    };

    const dismissAll = () => {
        Keyboard.dismiss();
        setShowAttachments(false);
    };

    const handleSendMessage = () => {
        if (inputText.trim().length === 0) return;

        const newMessage = {
            id: Date.now().toString(),
            text: inputText.trim(),
            sender: 'me',
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            read: false,
        };

        setMessages(prev => [...prev, newMessage]);
        setInputText('');

        // Scroll to bottom after sending
        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
    };

    // Template Modal State
    const [templateModalVisible, setTemplateModalVisible] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [templateContent, setTemplateContent] = useState('');

    const handleOptionPress = (item) => {
        if (item.id.startsWith('template')) {
            // Open Create Template Modal
            setTemplateModalVisible(true);
        } else {
            console.log('Pressed', item.label);
        }
    };

    const handleAddTemplate = () => {
        if (templateName.trim() && templateContent.trim()) {
            const newTemplateId = `template_${Date.now()}`;
            const newTemplate = {
                id: newTemplateId,
                label: templateName, // User provided name
                icon: 'chatprocessing', // Keep same icon or change
                type: 'custom',
                color: '#FFFFFF',
                bg: '#2A2D33'
            };

            // Add to options list. Insert before the empty templates or append?
            // "When added then it shown there also"
            // Let's replace the first "Template" placeholder if meaningful, or just append/insert.
            // But preserving layout: 4 items per row.
            // I'll append it before the placeholders or just add it.
            // Simplest: Add to the list.
            setOptions(prev => [...prev, newTemplate]);

            // Reset and close
            setTemplateName('');
            setTemplateContent('');
            setTemplateModalVisible(false);
        }
    };

    const tripData = trip || {
        title: 'The time traveler...',
        image: 'https://images.unsplash.com/photo-1534440051614-fa2934273822?q=80&w=2670&auto=format&fit=crop',
    };

    const renderMessage = ({ item }) => {
        const isMe = item.sender === 'me';
        return (
            <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
                {!isMe && (
                    <Image source={{ uri: item.avatar }} style={styles.messageAvatar} />
                )}

                <View style={[styles.messageBubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                    {/* Reply Preview */}
                    {item.replyTo && (
                        <View style={styles.replyContainer}>
                            <View style={[styles.replyLine, { backgroundColor: item.replyTo.color || '#B99A4A' }]} />
                            <View style={styles.replyContent}>
                                <Text style={[styles.replySender, { color: item.replyTo.color || '#B99A4A' }]}>{item.replyTo.sender}</Text>
                                <Text style={styles.replyText} numberOfLines={2}>{item.replyTo.text}</Text>
                            </View>
                        </View>
                    )}

                    {!isMe && !item.replyTo && (
                        <Text style={styles.senderName}>{item.senderName}</Text>
                    )}

                    <Text style={styles.messageText}>{item.text}</Text>
                    <View style={styles.metaRow}>
                        <Text style={styles.timeText}>{item.time}</Text>
                        {isMe && (
                            <Ionicons name="checkmark-done" size={14} color="#2196F3" style={{ marginLeft: 4 }} />
                        )}
                    </View>
                </View>
            </View>
        );
    };

    const renderOptionItem = (item) => {
        return (
            <TouchableOpacity
                style={styles.optionItem}
                key={item.id}
                onPress={() => handleOptionPress(item)}
            >
                <View style={[styles.optionIconCircle, { backgroundColor: '#2C2F33' }]}>
                    {item.type === 'ionicon' && <Ionicons name={item.icon} size={24} color={item.color} />}
                    {item.type === 'font-awesome-5' && <FontAwesome5 name={item.icon} size={20} color={item.color} />}
                    {item.type === 'custom' && (
                        <MaterialCommunityIcons name={item.id === 'ontheway' ? "message-plus" : "message-text-outline"} size={22} color="#9BA1A6" />
                    )}
                </View>
                <Text style={styles.optionLabel}>{item.label}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <SafeAreaView edges={['top']} style={styles.headerArea}>
                <View style={styles.headerContent}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>

                    <Image
                        source={typeof tripData.image === 'string' ? { uri: tripData.image } : tripData.image}
                        style={styles.headerAvatar}
                    />

                    <View style={styles.headerInfo}>
                        <Text style={styles.headerTitle} numberOfLines={1}>{tripData.title}</Text>
                        <Text style={styles.headerSubtitle} numberOfLines={1}>Active member: {tripData.participants}</Text>
                    </View>
                </View>
            </SafeAreaView>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={0}
            >
                <ImageBackground
                    source={{ uri: 'https://www.transparenttextures.com/patterns/dark-matter.png' }}
                    style={styles.chatBackground}
                    imageStyle={{ opacity: 0.1 }}
                >
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        renderItem={renderMessage}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 10 }}
                        onScrollBeginDrag={dismissAll}
                        keyboardDismissMode="interactive"
                    />

                    {/* Input Bar - wrapped in SafeAreaView */}
                    <SafeAreaView edges={['bottom']} style={styles.inputContainer}>
                        {/* Input Bar */}
                        <View style={[styles.inputBar, showAttachments && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
                            <TouchableOpacity onPress={toggleAttachments} style={styles.iconBtn}>
                                {showAttachments ? (
                                    <MaterialCommunityIcons name="keyboard" size={24} color="#FFF" />
                                ) : (
                                    // "Plus" or Grid icon for attachments
                                    <MaterialCommunityIcons name="plus" size={28} color="#FFF" />
                                )}
                            </TouchableOpacity>

                            <TextInput
                                ref={inputRef}
                                style={styles.textInput}
                                placeholder=""
                                placeholderTextColor="#666"
                                value={inputText}
                                onChangeText={setInputText}
                                onFocus={handleInputFocus}
                            />

                            <TouchableOpacity style={styles.iconBtn}>
                                <Ionicons name="camera-outline" size={24} color="#FFF" />
                            </TouchableOpacity>


                            <TouchableOpacity
                                style={styles.sendButton}
                                onPress={inputText.trim().length > 0 ? handleSendMessage : null}
                            >
                                <Ionicons
                                    name={inputText.trim().length > 0 ? "send" : "mic"}
                                    size={20}
                                    color="#FFF"
                                />
                            </TouchableOpacity>

                        </View>

                        {/* Attachment Drawer */}
                        {showAttachments && (
                            <View style={styles.attachmentDrawer}>
                                <View style={styles.optionsGrid}>
                                    {options.map(renderOptionItem)}
                                </View>

                                {/* Pagination Dots */}
                                <View style={styles.paginationDots}>
                                    <View style={[styles.dot, styles.activeDot]} />
                                    <View style={styles.dot} />
                                </View>
                            </View>
                        )}
                    </SafeAreaView>
                </ImageBackground>
            </KeyboardAvoidingView>

            {/* Template Creation Modal */}
            <Modal
                visible={templateModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setTemplateModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Create New Template</Text>

                            <Text style={styles.inputLabel}>Template Name</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="e.g., On The Way"
                                placeholderTextColor="#666"
                                value={templateName}
                                onChangeText={setTemplateName}
                            />

                            <Text style={styles.inputLabel}>Message Content</Text>
                            <TextInput
                                style={[styles.modalInput, styles.textArea]}
                                placeholder="Type your message content here..."
                                placeholderTextColor="#666"
                                value={templateContent}
                                onChangeText={setTemplateContent}
                                multiline={true}
                                textAlignVertical="top"
                            />

                            <TouchableOpacity
                                style={styles.addButton}
                                onPress={handleAddTemplate}
                            >
                                <Text style={styles.addButtonText}>Add Template</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121417',
    },
    headerArea: {
        backgroundColor: '#1A1E21',
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
    },
    backButton: {
        padding: 5,
    },
    headerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginHorizontal: 12,
    },
    headerInfo: {
        flex: 1,
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: 'bold',
        fontFamily: 'IBMPlexSans',
    },
    headerSubtitle: {
        color: '#9BA1A6',
        fontSize: 12,
        marginTop: 2,
        fontFamily: 'IBMPlexSans',
    },
    chatBackground: {
        flex: 1,
        backgroundColor: '#0D0E10', // Darker chat bg
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 16,
        maxWidth: '80%',
    },
    messageRowMe: {
        alignSelf: 'flex-end',
        justifyContent: 'flex-end',
    },
    messageRowOther: {
        alignSelf: 'flex-start',
    },
    messageAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginRight: 8,
        alignSelf: 'flex-end', // Bottom align
    },
    messageBubble: {
        borderRadius: 16,
        padding: 12,
        minWidth: 100,
    },
    bubbleMe: {
        backgroundColor: '#C9A443', // Gold
        borderBottomRightRadius: 4,
    },
    bubbleOther: {
        backgroundColor: '#23272A',
        borderBottomLeftRadius: 4,
    },
    senderName: {
        color: '#8A8D91', // Purple/Pink in screenshot for Titor? "#A259FF"
        color: '#8B77FF',
        fontSize: 13,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    messageText: {
        color: '#FFF',
        fontSize: 15,
        lineHeight: 20,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: 4,
    },
    timeText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
    },

    // Reply Styles
    replyContainer: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        padding: 8,
        paddingLeft: 12,
        marginBottom: 8,
        position: 'relative',
        overflow: 'hidden',
    },
    replyLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: 4,
    },
    replySender: {
        fontWeight: 'bold',
        fontSize: 13,
        marginBottom: 2,
    },
    replyText: {
        color: '#CCC',
        fontSize: 13,
    },

    // Input Bar
    inputContainer: {
        backgroundColor: '#1A1E21',
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1E21',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    iconBtn: {
        padding: 8,
    },
    textInput: {
        flex: 1,
        backgroundColor: '#2C2F33',
        borderRadius: 20,
        height: 40,
        paddingHorizontal: 16,
        color: '#FFF',
    },
    sendButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#B99A4A', // Gold accent color
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 4,
    },

    // Attachment Drawer
    attachmentDrawer: {
        backgroundColor: '#1A1E21',
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: '#2C2F33',
    },
    optionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    optionItem: {
        width: '22%', // 4 items per row approx
        alignItems: 'center',
        marginBottom: 20,
    },
    optionIconCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        backgroundColor: '#2C2F33', // Default
    },
    optionLabel: {
        color: '#FFF',
        fontSize: 12,
        textAlign: 'center',
    },
    paginationDots: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 10,
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#444',
    },
    activeDot: {
        backgroundColor: '#C9A443',
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    modalTitle: {
        fontSize: 22,
        color: '#FFF',
        fontFamily: 'CormorantGaramond_700Bold', // Assuming font available, else fallback
        marginBottom: 24,
        textAlign: 'center', // Or left? Screenshot shows left? No, "Create New Template" is distinct.
        // Screenshot: Title is Serif, large.
    },
    inputLabel: {
        fontSize: 14,
        color: '#E0E0E0',
        marginBottom: 10,
    },
    modalInput: {
        backgroundColor: '#2B2F33',
        borderRadius: 12,
        padding: 16,
        color: '#FFF',
        fontSize: 16,
        marginBottom: 20,
    },
    textArea: {
        height: 120,
    },
    addButton: {
        backgroundColor: '#C9A443',
        borderRadius: 30,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 10,
    },
    addButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalIndicator: {
        width: 100,
        height: 4,
        backgroundColor: '#FFF', // White bar at bottom
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 20,
        marginBottom: 10,
    }
});

export default TripChatScreen;
