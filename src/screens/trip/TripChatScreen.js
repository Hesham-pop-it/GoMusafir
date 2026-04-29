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
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import Logo from '../../components/Logo';
import { Typography } from '../../constants/Typography';
import { database, auth } from '../../config/firebase';
import { ref, onChildAdded, push, serverTimestamp, off, query, orderByChild, limitToLast, get, set, onValue } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { storage } from '../../config/firebase';
import { ActivityIndicator, Linking, Vibration } from 'react-native';
import ChatDatabase from '../../utils/chatDb';

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
    { id: 'camera', label: 'Camera', icon: 'custom', color: '#FFFFFF', bg: '#26292E' },
    { id: 'add_template', label: 'Add Template', icon: 'custom', color: '#B99A4A', bg: '#23272A' },
];

const ChatMessage = React.memo(({ item, isMe, isImage, isShortText, setReplyingTo, inputRef, currentParticipants, readPointers, onImagePress }) => {
    const swipeableRef = useRef(null);

    const renderMeta = () => (
        <View style={[styles.metaRow, isShortText && { marginTop: 0, marginLeft: 12 }, isImage && styles.imageMetaOverlay]}>
            <Text style={[styles.timeText, isMe && { color: 'rgba(0,0,0,0.5)' }, isImage && { color: 'rgba(255,255,255,0.9)' }]}>{item.time}</Text>
            {isMe && (() => {
                const buffer = 5000;
                const isSeenByEveryone = currentParticipants.length > 0 && 
                    currentParticipants.every(uid => (readPointers[uid] || 0) >= (item.rawTimestamp - buffer));
                const tickColor = isSeenByEveryone ? "#2196F3" : (isImage ? "rgba(255,255,255,0.9)" : "#A1A1AA");
                return (
                    <MaterialCommunityIcons name="check-all" size={16} color={tickColor} style={{ marginLeft: 4 }} />
                );
            })()}
        </View>
    );

    const renderLeftActions = () => {
        return (
            <View style={styles.swipeReplyAction}>
                <Ionicons name="arrow-undo" size={20} color="#B99A4A" />
            </View>
        );
    };

    return (
        <Swipeable
            ref={swipeableRef}
            renderLeftActions={renderLeftActions}
            onSwipeableWillOpen={() => {
                setReplyingTo(item);
                setTimeout(() => {
                    inputRef.current?.focus();
                    swipeableRef.current?.close();
                }, 0);
            }}
            friction={2}
            leftThreshold={40}
        >
            <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
                {!isMe && item.avatar && (
                    <Image source={{ uri: item.avatar }} style={styles.messageAvatar} />
                )}

                <View style={[styles.messageBubble, isMe ? styles.bubbleMe : styles.bubbleOther, isImage && { padding: 0, overflow: 'hidden' }]}>
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

                    {!isMe && !item.replyTo && item.senderName ? (
                        <Text style={styles.senderName}>{item.senderName}</Text>
                    ) : null}

                    <View style={(isShortText && !isImage) ? { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' } : {}}>
                        {item.type === 'image' ? (
                            <View>
                                <TouchableOpacity 
                                    style={styles.imageWrapper}
                                    onPress={() => onImagePress(item.image_url || item.media_url)}
                                    activeOpacity={0.9}
                                >
                                    {(item.image_url || item.media_url) && (
                                        <Image source={{ uri: item.image_url || item.media_url }} style={styles.messageImage} />
                                    )}
                                    {/* Only show meta on image if no caption, otherwise show below */}
                                    {!item.text && renderMeta()}
                                </TouchableOpacity>
                                {item.text ? (
                                    <View style={{ marginTop: 4, paddingHorizontal: 4 }}>
                                        <Text style={[styles.messageText, isMe && { color: '#131314' }]}>{item.text}</Text>
                                    </View>
                                ) : null}
                            </View>
                        ) : item.type === 'location' ? (
                            <TouchableOpacity 
                                style={styles.locationContainer}
                                onPress={() => {
                                    const url = Platform.select({
                                        ios: `maps:0,0?q=${item.latitude},${item.longitude}`,
                                        android: `geo:0,0?q=${item.latitude},${item.longitude}`
                                    });
                                    Linking.openURL(url);
                                }}
                            >
                                <View style={styles.locationPreview}>
                                    <Ionicons name="location" size={32} color="#B99A4A" />
                                    <Text style={styles.locationText}>Shared Location</Text>
                                    <Text style={styles.locationSubText}>Tap to open in Maps</Text>
                                </View>
                            </TouchableOpacity>
                        ) : item.type === 'voice' ? (
                            <VoicePlayer uri={item.audio_url || item.media_url} isMe={isMe} />
                        ) : (
                            <Text style={[styles.messageText, isMe && { color: '#131314' }]}>{item.text}</Text>
                        )}
                        {isShortText && renderMeta()}
                    </View>

                    {((!isShortText && !isImage) || (isImage && item.text)) && renderMeta()}
                </View>
            </View>
        </Swipeable>
    );
});

const TripChatScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { trip, invitationCode: directCode, isAdmin: passedIsAdmin } = route.params || {};
    const tripId = trip?.id || trip?.tripId;
    const orgId = trip?.org_id || trip?.orgId;
    const [resolvedOrgId, setResolvedOrgId] = useState(orgId);
    const invitationCode = directCode || trip?.invitationCode;
    const isAdmin = passedIsAdmin !== undefined ? passedIsAdmin : (trip?.isAdmin !== undefined ? trip.isAdmin : !invitationCode);

    const [inputText, setInputText] = useState('');
    const [showAttachments, setShowAttachments] = useState(false);
    const [options, setOptions] = useState(
        isAdmin
            ? QUICK_OPTIONS
            : QUICK_OPTIONS.filter(opt => ['photo', 'location', 'camera'].includes(opt.id))
    );
    const [messages, setMessages] = useState([]);
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const [currentUserFullName, setCurrentUserFullName] = useState('User');
    const [currentParticipants, setCurrentParticipants] = useState([]); // List of UIDs
    const [participantNames, setParticipantNames] = useState(['You']);
    const [readPointers, setReadPointers] = useState({});
    const [isUploading, setIsUploading] = useState(false);
    const [recording, setRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [playbackInstances, setPlaybackInstances] = useState({}); // To track playing states per message
    const [replyingTo, setReplyingTo] = useState(null);
    const [pendingImageUri, setPendingImageUri] = useState(null);
    const [imageCaption, setImageCaption] = useState('');
    const [viewerImage, setViewerImage] = useState(null);

    const inputRef = useRef(null);
    const flatListRef = useRef(null);

    // Auto-focus keyboard on mount and start listening to DB
    useEffect(() => {
        const initializeOfflineFirst = async () => {
            if (!tripId) return;

            // 1. Initialize DB and Load offline messages first
            await ChatDatabase.init();
            const localMsgs = await ChatDatabase.getMessages(tripId);
            
            if (localMsgs.length > 0) {
                setMessages(localMsgs.map(m => ({
                    ...m,
                    sender: m.sender_id === auth.currentUser?.uid ? 'me' : 'other',
                    time: new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                    rawTimestamp: m.timestamp
                })));
            }
        };

        initializeOfflineFirst();

        // Fetch current user's name first
        const fetchUserName = async () => {
            if (auth.currentUser) {
                try {
                    const userSnap = await get(ref(database, `users/${auth.currentUser.uid}/full_name`));
                    if (userSnap.exists()) {
                        setCurrentUserFullName(userSnap.val());
                    }
                } catch (err) {
                }
            }

            // Also resolve orgId if missing
            if (!resolvedOrgId && tripId) {
                try {
                    const orgSnap = await get(ref(database, `trips_orgs/${tripId}`));
                    if (orgSnap.exists()) {
                        setResolvedOrgId(orgSnap.val());
                    }
                } catch (e) {
                }
            }
        };
        fetchUserName();

        // Small delay to ensure screen transition finishes
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 500);

        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));

        let chatRef;
        if (orgId && tripId) {
            chatRef = query(
                ref(database, `trips_active/${orgId}/${tripId}/chat`),
                orderByChild('timestamp'),
                limitToLast(50)
            );

            onChildAdded(chatRef, (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    // S18: Ensure rawTimestamp is ALWAYS a number for comparison
                    let rawTs = data.timestamp;
                    if (typeof rawTs !== 'number') rawTs = Date.now();

                    const msg = {
                        id: snapshot.key,
                        ...data, // Include all fields (type, image_url, etc.)
                        sender: data.sender_id === auth.currentUser?.uid ? 'me' : 'other',
                        senderName: data.sender_name || 'Participant',
                        time: new Date(rawTs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                        rawTimestamp: rawTs,
                        avatar: data.avatar || 'https://ui-avatars.com/api/?name=User&background=B99A4A&color=fff',
                    };

                    setMessages((prev) => {
                        // Avoid duplicates
                        if (prev.find(m => m.id === msg.id)) return prev;
                        // Prepend for inverted list (newest first in array)
                        return [msg, ...prev];
                    });

                    // S24: Save to local encrypted database for offline access
                    ChatDatabase.saveMessage(tripId, {
                        id: snapshot.key,
                        ...data,
                        timestamp: rawTs,
                        sender_name: data.sender_name || 'Participant',
                        avatar: data.avatar || 'https://ui-avatars.com/api/?name=User&background=B99A4A&color=fff'
                    });

                    // Update our read pointer since we just "saw" a new message
                    if (auth.currentUser) {
                        set(ref(database, `trips_active/${orgId}/${tripId}/read_pointers/${auth.currentUser.uid}`), serverTimestamp());
                    }
                }
            });

            // Listen to total participants (Joined via Link)
            const pRef = ref(database, `trips_participants/${tripId}`);
            const staffRef = ref(database, `orgs/${orgId}/staff`);

            // We need to merge both sources
            const unsubP = onValue(pRef, (snap) => {
                const participants = snap.val() ?? {};
                
                // Also get current staff to merge
                get(staffRef).then(staffSnap => {
                    const staff = staffSnap.val() ?? {};
                    const combinedUids = Array.from(new Set([
                        ...Object.keys(participants),
                        ...Object.keys(staff),
                        trip?.organizer_id
                    ])).filter(Boolean);
                    
                    setCurrentParticipants(combinedUids);
                });
            });

            // Also listen to staff specifically so it's live if an admin is added
            const unsubStaff = onValue(staffRef, (snap) => {
                const staff = snap.val() ?? {};
                
                get(pRef).then(pSnap => {
                    const participants = pSnap.val() ?? {};
                    const combinedUids = Array.from(new Set([
                        ...Object.keys(participants),
                        ...Object.keys(staff),
                        trip?.organizer_id
                    ])).filter(Boolean);
                    
                    setCurrentParticipants(combinedUids);
                });
            });

            // Listen to read pointers
            const pointersRef = ref(database, `trips_active/${orgId}/${tripId}/read_pointers`);
            const unsubPointers = onValue(pointersRef, (snap) => {
                setReadPointers(snap.val() ?? {});
            });

            // S18: Listen to shared templates
            const templatesRef = ref(database, `trips_active/${orgId}/${tripId}/templates`);
            const unsubTemplates = onValue(templatesRef, (snap) => {
                if (!isAdmin) return; // S18: Participants should not see/use templates
                const val = snap.val() ?? {};
                const dbTemplates = Object.entries(val).map(([id, t]) => ({
                    id,
                    label: t.name,
                    content: t.message,
                    icon: 'custom',
                    color: '#FFFFFF',
                    bg: '#2A2D33',
                    isAdded: true
                }));

                setOptions(prev => {
                    // Start with static tools only (photo, camera, etc.)
                    const staticTools = QUICK_OPTIONS.filter(opt => opt.id !== 'add_template');
                    // Add the shared templates in the middle
                    const withTemplates = [...staticTools, ...dbTemplates];
                    // Always put 'Add Template' at the very end
                    const addBtn = QUICK_OPTIONS.find(opt => opt.id === 'add_template');
                    return [...withTemplates, addBtn];
                });
            });

            // Initial read pointer update
            if (auth.currentUser) {
                set(ref(database, `trips_active/${orgId}/${tripId}/read_pointers/${auth.currentUser.uid}`), serverTimestamp());
            }

            return () => {
                off(chatRef);
                unsubP();
                unsubStaff();
                unsubPointers();
                unsubTemplates();
                keyboardDidShowListener.remove();
                keyboardDidHideListener.remove();
            };
        }
    }, [orgId, tripId, isAdmin]);

    // Fetch Names for Header Subtitle
    useEffect(() => {
        const fetchNames = async () => {
            if (currentParticipants.length === 0) return;

            try {
                const namePromises = currentParticipants.map(async (uid) => {
                    if (uid === auth.currentUser?.uid) return 'You';
                    const nameSnap = await get(ref(database, `users/${uid}/full_name`));
                    return nameSnap.val() || 'Participant';
                });

                const names = await Promise.all(namePromises);
                const sortedNames = [
                    ...names.filter(n => n === 'You'),
                    ...names.filter(n => n !== 'You').sort()
                ];
                setParticipantNames(sortedNames);
            } catch (err) {
            }
        };

        fetchNames();
    }, [currentParticipants]);

    // Handle results if the activity was killed in the background (Android crash fix)
    useEffect(() => {
        const checkPendingResults = async () => {
            try {
                const result = await ImagePicker.getPendingResultAsync();
                if (result && result.length > 0) {
                    const firstResult = result[0];
                    if (!firstResult.canceled && firstResult.assets && firstResult.assets.length > 0) {
                        uploadAndSendMedia(firstResult.assets[0].uri, 'image');
                    }
                }
            } catch (err) {
            }
        };
        if (Platform.OS === 'android') {
            checkPendingResults();
        }
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
        if (inputText.trim().length === 0 || !orgId || !tripId) return;

        const chatListRef = ref(database, `trips_active/${orgId}/${tripId}/chat`);
        const messageData = {
            text: inputText.trim(),
            sender_id: auth.currentUser?.uid,
            sender_name: currentUserFullName || auth.currentUser?.email?.split('@')[0] || 'User',
            timestamp: serverTimestamp(),
            type: 'text'
        };

        if (replyingTo) {
            messageData.replyTo = {
                sender: replyingTo.senderName,
                text: replyingTo.type === 'image' ? '📷 Photo' : 
                      replyingTo.type === 'location' ? '📍 Location' : 
                      replyingTo.type === 'voice' ? '🎤 Voice Message' : 
                      replyingTo.text,
                id: replyingTo.id,
                color: replyingTo.color || (replyingTo.sender === 'me' ? '#B99A4A' : '#8B77FF')
            };
        }

        push(chatListRef, messageData).then(() => {
            setReplyingTo(null);
        }).catch(err => {
            alert("Failed to send. Please check your connection.");
        });

        setInputText('');
    };

    // Template Modal State
    const [templateModalVisible, setTemplateModalVisible] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [templateContent, setTemplateContent] = useState('');

    const triggerTemplateBroadcast = async (message) => {
        if (!orgId || !tripId) return;
        try {
            const participantsRef = ref(database, `trips_participants/${tripId}`);
            const participantsSnap = await get(participantsRef);
            
            if (participantsSnap.exists()) {
                const val = participantsSnap.val();
                // S22: Correctly extract UIDs (keys) and ensure they are unique to prevent spamming
                const rawUids = Array.isArray(val) ? val.filter(v => v !== null) : Object.keys(val);
                const uids = Array.from(new Set(rawUids.filter(id => typeof id === 'string')));
                const adminName = currentUserFullName || auth.currentUser?.email?.split('@')[0] || 'Admin';
                const timestamp = serverTimestamp();
                const targetOrgId = resolvedOrgId || orgId;
                if (!targetOrgId) return;

                const broadcastPromises = uids.map(uid => {
                    const userNotifRef = ref(database, `trips_active/${targetOrgId}/${tripId}/notifications/${uid}`);
                    return push(userNotifRef, {
                        name: adminName,
                        message: message,
                        timestamp: timestamp,
                        type: 'alert'
                    });
                });
                await Promise.all(broadcastPromises);
            }
        } catch (error) {
            console.error("Chat broadcast failed:", error);
        }
    };

    const handleOptionPress = (item) => {
        if (item.id === 'add_template') {
            setTemplateModalVisible(true);
        } else if (item.content) {
            // This is a saved template from DB - Send immediately!
            setShowAttachments(false);

            // 1. Send to Chat
            const chatListRef = ref(database, `trips_active/${orgId}/${tripId}/chat`);
            push(chatListRef, {
                type: 'text',
                text: item.content,
                sender_id: auth.currentUser?.uid,
                sender_name: currentUserFullName || 'Admin',
                timestamp: serverTimestamp(),
            }).catch(err => {});

            // 2. Broadcast as Notification
            triggerTemplateBroadcast(item.content);

        } else if (item.id === 'photo') {
            handlePickImage();
        } else if (item.id === 'camera') {
            handleTakePhoto();
        } else if (item.id === 'location') {
            handleShareLocation();
        } else {
        }
    };


    const handlePickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            alert('Sorry, we need camera roll permissions to make this work!');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            setPendingImageUri(result.assets[0].uri);
            setImageCaption('');
        }
    };

    const handleTakePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            alert('Sorry, we need camera permissions to make this work!');
            return;
        }

        let result = await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            setPendingImageUri(result.assets[0].uri);
            setImageCaption('');
        }
    };

    const uploadAndSendMedia = async (uri, type, caption = '') => {
        if (!orgId || !tripId || !auth.currentUser) return;

        setIsUploading(true);
        setShowAttachments(false);

        try {
            const response = await fetch(uri);
            const blob = await response.blob();
            
            const isVoice = type === 'voice';
            const extension = isVoice ? 'm4a' : 'jpg';
            const contentType = isVoice ? 'audio/m4a' : 'image/jpeg';
            
            const filename = `${Date.now()}_${auth.currentUser.uid}.${extension}`;
            const fileRef = storageRef(storage, `chat_media/${tripId}/${filename}`);
            const metadata = { contentType };

            await uploadBytes(fileRef, blob, metadata);
            const downloadUrl = await getDownloadURL(fileRef);

            const chatListRef = ref(database, `trips_active/${orgId}/${tripId}/chat`);
            const messageData = {
                type: type,
                sender_id: auth.currentUser.uid,
                sender_name: currentUserFullName || auth.currentUser.email?.split('@')[0] || 'User',
                timestamp: serverTimestamp(),
            };

            if (type === 'image') {
                messageData.image_url = downloadUrl;
                if (caption) messageData.text = caption;
            } else if (type === 'voice') {
                messageData.audio_url = downloadUrl;
            } else {
                messageData.media_url = downloadUrl;
            }

            await push(chatListRef, messageData);

        } catch (error) {
            alert("Failed to send media. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleShareLocation = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            alert('Permission to access location was denied');
            return;
        }

        setIsUploading(true);
        setShowAttachments(false);

        try {
            const location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;

            const chatListRef = ref(database, `trips_active/${orgId}/${tripId}/chat`);
            await push(chatListRef, {
                type: 'location',
                latitude,
                longitude,
                sender_id: auth.currentUser.uid,
                sender_name: currentUserFullName || 'User',
                timestamp: serverTimestamp(),
            });
        } catch (error) {
            alert("Failed to share location. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    const startRecording = async () => {
        if (isRecording || recording) return;

        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                alert('Microphone permission is required to record voice messages.');
                return;
            }

            // Cleanup any previous recording that might be hanging
            if (recording) {
                try {
                    await recording.stopAndUnloadAsync();
                } catch (e) {
                    // Ignore cleanup errors
                }
                setRecording(null);
            }

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });

            Vibration.vibrate(50); // Haptic feedback for recording start
            const { recording: newRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(newRecording);
            setIsRecording(true);
        } catch (err) {
            setIsRecording(false);
            setRecording(null);
        }
    };

    const stopRecording = async () => {
        if (!recording) return;
        
        setIsRecording(false);
        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            
            if (uri) {
                uploadAndSendMedia(uri, 'voice');
            }
        } catch (error) {
        } finally {
            setRecording(null);
        }
    };

    const handleAddTemplate = async () => {
        if (templateName.trim() && templateContent.trim() && orgId && tripId) {
            try {
                // 1. Save to templates node for future use
                const templatesRef = ref(database, `trips_active/${orgId}/${tripId}/templates`);
                await push(templatesRef, {
                    name: templateName,
                    message: templateContent,
                    created_by: auth.currentUser?.uid,
                    timestamp: serverTimestamp()
                });

                // 2. Also send as a message to the chat immediately
                const chatListRef = ref(database, `trips_active/${orgId}/${tripId}/chat`);
                await push(chatListRef, {
                    type: 'text',
                    text: templateContent,
                    sender_id: auth.currentUser?.uid,
                    sender_name: currentUserFullName || 'Admin',
                    timestamp: serverTimestamp(),
                });

                // 3. BROADCAST to all participants (the "Notification" block)
                await triggerTemplateBroadcast(templateContent);

                // Reset and close
                setTemplateName('');
                setTemplateContent('');
                setTemplateModalVisible(false);
            } catch (error) {
                alert("Failed to create and broadcast template.");
            }
        }
    };

    const tripData = trip || {
        title: 'The time traveler...',
        image: 'https://images.unsplash.com/photo-1534440051614-fa2934273822?q=80&w=2670&auto=format&fit=crop',
        participantsList: 'You, Titor, Sarah, John, Mike, Elena'
    };

    const renderMessage = React.useCallback(({ item }) => {
        const isMe = item.sender === 'me';
        const isImage = item.type === 'image';
        const isShortText = (item.type === 'text' || !item.type) && (item.text || '').length < 16 && !item.replyTo;

        return (
            <ChatMessage
                item={item}
                isMe={isMe}
                isImage={isImage}
                isShortText={isShortText}
                setReplyingTo={setReplyingTo}
                inputRef={inputRef}
                currentParticipants={currentParticipants}
                readPointers={readPointers}
                onImagePress={setViewerImage}
            />
        );
    }, [currentParticipants, readPointers]);

    const renderOptionItem = (item) => {
        let IconComponent = null;

        if (item.id === 'photo') IconComponent = <PhotoIcon size={28} />;
        else if (item.id === 'location') IconComponent = <LocationIconSvg size={28} />;
        else if (item.id === '5min') IconComponent = <FiveMinIcon size={28} />;
        else if (item.id === 'camera') IconComponent = <CameraIconSvg size={28} />;
        else if (item.id === 'add_template') {
            IconComponent = <TemplateIconSvg size={28} color="#FFFFFF" />;
        }
        else if (item.isAdded) {
            IconComponent = <MaterialIcons name="crisis-alert" size={32} color="#B99A4A" />;
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
        <GestureHandlerRootView style={{ flex: 1 }}>
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

                        {tripData.image && (
                            <Image
                                source={typeof tripData.image === 'string' ? { uri: tripData.image } : tripData.image}
                                style={styles.headerAvatar}
                            />
                        )}

                        <View style={styles.headerInfo}>
                            <Text style={styles.headerTitle} numberOfLines={1}>{tripData.title}</Text>
                            <Text style={styles.headerSubtitle} numberOfLines={1}>
                                {participantNames.join(', ')}
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
                        inverted={true}
                        contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 10 }}
                        onScrollBeginDrag={dismissAll}
                        keyboardDismissMode="interactive"
                        initialNumToRender={15}
                        maxToRenderPerBatch={10}
                        windowSize={10}
                        removeClippedSubviews={Platform.OS === 'android'}
                    />

                    {/* Input Bar - wrapped in SafeAreaView */}
                    <SafeAreaView edges={isKeyboardVisible || showAttachments ? [] : ['bottom']} style={styles.inputContainer}>
                        {/* Reply Preview */}
                        {replyingTo && (
                            <View style={styles.replyPreviewContainer}>
                                <View style={[styles.replyLine, { backgroundColor: replyingTo.color || (replyingTo.sender === 'me' ? '#B99A4A' : '#8B77FF') }]} />
                                <View style={styles.replyPreviewContent}>
                                    <Text style={[styles.replySender, { color: replyingTo.color || (replyingTo.sender === 'me' ? '#B99A4A' : '#8B77FF') }]}>{replyingTo.senderName}</Text>
                                    <Text style={styles.replyPreviewText} numberOfLines={1}>
                                        {replyingTo.type === 'image' ? '📷 Photo' : 
                                         replyingTo.type === 'location' ? '📍 Location' : 
                                         replyingTo.type === 'voice' ? '🎤 Voice Message' : 
                                         replyingTo.text}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.closeReplyBtn}>
                                    <Ionicons name="close-circle" size={24} color="#A1A1AA" />
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* Input Bar */}
                        <View style={[styles.inputBar, (showAttachments || replyingTo) && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: replyingTo ? 0 : 20, borderTopRightRadius: replyingTo ? 0 : 20 }]}>
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
                                multiline={true}
                                blurOnSubmit={false}
                            />

                            <TouchableOpacity style={styles.iconBtn} onPress={handleTakePhoto}>
                                <Ionicons name="camera-outline" size={24} color="#FFF" />
                            </TouchableOpacity>


                            <TouchableOpacity
                                style={[
                                    styles.sendButton,
                                    // isRecording && { backgroundColor: '#FF3B30', transform: [{ scale: 1.2 }] }
                                ]}
                                onPress={handleSendMessage}
                                // onPressIn={inputText.trim().length === 0 ? startRecording : null}
                                // onPressOut={inputText.trim().length === 0 ? stopRecording : null}
                                disabled={isUploading || inputText.trim().length === 0}
                            >
                                {isUploading ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Ionicons
                                        name="send" // Forced to "send" for now
                                        // name={inputText.trim().length > 0 ? "send" : (isRecording ? "stop" : "mic")}
                                        size={20}
                                        color="#FFF"
                                    />
                                )}
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

            {/* Image Preview Modal */}
            <Modal
                isVisible={!!pendingImageUri}
                onBackButtonPress={() => setPendingImageUri(null)}
                onBackdropPress={() => setPendingImageUri(null)}
                style={{ margin: 0 }}
                animationIn="zoomIn"
                animationOut="zoomOut"
            >
                <View style={styles.previewContainer}>
                    {pendingImageUri && <Image source={{ uri: pendingImageUri }} style={styles.fullPreviewImage} />}
                    
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.previewInputWrapper}
                    >
                        <View style={styles.previewInputBar}>
                            <TextInput
                                style={styles.previewTextInput}
                                placeholder="Add a caption..."
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                value={imageCaption}
                                onChangeText={setImageCaption}
                                multiline
                            />
                            <TouchableOpacity 
                                style={styles.previewSendBtn}
                                onPress={() => {
                                    uploadAndSendMedia(pendingImageUri, 'image', imageCaption);
                                    setPendingImageUri(null);
                                }}
                            >
                                <Ionicons name="send" size={24} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>

                    <TouchableOpacity 
                        style={styles.previewCloseBtn}
                        onPress={() => setPendingImageUri(null)}
                    >
                        <Ionicons name="close" size={30} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Image Viewer Modal */}
            <Modal
                isVisible={!!viewerImage}
                onBackButtonPress={() => setViewerImage(null)}
                onBackdropPress={() => setViewerImage(null)}
                style={{ margin: 0 }}
                animationIn="fadeIn"
                animationOut="fadeOut"
                useNativeDriver
            >
                <View style={styles.viewerContainer}>
                    <TouchableOpacity 
                        style={styles.viewerCloseBtn}
                        onPress={() => setViewerImage(null)}
                    >
                        <Ionicons name="close" size={30} color="#FFF" />
                    </TouchableOpacity>
                    
                    {viewerImage && (
                        <Image 
                            source={{ uri: viewerImage }} 
                            style={styles.fullViewerImage} 
                        />
                    )}
                </View>
            </Modal>

            </View >
        </GestureHandlerRootView>
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
        borderRadius: 12,
        marginRight: 8,
        alignSelf: 'flex-end', // Bottom align
    },
    messageBubble: {
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minWidth: 80,
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
        color: '#8B77FF',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    messageText: {
        color: '#fff',
        fontSize: 15,
        lineHeight: 20,
        fontFamily: Typography.sans.regular,
    },
    messageImage: {
        width: 250,
        height: 300,
        resizeMode: 'cover',
        borderRadius: 16,
    },
    imageWrapper: {
        position: 'relative',
        borderRadius: 10,
        overflow: 'hidden',
    },
    imageMetaOverlay: {
        position: 'absolute',
        bottom: 6,
        right: 6,
        backgroundColor: 'rgba(0,0,0,0.3)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        marginTop: 0,
    },
    locationContainer: {
        width: 200,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        padding: 12,
        marginVertical: 4,
    },
    locationPreview: {
        alignItems: 'center',
        gap: 4,
    },
    locationText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
    locationSubText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
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
        color: '#fff',
        fontSize: 13,
        fontFamily: Typography.sans.regular,
    },

    // Swipe & Preview
    swipeReplyAction: {
        justifyContent: 'center',
        paddingLeft: 20,
        width: 60,
    },
    replyPreviewContainer: {
        flexDirection: 'row',
        backgroundColor: '#23272A',
        padding: 10,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    replyPreviewContent: {
        flex: 1,
        marginLeft: 10,
    },
    replyPreviewText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
    },
    closeReplyBtn: {
        padding: 4,
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
        minHeight: 40,
        maxHeight: 120,
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 10 : 5,
        paddingBottom: Platform.OS === 'ios' ? 10 : 5,
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
        justifyContent: 'flex-start',
        paddingHorizontal: 10,
    },
    optionItem: {
        width: '25%', 
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
    },
    // Preview Modal Styles
    previewContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    fullPreviewImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'contain',
    },
    previewInputWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 15,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    previewInputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2C2F33',
        borderRadius: 25,
        paddingHorizontal: 15,
        paddingVertical: 10,
    },
    previewTextInput: {
        flex: 1,
        color: '#FFF',
        fontSize: 16,
        maxHeight: 100,
        fontFamily: Typography.sans.regular,
    },
    previewSendBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#B99A4A',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
    previewCloseBtn: {
        position: 'absolute',
        top: 40,
        left: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Viewer Modal Styles
    viewerContainer: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullViewerImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'contain',
    },
    viewerCloseBtn: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    }
});

