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
    TouchableWithoutFeedback,
    Keyboard
} from 'react-native';
import Modal from 'react-native-modal';
import { Svg, Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import Logo from '../../components/Logo';
import { Typography } from '../../constants/Typography';

const { width, height } = Dimensions.get('window');
const SCREEN_WIDTH = width;
const SCREEN_HEIGHT = height;

const PhotoIcon = ({ size = 24 }) => (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <Path d="M33.998 12.9961C36.2072 12.9961 37.998 14.787 37.998 16.9961V30.9971C37.998 33.2062 36.2072 34.9971 33.998 34.9971H13.998C11.7889 34.9971 9.99805 33.2062 9.99805 30.9971V16.9961C9.99805 14.787 11.7889 12.9961 13.998 12.9961H33.998ZM30.5391 23.2598C29.3797 22.255 27.649 22.2863 26.5273 23.333L21.666 27.8711C21.2887 28.2233 20.7052 28.2305 20.3193 27.8877L18.6143 26.3721C17.427 25.3167 15.6232 25.3699 14.5 26.4932L12.293 28.6992C12.1054 28.8868 12 29.142 12 29.4072V30.9932C12.0002 32.0976 12.8956 32.9932 14 32.9932H34C35.1045 32.9932 35.9998 32.0976 36 30.9932V28.4492C36 28.1592 35.8744 27.8833 35.6553 27.6934L30.5391 23.2598ZM27.5 6C29.7091 6 31.5 7.79086 31.5 10V11.0039H14.002C10.6882 11.0039 8.00196 13.6902 8.00195 17.0039V28.501H7C4.79086 28.501 3 26.7101 3 24.501V10C3 7.79086 4.79086 6 7 6H27.5ZM20 17.4922C18.3432 17.4922 17.0001 18.8353 17 20.4922C17 22.1491 18.3431 23.4922 20 23.4922C21.6569 23.4922 23 22.1491 23 20.4922C22.9999 18.8353 21.6568 17.4922 20 17.4922Z" fill="#007BFC" />
    </Svg>
);

const LocationIconSvg = ({ size = 24 }) => (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <Path d="M20 4C26.6274 4 32 9.37258 32 16C32 23.522 25.9879 30.9166 22.4746 34.5957C21.1034 36.0312 18.8966 36.0312 17.5254 34.5957C14.0121 30.9166 8 23.522 8 16C8 9.37258 13.3726 4 20 4ZM20 11C17.2386 11 15 13.2386 15 16C15 18.7614 17.2386 21 20 21C22.7614 21 25 18.7614 25 16C25 13.2386 22.7614 11 20 11Z" fill="#06CF9C" />
    </Svg>
);

const FiveMinIcon = ({ size = 24 }) => (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <Path d="M7 9.61538C7 7.07692 9.04545 5 11.5455 5H27.4545C29.9545 5 32 7.07692 32 9.61538V28.0769C32 30.3846 29.7273 30.3846 29.7273 30.3846V32.6923C29.7273 33.9615 28.7045 35 27.4545 35C26.2045 35 25.1818 33.9615 25.1818 32.6923V30.3846H13.8182V32.6923C13.8182 33.9615 12.7955 35 11.5455 35C10.2955 35 9.27273 33.9615 9.27273 32.6923V30.3846C7 30.3846 7 28.0769 7 28.0769V9.61538ZM10.4091 11.9231C9.77273 11.9231 9.27273 12.4308 9.27273 13.0769V20C9.27273 20.6462 9.77273 21.1538 10.4091 21.1538H28.5909C29.2273 21.1538 29.7273 20.6462 29.7273 20V13.0769C29.7273 12.4308 29.2273 11.9231 28.5909 11.9231H10.4091ZM11.5455 23.4615C10.2955 23.4615 9.27273 24.5 9.27273 25.7692C9.27273 27.0385 10.2955 28.0769 11.5455 28.0769C12.7955 28.0769 13.8182 27.0385 13.8182 25.7692C13.8182 24.5 12.7955 23.4615 11.5455 23.4615ZM27.4545 23.4615C26.2045 23.4615 25.1818 24.5 25.1818 25.7692C25.1818 27.0385 26.2045 28.0769 27.4545 28.0769C28.7045 28.0769 29.7273 27.0385 29.7273 25.7692C29.7273 24.5 28.7045 23.4615 27.4545 23.4615ZM11.5455 8.46154C11.5455 9.10769 12.0455 9.61538 12.6818 9.61538H26.3182C26.9545 9.61538 27.4545 9.10769 27.4545 8.46154C27.4545 7.81538 26.9545 7.30769 26.3182 7.30769H12.6818C12.0455 7.30769 11.5455 7.81538 11.5455 8.46154Z" fill="#B99A4A" />
    </Svg>
);

const CameraIconSvg = ({ size = 24 }) => (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <Path d="M22.3428 7C23.4036 7 24.4217 7.42173 25.1719 8.17188L26.9141 9.91406C27.2891 10.2891 27.7978 10.4999 28.3281 10.5H32C34.2091 10.5 36 12.2909 36 14.5V28.5C36 30.7091 34.2091 32.5 32 32.5H8C5.79086 32.5 4 30.7091 4 28.5V14.5C4 12.2909 5.79086 10.5 8 10.5H11.6719C12.2022 10.4999 12.7109 10.2891 13.0859 9.91406L14.8281 8.17188C15.5783 7.42173 16.5964 7 17.6572 7H22.3428ZM20 14C16.134 14 13 17.134 13 21C13 24.866 16.134 28 20 28C23.866 28 27 24.866 27 21C27 17.134 23.866 14 20 14ZM20 16C22.7614 16 25 18.2386 25 21C25 23.7614 22.7614 26 20 26C17.2386 26 15 23.7614 15 21C15 18.2386 17.2386 16 20 16ZM30 14C28.8954 14 28 14.8954 28 16C28 17.1046 28.8954 18 30 18C31.1046 18 32 17.1046 32 16C32 14.8954 31.1046 14 30 14Z" fill="white" />
    </Svg>
);

const TemplateIconSvg = ({ size = 24, color = "#FFFFFF" }) => (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
        <Path d="M19.1973 5.80176C23.593 5.80176 27.6143 7.03689 30.5576 9.18164C33.5088 11.3322 35.3944 14.4192 35.3945 18.0596C35.3945 20.392 34.6314 22.5517 33.3076 24.4111H32.2314V22.0469C32.2314 20.5101 31.0623 19.2461 29.5664 19.0938L29.2627 19.0781C27.6238 19.0782 26.2949 20.4079 26.2949 22.0469V24.4111H23.9287C22.3917 24.4118 21.1296 25.5803 20.9775 27.0752L20.9619 27.3789L20.9619 27.6826C21.1295 29.1775 22.3917 30.347 23.9287 30.3477H24.1025C22.547 30.7412 20.897 30.9531 19.1973 30.9531C18.6508 30.9531 18.1101 30.9327 17.5771 30.8906C17.4536 30.8875 17.4101 30.9013 17.3781 30.9346C15.5319 32.8017 13.5702 33.7449 12.0771 34.2188C11.332 34.4552 10.7039 34.5741 10.2559 34.6348C10.0323 34.665 9.8527 34.6804 9.72559 34.6885C9.66217 34.6925 9.61076 34.6952 9.57422 34.6963C9.55628 34.6968 9.54138 34.6971 9.53027 34.6973H9.50879C9.23517 34.6972 8.98022 34.5536 8.83887 34.3193C8.69764 34.085 8.68875 33.7938 8.81641 33.5518L8.81738 33.5508L8.8418 33.502C8.85971 33.4673 8.88734 33.4152 8.9209 33.3486C8.9881 33.2153 9.0821 33.0222 9.19238 32.7891C9.41393 32.3206 9.69361 31.6959 9.93066 31.0566C10.172 30.4056 10.353 29.7875 10.4043 29.3203C10.4284 29.1 10.4140 28.9618 10.3975 28.8887C9.94561 28.6559 9.50786 28.4066 9.08789 28.1396C5.42608 25.8115 3.00014 22.1921 3 18.0596C3.00012 14.4192 4.88576 11.3322 7.83691 9.18164C10.7803 7.03685 14.8015 5.80178 19.1973 5.80176ZM23.8086 28.7793C23.8485 28.7827 23.8889 28.7851 23.9297 28.7852H23.9287C23.8882 28.7851 23.8482 28.7827 23.8086 28.7793ZM23.6621 28.7578C23.6338 28.7523 23.6058 28.7464 23.5781 28.7393C23.6058 28.7464 23.6338 28.7523 23.6621 28.7578ZM23.5410 28.7295C23.52 28.7234 23.4992 28.717 23.4785 28.71C23.4992 28.717 23.52 28.7234 23.5410 28.7295ZM23.4268 28.6914C23.4043 28.6828 23.3822 28.6738 23.3604 28.6641C23.3822 28.6738 23.4043 28.6828 23.4268 28.6914ZM23.3291 28.6504C23.3215 28.6468 23.3142 28.6424 23.3066 28.6387C23.3142 28.6424 23.3215 28.6468 23.3291 28.6504ZM23.1602 28.5537C23.1550 28.5503 23.1487 28.5484 23.1436 28.5449L23.1338 28.5371C23.1423 28.543 23.1515 28.548 23.1602 28.5537ZM22.8389 28.2646C22.8130 28.2328 22.7897 28.1991 22.7666 28.165C22.7896 28.1991 22.8130 28.2328 22.8389 28.2646ZM22.7363 28.1211C22.7214 28.0971 22.7088 28.0718 22.6953 28.0469C22.7088 28.0718 22.7214 28.0971 22.7363 28.1211ZM22.6562 27.9727C22.6436 27.9456 22.6330 27.9176 22.6221 27.8896C22.6330 27.9176 22.6436 27.9456 22.6562 27.9727ZM22.5938 27.8145C22.5918 27.8085 22.5888 27.8029 22.5869 27.7969L22.5527 27.6621C22.5634 27.7140 22.5776 27.7648 22.5938 27.8145ZM22.5244 27.3789L22.5312 27.5225C22.5265 27.4753 22.5234 27.4273 22.5234 27.3789C22.5234 27.3325 22.5259 27.2865 22.5303 27.2412C22.5259 27.2864 22.5244 27.3326 22.5244 27.3789ZM22.6934 26.709C22.6504 26.7886 22.6152 26.8731 22.5879 26.9609L22.5527 27.0957C22.5808 26.9585 22.6287 26.8285 22.6934 26.709ZM23.2598 26.1426L23.1436 26.2129C23.1808 26.1877 23.2192 26.1641 23.2588 26.1426L23.3818 26.083C23.34 26.1008 23.2994 26.121 23.2598 26.1426ZM23.6113 26.0098C23.6227 26.0071 23.6340 26.0033 23.6455 26.001L23.7852 25.9795C23.7260 25.9856 23.6681 25.9966 23.6113 26.0098ZM23.8008 28.7783C23.7638 28.775 23.7275 28.7698 23.6914 28.7637C23.7275 28.7698 23.7639 28.7749 23.8008 28.7783Z" fill={color} />
        <Path d="M27.8565 32.7121V28.7844H23.9288C23.1524 28.7844 22.5225 28.1544 22.5225 27.378C22.5228 26.6019 23.1526 25.9732 23.9288 25.9732H27.8565V22.0455C27.8565 21.2693 28.4852 20.6395 29.2613 20.6392C30.0377 20.6392 30.6677 21.2691 30.6677 22.0455V25.9732H34.5954C35.3713 25.9734 35.9999 26.602 36.0002 27.378C36.0002 28.1542 35.3715 28.7841 34.5954 28.7844H30.6677V32.7121C30.6674 33.4882 30.0375 34.1169 29.2613 34.1169C28.4853 34.1166 27.8567 33.488 27.8565 32.7121Z" fill={color} />
    </Svg>
);

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
    { id: 'photo', label: 'Photo', icon: 'custom', color: '#007BFC', bg: '#1A2733' },
    { id: 'location', label: 'Location', icon: 'custom', color: '#06CF9C', bg: '#1A2927' },
    { id: '5min', label: '5 Minutes', icon: 'custom', color: '#B99A4A', bg: '#2E2818' },
    { id: 'camera', label: 'Camera', icon: 'custom', color: '#FFFFFF', bg: '#26292E' },
    { id: 'ontheway', label: 'On The Way', icon: 'custom', color: '#FFFFFF', bg: '#2A2D33', isAdded: true },
    { id: 'template1', label: 'Template', icon: 'custom', color: '#1A1E21', bg: '#2A2D33', isAdded: false },
    { id: 'template2', label: 'Template', icon: 'custom', color: '#1A1E21', bg: '#2A2D33', isAdded: false },
    { id: 'template3', label: 'Template', icon: 'custom', color: '#1A1E21', bg: '#2A2D33', isAdded: false },
];

const TripChatScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { trip, invitationCode: directCode } = route.params || {};
    const invitationCode = directCode || trip?.invitationCode;
    const isAdmin = !invitationCode;

    const [inputText, setInputText] = useState('');
    const [showAttachments, setShowAttachments] = useState(false);
    const [options, setOptions] = useState(
        isAdmin
            ? QUICK_OPTIONS
            : QUICK_OPTIONS.filter(opt => ['photo', 'location', 'camera'].includes(opt.id))
    );
    const [messages, setMessages] = useState(MOCK_MESSAGES);
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const inputRef = useRef(null);
    const flatListRef = useRef(null);

    // Auto-focus keyboard on mount (like WhatsApp usually focuses if entering recent chat, or requested)
    // User requested: "for chat keyboard should be opened by default"
    useEffect(() => {
        // Small delay to ensure screen transition finishes
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 500);

        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));

        return () => {
            clearTimeout(timer);
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
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
                icon: 'custom',
                color: '#FFFFFF',
                bg: '#2A2D33',
                isAdded: true
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
        participantsList: 'You, Titor, Sarah, John, Mike, Elena'
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

                    <Text style={[styles.messageText, isMe && { color: '#131314' }]}>{item.text}</Text>
                    <View style={styles.metaRow}>
                        <Text style={[styles.timeText, isMe && { color: 'rgba(0,0,0,0.5)' }]}>{item.time}</Text>
                        {isMe && (
                            <Ionicons name="checkmark-done" size={14} color="#2196F3" style={{ marginLeft: 4 }} />
                        )}
                    </View>
                </View>
            </View>
        );
    };

    const renderOptionItem = (item) => {
        let IconComponent = null;

        if (item.id === 'photo') IconComponent = <PhotoIcon size={28} />;
        else if (item.id === 'location') IconComponent = <LocationIconSvg size={28} />;
        else if (item.id === '5min') IconComponent = <FiveMinIcon size={28} />;
        else if (item.id === 'camera') IconComponent = <CameraIconSvg size={28} />;
        else if (item.id === 'ontheway' || item.id.startsWith('template')) {
            const iconColor = item.isAdded ? "#FFFFFF" : "#1A1E21";
            IconComponent = <TemplateIconSvg size={28} color={iconColor} />;
        }

        return (
            <TouchableOpacity
                style={styles.optionItem}
                key={item.id}
                onPress={() => handleOptionPress(item)}
            >
                <View style={[styles.optionIconCircle, { backgroundColor: '#2C2F33' }]}>
                    {IconComponent}
                </View>
                <Text style={styles.optionLabel}>{item.label}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            {/* Header */}
            <LinearGradient
                colors={['#1A1E21', '#332F2B']}
                start={{ x: 0.5, y: 1 }}
                end={{ x: 0.5, y: 0 }}
            >
                <SafeAreaView edges={['top']}>
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
                            <Text style={styles.headerSubtitle} numberOfLines={1}>
                                {'You, Titor, Sarah, John, Mike, Elena,...'}
                            </Text>
                        </View>
                    </View>
                </SafeAreaView>
            </LinearGradient>

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
                    <View style={styles.backgroundLogoContainer}>
                        <Logo width={SCREEN_WIDTH * 0.7} height={SCREEN_WIDTH * 0.7} color="rgba(185, 154, 74, 0.2)" />
                    </View>
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
                    <SafeAreaView edges={isKeyboardVisible || showAttachments ? [] : ['bottom']} style={styles.inputContainer}>
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

                                {/* Pagination Dots - Only show if more than one page (8 items) is needed */}
                                {options.length > 8 && (
                                    <View style={styles.paginationDots}>
                                        <View style={[styles.dot, styles.activeDot]} />
                                        <View style={styles.dot} />
                                    </View>
                                )}
                            </View>
                        )}
                    </SafeAreaView>
                </ImageBackground>
            </KeyboardAvoidingView>

            {/* Template Creation Modal */}
            <Modal
                isVisible={templateModalVisible}
                onBackdropPress={() => setTemplateModalVisible(false)}
                onSwipeComplete={() => setTemplateModalVisible(false)}
                swipeDirection="down"
                style={{ margin: 0, justifyContent: 'flex-end' }}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
                avoidKeyboard={true}
            >
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
            </Modal>
        </View >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1E21',
    },
    headerArea: {
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
        fontSize: 16,
        fontFamily: Typography.sans.semiBold,
    },
    headerSubtitle: {
        color: '#A1A1AA',
        fontSize: 13,
        marginTop: 2,
        fontFamily: Typography.sans.regular,
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
        backgroundColor: 'rgba(35, 39, 42, 0.7)',
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
        color: '#fff',
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
        color: '#3F4346',
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
        backgroundColor: '#3F4346',
        borderRadius: 20,
        height: 40,
        paddingHorizontal: 16,
        color: '#FFF',
        fontFamily: Typography.sans.bold,
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
        backgroundColor: '#23272A',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    modalTitle: {
        fontSize: 28,
        color: '#FFF',
        fontFamily: Typography.serif.regular, // Assuming font available, else fallback
        marginBottom: 24,
        textAlign: 'left', // Or left? Screenshot shows left? No, "Create New Template" is distinct.
        // Screenshot: Title is Serif, large.
    },
    inputLabel: {
        fontSize: 14,
        color: '#E0E0E0',
        marginBottom: 10,
    },
    modalInput: {
        backgroundColor: 'rgba(253,253,253,0.1)',
        borderRadius: 12,
        padding: 16,
        color: '#FFF',
        fontSize: 16,
        marginBottom: 20,
        fontFamily: Typography.sans.bold,
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
    },
    backgroundLogoContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    }
});

export default TripChatScreen;