export default TripChatScreen;

// --- Helper Component: VoicePlayer ---
const VoicePlayer = ({ uri, isMe }) => {
    const [sound, setSound] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        return sound
            ? () => {
                sound.unloadAsync();
            }
            : undefined;
    }, [sound]);

    const handlePlayPause = async () => {
        if (sound) {
            if (isPlaying) {
                await sound.pauseAsync();
                setIsPlaying(false);
            } else {
                await sound.playAsync();
                setIsPlaying(true);
            }
        } else {
            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri },
                { shouldPlay: true },
                onPlaybackStatusUpdate
            );
            setSound(newSound);
            setIsPlaying(true);
        }
    };

    const onPlaybackStatusUpdate = (status) => {
        if (status.isLoaded) {
            setPosition(status.positionMillis);
            setDuration(status.durationMillis);
            setIsPlaying(status.isPlaying);
            if (status.didJustFinish) {
                setPosition(0);
                setIsPlaying(false);
            }
        }
    };

    const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return (
        <View style={voiceStyles.container}>
            <TouchableOpacity onPress={handlePlayPause} style={voiceStyles.playButton}>
                <Ionicons name={isPlaying ? "pause" : "play"} size={24} color={isMe ? "#FFF" : "#B99A4A"} />
            </TouchableOpacity>
            <View style={voiceStyles.progressCard}>
                <View style={voiceStyles.progressBar} />
                <View style={[voiceStyles.progressActive, { width: `${(position / (duration || 1)) * 100}%`, backgroundColor: isMe ? '#FFF' : '#B99A4A' }]} />
                <Text style={[voiceStyles.durationText, isMe && { color: 'rgba(255,255,255,0.8)' }]}>
                    {formatTime(isPlaying ? position : (duration || 0))}
                </Text>
            </View>
        </View>
    );
};

const voiceStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 5,
        width: 180,
    },
    playButton: {
        marginRight: 10,
    },
    progressCard: {
        flex: 1,
        height: 30,
        justifyContent: 'center',
    },
    progressBar: {
        height: 3,
        borderRadius: 1.5,
        backgroundColor: 'rgba(255,255,255,0.2)',
        width: '100%',
    },
    progressActive: {
        height: 3,
        borderRadius: 1.5,
        position: 'absolute',
        left: 0,
    },
    durationText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
        fontFamily: Typography.sans.regular,
    }
});
