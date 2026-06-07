import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
    View,
    Text,
    StyleSheet,
    ImageBackground,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Alert,
    StatusBar,
    Image,
    PanResponder,
    Animated,
    Share,
} from 'react-native';
import Modal from 'react-native-modal';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ref, onValue, get, update, remove, query, limitToLast, set, push, serverTimestamp, orderByChild, startAt } from 'firebase/database';

import { database, auth, functions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import ChatEncryption from '../../utils/chatEncryption';

import Svg, { Path, G, Defs, ClipPath, Rect, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { Typography } from '../../constants/Typography';
import { useNavigation, useRoute } from '@react-navigation/native';
import TripBottomTabBar from '../../components/TripBottomTabBar';
import GradientBorderButton from '../../components/GradientBorderButton';
import { responsiveFontSize } from '../../utils/responsive';
import ParticipantDetailModal from '../../components/trip/ParticipantDetailModal';
import { useVoice } from '../../context/VoiceContext';
import { useTracks } from '@livekit/react-native';
import { Track } from 'livekit-client';


const { width, height } = Dimensions.get('window');

const MicUnmutedIcon = ({ color = "white", size = 20 }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path fillRule="evenodd" clipRule="evenodd" d="M12 16.5C14.4842 16.4974 16.4974 14.4842 16.5 12V6C16.5 3.51472 14.4853 1.5 12 1.5C9.51472 1.5 7.5 3.51472 7.5 6V12C7.50258 14.4842 9.51579 16.4974 12 16.5ZM9 6C9 4.34315 10.3431 3 12 3C13.6569 3 15 4.34315 15 6V12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12V6ZM12.75 19.4625V21.75C12.75 22.1642 12.4142 22.5 12 22.5C11.5858 22.5 11.25 22.1642 11.25 21.75V19.4625C7.41988 19.0728 4.50473 15.8499 4.5 12C4.5 11.5858 4.83579 11.25 5.25 11.25C5.66421 11.25 6 11.5858 6 12C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12C18 11.5858 18.3358 11.25 18.75 11.25C19.1642 11.25 19.5 11.5858 19.5 12C19.4953 15.8499 16.5801 19.0728 12.75 19.4625Z" fill={color} />
    </Svg>
);

const MicMutedIcon = ({ color = "white", size = 20 }) => (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <Path fillRule="evenodd" clipRule="evenodd" d="M22.0552 21.7457L7.0552 5.24568C6.87596 5.04363 6.60193 4.95357 6.33777 5.00988C6.07362 5.0662 5.86015 5.2602 5.7789 5.51778C5.69765 5.77536 5.76117 6.05674 5.9452 6.25443L9.5002 10.1647V14.0001C9.50042 15.6452 10.3983 17.159 11.8419 17.9481C13.2854 18.7371 15.0444 18.6756 16.4293 17.7876L17.4493 18.9126C15.6167 20.2 13.2196 20.3596 11.2325 19.3265C9.24544 18.2934 7.99911 16.2397 8.0002 14.0001C8.0002 13.5858 7.66442 13.2501 7.2502 13.2501C6.83599 13.2501 6.5002 13.5858 6.5002 14.0001C6.50493 17.85 9.42008 21.0728 13.2502 21.4626V23.7501C13.2502 24.1643 13.586 24.5001 14.0002 24.5001C14.4144 24.5001 14.7502 24.1643 14.7502 23.7501V21.4616C16.0953 21.3278 17.379 20.8318 18.4646 20.0263L20.9452 22.7544C21.1244 22.9565 21.3985 23.0465 21.6626 22.9902C21.9268 22.9339 22.1403 22.7399 22.2215 22.4823C22.3028 22.2247 22.2392 21.9434 22.0552 21.7457ZM14.0002 17.0001C12.3433 17.0001 11.0002 15.6569 11.0002 14.0001V11.8147L15.399 16.6541C14.9677 16.8813 14.4876 17.0001 14.0002 17.0001ZM10.1715 5.63568C11.2286 3.92384 13.2936 3.12174 15.2291 3.67119C17.1646 4.22064 18.5002 5.98809 18.5002 8.00005V13.6654C18.5002 14.0796 18.1644 14.4154 17.7502 14.4154C17.336 14.4154 17.0002 14.0796 17.0002 13.6654V8.00005C17.0009 6.65799 16.1102 5.4787 14.8192 5.11234C13.5281 4.74598 12.1507 5.28168 11.4465 6.42412C11.3105 6.66222 11.0554 6.80713 10.7812 6.80203C10.5071 6.79694 10.2576 6.64264 10.1305 6.39965C10.0035 6.15666 10.0192 5.86371 10.1715 5.63568ZM19.5915 16.1816C19.8628 15.4864 20.0015 14.7464 20.0002 14.0001C20.0002 13.5858 20.336 13.2501 20.7502 13.2501C21.1644 13.2501 21.5002 13.5858 21.5002 14.0001C21.5015 14.9331 21.3279 15.8582 20.9883 16.7272C20.8949 16.9825 20.6707 17.1672 20.4023 17.21C20.1339 17.2529 19.8634 17.1472 19.6951 16.9338C19.5268 16.7204 19.4872 16.4326 19.5915 16.1816Z" fill={color} />
    </Svg>
);

const FajrIcon = ({ color = "white", size = 24 }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Path d="M14.5542 12.4247C14.5342 13.6647 13.8242 15.1047 12.6242 15.5447C12.5642 15.5647 12.5342 15.5747 12.4342 15.5847C12.3042 15.6047 12.1742 15.6047 12.0442 15.5847C11.7142 15.5647 11.3742 15.4947 11.0642 15.3647C10.4242 15.1147 9.85421 14.6747 9.45421 14.1147C8.64421 12.9747 8.54421 11.4347 9.23421 10.2147C9.54421 9.6647 10.0042 9.1647 10.5742 8.8947C10.6942 8.8347 10.7142 8.8247 10.8142 8.8047C10.7242 8.8247 11.0042 8.7847 11.0042 8.7847C11.3342 8.7647 11.6742 8.8147 11.9842 8.9047C13.5342 9.3447 14.5342 10.8247 14.5542 12.3947C14.5542 12.6247 16.2042 12.3947 16.1942 11.9547C16.1742 10.2447 15.0142 8.7847 13.3842 8.3047C11.6142 7.7847 9.30421 8.4547 8.08421 9.8347C6.96421 11.1147 6.78421 13.0347 7.74421 14.4647C8.78421 16.0247 10.6642 16.4547 12.4142 16.0547C14.4442 15.5947 16.1642 14.1447 16.1942 11.9547C16.1942 11.7347 14.5542 11.9547 14.5542 12.3947V12.4247Z" fill={color}/>
        <Path d="M10.834 19.054V21.124C10.834 21.274 10.874 21.374 11.014 21.454C11.164 21.544 11.394 21.554 11.564 21.534C11.774 21.504 12.004 21.444 12.184 21.314C12.294 21.234 12.484 21.094 12.484 20.934V18.864C12.484 18.714 12.444 18.614 12.304 18.534C12.154 18.444 11.924 18.434 11.754 18.454C11.544 18.484 11.314 18.544 11.134 18.674C11.024 18.754 10.834 18.894 10.834 19.054Z" fill={color}/>
        <Path d="M10.834 3.58526V5.65526C10.834 5.76526 11.084 5.79526 11.134 5.79526C11.324 5.81526 11.554 5.77526 11.734 5.72526C11.914 5.67526 12.134 5.60526 12.294 5.48526C12.394 5.41526 12.474 5.34526 12.474 5.21526V3.14526C12.474 3.03526 12.224 3.00526 12.174 3.00526C11.984 2.98526 11.754 3.02526 11.574 3.07526C11.394 3.12526 11.174 3.19526 11.014 3.31526C10.914 3.38526 10.834 3.45526 10.834 3.58526Z" fill={color}/>
        <Path d="M18.1034 12.6561H20.1734C20.3934 12.6561 20.6134 12.6061 20.8134 12.5261C20.9534 12.4661 21.1734 12.3561 21.2534 12.2161C21.3134 12.1161 21.3534 11.9861 21.2534 11.8861C21.1434 11.7761 20.9634 11.7461 20.8134 11.7461H18.7434C18.5234 11.7461 18.3034 11.7961 18.1034 11.8761C17.9634 11.9361 17.7434 12.0461 17.6634 12.1861C17.6034 12.2861 17.5634 12.4161 17.6634 12.5161C17.7734 12.6261 17.9534 12.6561 18.1034 12.6561Z" fill={color}/>
        <Path d="M2.29391 12.5538H4.36391C4.57391 12.5538 4.76392 12.5337 4.96392 12.4737C5.14392 12.4237 5.36391 12.3537 5.52391 12.2337C5.59391 12.1837 5.74392 12.0837 5.71392 11.9737C5.68392 11.8637 5.50391 11.8438 5.42391 11.8438H3.35391C3.14391 11.8438 2.95392 11.8637 2.75392 11.9237C2.57392 11.9737 2.35391 12.0437 2.19391 12.1637C2.12391 12.2137 1.97392 12.3137 2.00392 12.4237C2.03392 12.5337 2.21391 12.5538 2.29391 12.5538Z" fill={color}/>
        <Path d="M6.06387 16.9469C5.67387 17.3169 5.28387 17.6969 4.88387 18.0669L4.71387 18.2269C4.60387 18.3269 4.53387 18.5369 4.57387 18.6769C4.61387 18.8369 4.77387 18.9569 4.91387 18.9969C5.11387 19.0569 5.33387 19.0669 5.53387 18.9969L5.74387 18.9169C5.86387 18.8569 5.97387 18.7769 6.06387 18.6769C6.45387 18.3069 6.84387 17.9269 7.24387 17.5569L7.41387 17.3969C7.52387 17.2969 7.59387 17.0869 7.55387 16.9469C7.51387 16.7869 7.35387 16.6669 7.21387 16.6269C7.01387 16.5669 6.79387 16.5569 6.59387 16.6269L6.38387 16.7069C6.26387 16.7669 6.15387 16.8469 6.06387 16.9469Z" fill={color}/>
        <Path d="M17.2436 5.78342C16.8436 6.17342 16.4436 6.56342 16.0436 6.95342C15.9836 7.00342 15.9336 7.06342 15.8736 7.11342C15.7736 7.20342 15.6836 7.35342 15.7236 7.50342C15.7636 7.65342 15.9236 7.73342 16.0536 7.76342C16.2536 7.81342 16.4736 7.80342 16.6736 7.74342C16.8736 7.68342 17.0736 7.60342 17.2236 7.45342C17.6236 7.06342 18.0236 6.67342 18.4236 6.28342C18.4836 6.23342 18.5336 6.17342 18.5936 6.12342C18.6936 6.03342 18.7836 5.88342 18.7436 5.73342C18.7036 5.58342 18.5436 5.50342 18.4136 5.47342C18.2136 5.42342 17.9936 5.43342 17.7936 5.49342C17.5936 5.55342 17.3936 5.63342 17.2436 5.78342Z" fill={color}/>
        <Path d="M15.4736 17.2448C15.9536 17.6748 16.4436 18.1148 16.9236 18.5448L17.1336 18.7248C17.2236 18.8048 17.4636 18.7848 17.5536 18.7748C17.7636 18.7548 17.9936 18.7048 18.1936 18.6348C18.3436 18.5748 18.5436 18.5148 18.6536 18.3848C18.7136 18.3148 18.7736 18.2448 18.6836 18.1648C18.2036 17.7348 17.7136 17.2948 17.2336 16.8648L17.0236 16.6848C16.9336 16.6048 16.6936 16.6248 16.6036 16.6348C16.3936 16.6548 16.1636 16.7048 15.9636 16.7748C15.8136 16.8348 15.6136 16.8948 15.5036 17.0248C15.4436 17.0948 15.3836 17.1648 15.4736 17.2448Z" fill={color}/>
        <Path d="M4.65388 6.29406C5.08388 6.74406 5.52388 7.19406 5.95388 7.64406C6.01388 7.70406 6.07388 7.77407 6.13388 7.83406C6.25388 7.95406 6.42388 8.00407 6.58388 8.02407C6.79388 8.04406 7.04388 7.99406 7.23389 7.90406C7.39389 7.82406 7.58389 7.71406 7.66389 7.55406C7.72389 7.43406 7.75388 7.27407 7.64388 7.16407C7.21388 6.71407 6.77388 6.26406 6.34388 5.81406C6.28388 5.75406 6.22389 5.68407 6.16389 5.62407C6.04389 5.50407 5.87388 5.45406 5.71388 5.43406C5.50388 5.41406 5.25388 5.46406 5.06388 5.55406C4.90388 5.63406 4.71388 5.74406 4.63388 5.90406C4.57388 6.02406 4.54388 6.18406 4.65388 6.29406Z" fill={color}/>
    </Svg>
);

const DhuhrIcon = ({ color = "white", size = 24 }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Path d="M9.13414 16.8399C9.15414 15.0999 10.3641 13.2799 12.2141 13.3599C14.1841 13.4399 15.5641 15.2999 15.5941 17.1599C15.5941 17.6599 17.2441 17.3499 17.2341 16.7199C17.2041 14.8699 15.9641 13.2499 14.2141 12.6799C12.2541 12.0399 9.95414 12.6799 8.59414 14.2199C7.90414 14.9999 7.51414 16.0099 7.49414 17.0499C7.49414 17.4099 7.92414 17.4299 8.20414 17.3899C8.43414 17.3599 9.13414 17.1799 9.13414 16.8399Z" fill={color}/>
        <Path d="M19.5138 16.7803H21.5838C21.8038 16.7803 22.0238 16.7403 22.2238 16.6503C22.3638 16.5903 22.5838 16.4703 22.6638 16.3203C22.7238 16.2103 22.7638 16.0703 22.6638 15.9703C22.5538 15.8603 22.3738 15.8203 22.2138 15.8203H20.1438C19.9238 15.8203 19.7038 15.8603 19.5038 15.9503C19.3638 16.0103 19.1438 16.1303 19.0638 16.2803C19.0038 16.3903 18.9638 16.5303 19.0638 16.6303C19.1738 16.7403 19.3538 16.7803 19.5138 16.7803Z" fill={color}/>
        <Path d="M2.30414 16.6531H4.37414C4.58414 16.6531 4.77414 16.6331 4.97414 16.5831C5.15414 16.5331 5.37414 16.4631 5.53414 16.3431C5.61414 16.2931 5.75414 16.1931 5.72414 16.0831C5.69414 15.9731 5.51414 15.9531 5.43414 15.9531H3.35414C3.14414 15.9531 2.95414 15.9731 2.75414 16.0231C2.57414 16.0731 2.35414 16.1431 2.19414 16.2631C2.11414 16.3131 1.97414 16.4131 2.00414 16.5231C2.03414 16.6331 2.21414 16.6531 2.29414 16.6531H2.30414Z" fill={color}/>
        <Path d="M18.6238 9.79127C18.1638 10.2313 17.7038 10.6813 17.2438 11.1213C17.1738 11.1813 17.1138 11.2513 17.0438 11.3113C16.9338 11.4213 16.8738 11.6413 16.9138 11.7913C16.9538 11.9513 17.1138 12.0913 17.2638 12.1413C17.4638 12.2113 17.6838 12.2213 17.8938 12.1613L18.1038 12.0813C18.2238 12.0213 18.3338 11.9413 18.4238 11.8313C18.8838 11.3913 19.3438 10.9413 19.8038 10.5013C19.8738 10.4413 19.9338 10.3713 20.0038 10.3113C20.1138 10.2013 20.1738 9.98127 20.1338 9.83127C20.0938 9.67127 19.9338 9.53127 19.7838 9.48127C19.5838 9.41127 19.3638 9.40127 19.1538 9.46127L18.9438 9.54127C18.8238 9.60127 18.7138 9.68127 18.6238 9.79127Z" fill={color}/>
        <Path d="M4.64386 10.34C5.18386 10.85 5.73386 11.36 6.27386 11.87L6.50386 12.08C6.59386 12.17 6.82386 12.16 6.93386 12.16C7.14386 12.16 7.38386 12.1 7.57386 12.02C7.72386 11.96 7.92386 11.89 8.02386 11.75C8.08386 11.67 8.13386 11.58 8.04386 11.5C7.50386 10.99 6.95386 10.48 6.41386 9.97002L6.18386 9.76002C6.09386 9.67002 5.86386 9.68002 5.75386 9.68002C5.54386 9.68002 5.30386 9.74002 5.11386 9.82002C4.96386 9.88002 4.76386 9.95002 4.66386 10.09C4.60386 10.17 4.55386 10.26 4.64386 10.34Z" fill={color}/>
        <Path d="M3.21383 20.4813H21.5238C22.6138 20.4813 22.6238 18.7812 21.5238 18.7812H3.21383C2.12383 18.7812 2.11383 20.4813 3.21383 20.4813Z" fill={color}/>
        <Path d="M11.6244 10.3699V5.22993L9.59443 7.25993C9.34443 7.50993 8.89443 7.44993 8.60443 7.31993C8.40443 7.22993 7.97443 6.89993 8.22443 6.64993C9.38443 5.48993 10.5344 4.33993 11.6944 3.17993C12.0244 2.84993 12.6944 3.01993 12.9844 3.31993C14.1444 4.47993 15.2944 5.62993 16.4544 6.78993C16.6844 7.01993 16.5944 7.31993 16.2944 7.39993C15.9544 7.49993 15.4944 7.36993 15.2444 7.11993C14.5344 6.40993 13.8244 5.69993 13.1144 4.98993V10.7799C13.1144 10.9999 11.6244 10.7999 11.6244 10.3799V10.3699Z" fill={color}/>
    </Svg>
);

const AsrIcon = ({ color = "white", size = 24 }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Path d="M16.9292 9.83032C16.6092 9.56032 16.3692 8.90032 16.1492 8.52032C15.6992 7.78032 15.0692 7.14032 14.3892 6.61032C13.0492 5.57032 11.3692 5.01032 9.67919 5.00032C6.27919 4.97032 2.73919 7.06032 2.09919 10.6003C1.54919 13.6603 3.33921 16.7303 6.15921 17.9603C7.07921 18.3603 7.85919 18.4103 8.84919 18.4103H16.3892C17.3692 18.4103 18.2392 18.3203 19.0892 17.7703C20.8092 16.6603 21.9092 14.4803 21.0992 12.4803C20.3492 10.6103 18.4192 9.72032 16.4992 9.77032C16.0292 9.78032 14.7092 10.4903 15.7992 10.4703C17.3192 10.4303 18.8092 11.4503 19.4092 12.8303C20.0992 14.4103 19.5592 16.1703 18.3192 17.3103C17.6392 17.9403 16.7492 17.7203 15.8692 17.7203H12.7292C10.9992 17.7203 9.01921 18.0403 7.40921 17.2703C5.11921 16.1803 3.57919 13.7603 3.62919 11.2103C3.67919 8.37032 5.95919 5.58032 8.92919 5.72032C10.6192 5.80032 12.2092 6.55032 13.4192 7.71032C13.9492 8.21032 14.3492 8.74032 14.7092 9.36032C14.8892 9.68032 15.0792 10.1703 15.3692 10.4103C15.7192 10.7003 17.1892 10.0703 16.9192 9.84032L16.9292 9.83032Z" fill={color}/>
    </Svg>
);

const MaghribIcon = ({ color = "white", size = 24 }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<Path d="M9.14511 16.7421C9.16511 15.0821 10.3951 13.1421 12.1851 13.2921C14.1651 13.4621 15.5751 15.2621 15.5951 17.1821C15.5951 17.5121 17.2451 17.2521 17.2351 16.7421C17.2051 14.8921 15.9551 13.2621 14.1851 12.7421C12.2751 12.1821 9.89512 12.8321 8.57512 14.3321C7.87512 15.1321 7.51512 16.1221 7.49512 17.1821C7.49512 17.5021 9.13512 17.2621 9.13512 16.7421H9.14511Z" fill={color}/>
<Path d="M19.5248 16.8486H21.5948C21.8148 16.8486 22.0348 16.8186 22.2448 16.7286C22.3948 16.6586 22.6048 16.5386 22.6748 16.3786C22.7348 16.2586 22.7648 16.1086 22.6548 15.9886C22.5448 15.8686 22.3648 15.8686 22.2048 15.8086H20.1348C19.9148 15.8086 19.6948 15.8386 19.4848 15.9286C19.3348 15.9986 19.1248 16.1186 19.0548 16.2786C18.9948 16.3986 18.9648 16.5486 19.0748 16.6686C19.1848 16.7886 19.3648 16.8486 19.5248 16.8486Z" fill={color}/>
<Path d="M2.50508 16.7502H4.57508C4.78508 16.7502 5.02508 16.7002 5.21508 16.6202C5.35508 16.5602 5.57508 16.4602 5.66508 16.3202C5.72508 16.2302 5.77508 16.1102 5.66508 16.0202C5.54508 15.9202 5.37508 15.9102 5.22508 15.9102H3.15509C2.94509 15.9102 2.70509 15.9602 2.51509 16.0402C2.37509 16.1002 2.15507 16.2002 2.06507 16.3402C2.00507 16.4302 1.95507 16.5502 2.06507 16.6402C2.18507 16.7402 2.35508 16.7502 2.50508 16.7502Z" fill={color}/>
<Path d="M18.5653 10.1097C18.1153 10.5597 17.6553 11.0197 17.2053 11.4697L17.0053 11.6697C16.9353 11.7397 16.9053 11.8497 16.9853 11.9297C17.0753 12.0197 17.3053 12.0197 17.4153 12.0097C17.6353 11.9997 17.8553 11.9497 18.0553 11.8697C18.2253 11.7997 18.3853 11.7197 18.5053 11.5997C18.9553 11.1497 19.4153 10.6897 19.8653 10.2397L20.0653 10.0397C20.1353 9.96969 20.1653 9.85969 20.0853 9.77969C19.9953 9.68969 19.7653 9.68969 19.6553 9.69969C19.4353 9.70969 19.2153 9.75969 19.0153 9.83969C18.8453 9.90969 18.6853 9.98969 18.5653 10.1097Z" fill={color}/>
<Path d="M4.78473 10.5291C5.30473 10.9691 5.82473 11.4191 6.34473 11.8591C6.42473 11.9191 6.49474 11.9891 6.57474 12.0491C6.70474 12.1591 6.97474 12.1691 7.13474 12.1591C7.33474 12.1391 7.58473 12.0591 7.75473 11.9391C7.88473 11.8391 8.03474 11.6991 8.04474 11.5191V11.3691C8.00474 11.2691 7.94474 11.1891 7.85474 11.1291C7.33474 10.6891 6.81474 10.2391 6.29474 9.79908C6.21474 9.73908 6.14473 9.66908 6.06473 9.60908C5.93473 9.49908 5.66473 9.48908 5.50473 9.49908C5.30473 9.51908 5.05474 9.59908 4.88474 9.71908C4.75474 9.81908 4.60473 9.95908 4.59473 10.1391V10.2891C4.63473 10.3891 4.69473 10.4691 4.78473 10.5291Z" fill={color}/>
<Path d="M3.21481 20.5008H21.5248C22.6148 20.5008 22.6248 18.8008 21.5248 18.8008H3.21481C2.12481 18.8008 2.11481 20.5008 3.21481 20.5008Z" fill={color}/>
<Path d="M11.6254 2.49041V7.63041L9.5954 5.60041C9.3454 5.35041 8.89541 5.41041 8.60541 5.54041C8.40541 5.63041 7.97541 5.96041 8.22541 6.21041C9.38541 7.37041 10.5354 8.52041 11.6954 9.68041C12.0254 10.0104 12.6954 9.84041 12.9854 9.54041C14.1454 8.38041 15.2954 7.23041 16.4554 6.07041C16.6854 5.84041 16.5954 5.54041 16.2954 5.46041C15.9554 5.36041 15.4954 5.49041 15.2454 5.74041C14.5354 6.45041 13.8254 7.16041 13.1154 7.87041V2.09041C13.1154 1.87041 11.6254 2.07041 11.6254 2.49041Z" fill={color}/>
</Svg>

);

const IshaIcon = ({ color = "white", size = 24 }) => (
    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Path d="M10.8574 2.02694C5.41742 3.14694 1.55742 8.69694 3.51742 14.1469C5.38742 19.3369 11.4874 22.0169 16.4574 19.3469C19.1974 17.8669 21.0674 15.1769 21.6274 12.1369C21.7574 11.4069 20.5674 11.6569 20.2574 11.8469C17.6574 13.4969 14.2074 12.8869 12.2474 10.5369C10.2874 8.18694 10.2674 5.11694 11.7774 2.65694C12.2374 1.89694 10.5774 1.89694 10.2174 2.48694C8.37741 5.49694 8.77741 9.50694 11.4074 11.9369C14.0374 14.3669 18.2774 14.5169 21.3474 12.5569L19.9774 12.2669C19.1274 16.8669 14.7174 20.5769 9.99741 18.7569C5.8074 17.1469 3.50741 11.9769 5.28741 7.82694C6.34741 5.34694 8.52741 3.64694 11.1574 3.10694C12.1874 2.89694 11.8874 1.81694 10.8674 2.02694H10.8574Z" fill={color}/>
    </Svg>

);

const mapStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
    { "featureType": "administrative.locality", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
    { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
    { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#263c3f" }] },
    { "featureType": "poi.park", "elementType": "labels.text.fill", "stylers": [{ "color": "#6b9a76" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
    { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] },
    { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9ca5b3" }] },
    { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#746855" }] },
    { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#1f2835" }] },
    { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#f3d19c" }] },
    { "featureType": "transit", "elementType": "geometry", "stylers": [{ "color": "#2f3948" }] },
    { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#d59563" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] },
    { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#515c6d" }] },
    { "featureType": "water", "elementType": "labels.text.stroke", "stylers": [{ "color": "#17263c" }] }
];

const TripOverviewScreen = () => {

    const navigation = useNavigation();
    const route = useRoute();
    const { trip, tripId: passedTripId, orgId: passedOrgId, invitationCode: directCode, isAdmin: passedIsAdmin } = route.params || {};

    const invitationCode = directCode || trip?.invitationCode;

    const [liveTripData, setLiveTripData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(passedIsAdmin !== undefined ? passedIsAdmin : (trip?.isAdmin !== undefined ? trip.isAdmin : false));
    const [userRole, setUserRole] = useState(passedIsAdmin ? 'admin' : 'participant');
    const [isScrolled, setIsScrolled] = useState(false);


    const [visibilityModalVisible, setVisibilityModalVisible] = useState(false);
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [seatModalVisible, setSeatModalVisible] = useState(false);
    const [requestSentVisible, setRequestSentVisible] = useState(false);
    const [seatCount, setSeatCount] = useState(1);

    // New Participant Detail States
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [detailVisible, setDetailVisible] = useState(false);
    const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
    const [deleteType, setDeleteType] = useState('this'); // 'this' or 'all'
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [quickAlertVisible, setQuickAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');
    const [alertTitle, setAlertTitle] = useState('');

    const [selectedField, setSelectedField] = useState(null);
    const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
    const [countdown, setCountdown] = useState(10);
    const { 
        isConnected, 
        isChannelActive: isChannelStarted, 
        isGlobalMuteActive: isAllMuted, 
        isMuted, 
        setIsMuted,
        loading: voiceLoading,
        connect,
        disconnect,
        stopChannel,
        isAdmin: isAdminContext,
        activeTripId 
    } = useVoice();
    const [participantsList, setParticipantsList] = useState([]);
    const [notificationsList, setNotificationsList] = useState([]);
    const [lastChatMessage, setLastChatMessage] = useState(null);
    const [liveLocations, setLiveLocations] = useState({});
    const [userLocation, setUserLocation] = useState(null);
    const [participantsCount, setParticipantsCount] = useState(0);
    const [sharedTemplates, setSharedTemplates] = useState([]);
    const [globalVisibilityConfig, setGlobalVisibilityConfig] = useState({});
    const [activeSpeakerData, setActiveSpeakerData] = useState(null);
    const [currentUserFullName, setCurrentUserFullName] = useState('');
    const [currentUserPhoto, setCurrentUserPhoto] = useState('');
    const [resolvedOrgId, setResolvedOrgId] = useState(passedOrgId || trip?.orgId || trip?.org_id);
    const [unreadCount, setUnreadCount] = useState(0);


    // Stable ID resolution to avoid effect re-runs on temporary nulls
    const tripId = passedTripId || trip?.id || trip?.trip_id || liveTripData?.id;
    const orgId = resolvedOrgId || passedOrgId || trip?.orgId || trip?.org_id || liveTripData?.orgId;



    // Real-time Data Synchronization
    useEffect(() => {
        let tripRef;

        const syncData = async () => {
            try {
                // Verify account role from Custom Claims
                const currentU = auth.currentUser;
                if (currentU) {
                    const tokenResult = await currentU.getIdTokenResult();
                    const role = tokenResult.claims.role || 'participant';
                    setUserRole(role);
                    setIsAdmin(role === 'admin' || role === 'co-host' || role === 'manager');

                    // Fetch profile info for notifications
                    get(ref(database, `users/${currentU.uid}`)).then(snap => {
                        if (snap.exists()) {
                            const uData = snap.val();
                            if (uData.full_name) setCurrentUserFullName(uData.full_name);
                            const photoVal = uData.photo || uData.profile_photo || uData.image;
                            if (photoVal) setCurrentUserPhoto(photoVal);
                        }
                    });
                }

                let activeTripId = tripId;
                let activeOrgId = orgId;

                // S22: If no trip info passed (app start), fetch current_trip from user profile (The Secure Store)
                if (!activeTripId && auth.currentUser) {
                    const userSnap = await get(ref(database, `users/${auth.currentUser.uid}`));
                    const userData = userSnap.val();

                    if (userData?.current_trip) {
                        activeTripId = userData.current_trip;
                    }
                }

                // If we still don't have a trip, return to Home instead of guessing
                if (!activeTripId) {
                    setIsLoading(false);
                    navigation.navigate('Home');
                    return;
                }

                // S22: If orgId is missing, resolve it from staff profile or joined trips
                if (!activeOrgId && auth.currentUser) {
                    const userSnap = await get(ref(database, `users/${auth.currentUser.uid}`));
                    const userData = userSnap.val();

                    if (userData?.staff_org_id) {
                        activeOrgId = userData.staff_org_id;
                    } else {
                        const joinedSnap = await get(ref(database, `users/${auth.currentUser.uid}/joined_trips/${activeTripId}`));
                        if (joinedSnap.exists()) {
                            activeOrgId = joinedSnap.val().org_id || joinedSnap.val().orgId;
                        }
                    }
                }

                // S22: Anchor this trip as the 'current_trip' for the user session
                if (auth.currentUser && activeTripId) {
                    update(ref(database, `users/${auth.currentUser.uid}`), {
                        current_trip: activeTripId
                    }).catch(err => { });

                    // Resolve orgId if still missing
                    if (!activeOrgId) {
                        const orgSnap = await get(ref(database, `trips_orgs/${activeTripId}`));
                        if (orgSnap.exists()) {
                            activeOrgId = orgSnap.val();
                            setResolvedOrgId(activeOrgId);
                        }
                    }
                }

                if (invitationCode) {
                    // Participant View: Resolve Admin ID and Trip ID first
                    const inviteRef = ref(database, `invites/${invitationCode}`);
                    onValue(inviteRef, (snapshot) => {
                        const inviteData = snapshot.val();
                        if (inviteData && inviteData.org_id && inviteData.trip_id) {
                            tripRef = ref(database, `orgs/${inviteData.org_id}/trips/${inviteData.trip_id}`);
                            onValue(tripRef, (tripSnapshot) => {
                                const data = tripSnapshot.val();
                                setLiveTripData({ ...data, orgId: inviteData.org_id, id: inviteData.trip_id });
                                setIsLoading(false);
                            });
                        } else {
                            setIsLoading(false);
                        }
                    }, { onlyOnce: true });
                } else if (activeOrgId && activeTripId) {
                    // Direct sync (Admin or Resolved Participant)
                    tripRef = ref(database, `orgs/${activeOrgId}/trips/${activeTripId}`);
                    onValue(tripRef, (snapshot) => {
                        if (snapshot.exists()) {
                            setLiveTripData({ ...snapshot.val(), orgId: activeOrgId, id: activeTripId });
                        }
                        setIsLoading(false);
                    });
                } else {
                    setIsLoading(false);
                }
            } catch (error) {
                setIsLoading(false);
            }
        };


        syncData();
        return () => {
            // Cleanup would require tracking all listeners, for now we let it be
        };
    }, [invitationCode, trip]);

    // 0. Fetch Global Visibility Config
    useEffect(() => {
        if (!orgId || !tripId) return;
        const configRef = ref(database, `orgs/${orgId}/trips/${tripId}/visibility_config`);
        const unsubscribe = onValue(configRef, (snapshot) => {
            if (snapshot.exists()) {
                setGlobalVisibilityConfig(snapshot.val());
            } else {
                setGlobalVisibilityConfig({});
            }
        });
        return () => unsubscribe();
    }, [orgId, tripId]);

    // Mock data fallback if trip is missing or not yet loaded
    const DEFAULT_TRIP_IMAGE = require('../../../assets/Madinah.png');

    const displayTrip = liveTripData || trip || {};

    const tripData = {
        title: displayTrip.title || 'Loading Trip...',
        date: displayTrip.date || '---',
        location: displayTrip.location || '---',
        participants: participantsCount || displayTrip.participants || 0,
        image: displayTrip.image || DEFAULT_TRIP_IMAGE,
        invitationCode,
        isAdmin,
        orgId,
        tripId,
    };


    // 1. Fetch Real Participants with Privacy Masking
    useEffect(() => {
        if (!tripId || !orgId) {
            setParticipantsList([]);
            setParticipantsCount(0);
            return;
        }

        const participantsRef = ref(database, `trips_participants/${tripId}`);
        const tripDataRef = ref(database, `orgs/${orgId}/trips/${tripId}`);

        let organizerId = null;

        // Get organizer ID first
        get(tripDataRef).then(snap => {
            if (snap.exists()) {
                organizerId = snap.val().organizer_id;
            }
        });

        let activeUnsubs = {}; // Manage individual user subscriptions

        const unsubscribe = onValue(participantsRef, (snapshot) => {
            const val = snapshot.val() || {};
            let uids = [];

            if (Array.isArray(val)) {
                uids = val.filter(v => v !== null);
            } else {
                uids = Object.keys(val);
            }

            // Get staff list for filtering
            const staffRef = ref(database, `orgs/${orgId}/staff`);
            get(staffRef).then(staffSnap => {
                const staffList = staffSnap.val() || {};
                const filteredUids = uids.filter(uid => {
                    const role = staffList[uid];
                    return !role || role === 'admin' || role === 'co-host' || role === 'manager';
                });

                const teamMemberUids = Object.keys(staffList).filter(uid => {
                    const role = staffList[uid];
                    return role === 'admin' || role === 'co-host' || role === 'manager';
                });

                const combinedUids = Array.from(new Set([...filteredUids, ...teamMemberUids]));

                setParticipantsCount(combinedUids.length);

                if (combinedUids.length === 0) {
                    setParticipantsList([]);
                    Object.values(activeUnsubs).forEach(unsub => unsub());
                    activeUnsubs = {};
                    return;
                }

                // Unsubscribe from removed users
                Object.keys(activeUnsubs).forEach(uid => {
                    if (!combinedUids.includes(uid)) {
                        activeUnsubs[uid]();
                        delete activeUnsubs[uid];
                        setParticipantsList(prev => prev.filter(p => p.id !== uid));
                    }
                });

                combinedUids.forEach((uid) => {
                    if (!activeUnsubs[uid]) {
                        const userRef = ref(database, `users/${uid}`);
                        
                        const unsubUser = onValue(userRef, (userSnap) => {
                            const userData = userSnap.val() || {};
                            const profile = userData.profile || {};
                            const fullName = userData.full_name;
                            const visibility = userData.participant_visibility?.[tripId] || {};
                            const isCurrentUser = uid === auth.currentUser?.uid;
                            const amIAdmin = isAdmin; // captured from state

                            // Privacy Logic based on role and settings
                            const canSeePII = (field) => {
                                if (isCurrentUser) return true; // Can always see self

                                // 1. Check Global Admin Config
                                const globalSetting = globalVisibilityConfig[field] || 'Show to everyone';

                                if (globalSetting === 'Do not show') return false;
                                if (globalSetting === 'Show to organizer') return amIAdmin;
                                if (globalSetting === 'Show to everyone') return true;

                                // 2. If 'Custom choice', check participant's own setting
                                if (globalSetting === 'Custom choice') {
                                    const personalSetting = visibility[field] || 'Show to organizer';
                                    if (personalSetting === 'Do not show') return false;
                                    if (personalSetting === 'Show to organizer') return amIAdmin;
                                    if (personalSetting === 'Show to everyone') return true;
                                }

                                return false;
                            };

                            let displayName = 'User';
                            if (canSeePII('name')) {
                                if (profile.firstName || profile.lastName) {
                                    displayName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
                                } else if (fullName) {
                                    displayName = fullName;
                                } else if (isCurrentUser) {
                                    displayName = auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'You';
                                }
                            } else if (isCurrentUser) {
                                displayName = 'You';
                            }

                            const displayImage = canSeePII('photo') && profile.photoURL
                                ? profile.photoURL
                                : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName[0] || 'U')}&background=B99A4A&color=fff`;

                            const role = staffList[uid];
                            let status = uid === organizerId ? 'Organizer' : 'Joined';
                            if (role === 'admin') {
                                status = 'Admin';
                            } else if (role === 'co-host') {
                                status = 'Co-Host';
                            } else if (role === 'manager') {
                                status = 'Manager';
                            }

                            const pData = {
                                id: uid,
                                name: displayName,
                                image: displayImage,
                                status: status,
                                isSpeaking: false,
                                isOrganizer: uid === organizerId,
                                canSeeLocation: canSeePII('location')
                            };

                            setParticipantsList(prev => {
                                const filtered = prev.filter(p => p.id !== uid);
                                return [...filtered, pData];
                            });
                        });
                        activeUnsubs[uid] = unsubUser;
                    }
                });
            });
        });

        return () => {
            unsubscribe();
            Object.values(activeUnsubs).forEach(unsub => unsub());
        };
    }, [tripId, orgId, isAdmin, globalVisibilityConfig]);

    // Voice state is now managed globally by VoiceContext
    const { setActiveTrip } = useVoice();
    useEffect(() => {
        if (tripId && orgId) {
            setActiveTrip(tripId, orgId);
        }
    }, [tripId, orgId]);

    const handleToggleMute = async () => {
        const nextState = !isMuted;
        setIsMuted(nextState);

        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';
        if (isStaff && orgId && tripId) {
            update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
                adminMuted: nextState
            });
        }
    };

    const handleToggleAllMute = async () => {
        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';
        if (!isStaff || !orgId || !tripId) return;
        const nextState = !isAllMuted;
        update(ref(database, `trips_active/${orgId}/${tripId}/voice_channel`), {
            isAllMuted: nextState
        });
    };

    const handleToggleChannel = async () => {
        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';
        if (!isStaff || !orgId || !tripId) return;
        
        if (!isChannelStarted) {
            // If starting, navigate to Voice Chat and auto-start
            navigation.navigate('VoiceChat', {
                trip: tripData,
                isAdmin: true,
                autoStart: true
            });
        } else {
            // If stopping, use context to stop channel globally
            stopChannel();
        }
    };

    // 2. Fetch Real Notifications (Location Requests)
    useEffect(() => {
        const myUid = auth.currentUser?.uid;
        if (!myUid || !orgId || !tripId) return;

        const notificationsRef = ref(database, `trips_active/${orgId}/${tripId}/notifications/${myUid}`);
        const unsubscribe = onValue(notificationsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const list = Object.entries(data ?? {}).map(([id, val]) => {
                    let msg = val?.message || '';
                    if (val?.type === 'location_request') {
                        msg = 'asked for your location';
                    }

                    return {
                        id,
                        ...(val || {}),
                        message: msg
                    };
                });
                // Sort by timestamp
                list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                setNotificationsList(list);
            } else {
                setNotificationsList([]);
            }
        });

        return () => unsubscribe();
    }, [orgId, tripId]);

    // 3. Fetch Shared Templates for Admin
    useEffect(() => {
        const isStaff = userRole === 'admin' || userRole === 'co-host' || userRole === 'manager';
        if (!orgId || !tripId || !isStaff) return;

        const templatesRef = ref(database, `trips_active/${orgId}/${tripId}/templates`);
        const unsubscribe = onValue(templatesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const list = Object.entries(data).map(([id, t]) => ({
                    id,
                    name: t.name,
                    message: t.message
                }));
                setSharedTemplates(list);
            } else {
                setSharedTemplates([]);
            }
        });

        return () => unsubscribe();
    }, [orgId, tripId, isAdmin]);

    // 4. Fetch Last Chat Message
    useEffect(() => {
        if (!orgId || !tripId) return;

        const chatRef = query(ref(database, `trips_active/${orgId}/${tripId}/chat`), limitToLast(1));
        const unsubscribe = onValue(chatRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const lastKey = Object.keys(data ?? {})[0];
                if (lastKey) {
                    const msg = data[lastKey];

                    // Apply privacy check for sender name if possible
                    const nameSetting = globalVisibilityConfig?.name || 'Show to everyone';
                    let senderName = msg.sender_name || 'User';
                    if (nameSetting === 'Do not show') senderName = 'User';
                    else if (nameSetting === 'Show to organizer' && !isAdmin) senderName = 'User';

                    setLastChatMessage({
                        senderName: senderName,
                        text: msg.text || '',
                        type: msg.type || ''
                    });
                }
            } else {
                setLastChatMessage(null);
            }
        });

        return () => unsubscribe();
    }, [orgId, tripId]);

    // 5. Fetch Unread Message Count
    useEffect(() => {
        const myUid = auth.currentUser?.uid;
        if (!myUid || !orgId || !tripId) return;

        const readPointerRef = ref(database, `trips_active/${orgId}/${tripId}/read_pointers/${myUid}`);
        const chatRef = ref(database, `trips_active/${orgId}/${tripId}/chat`);

        let unsubscribeUnread = null;

        const unsubscribeReadPointer = onValue(readPointerRef, (pointerSnap) => {
            const lastRead = pointerSnap.val() || 0;
            
            if (unsubscribeUnread) unsubscribeUnread();

            const unreadQuery = query(
                chatRef, 
                orderByChild('timestamp'), 
                startAt(lastRead + 1)
            );

            unsubscribeUnread = onValue(unreadQuery, (chatSnap) => {
                if (chatSnap.exists()) {
                    const data = chatSnap.val();
                    const messagesList = Object.values(data);
                    // Filter out own messages
                    const unread = messagesList.filter(m => m.sender_id !== myUid).length;
                    setUnreadCount(unread);
                } else {
                    setUnreadCount(0);
                }
            });
        });

        return () => {
            unsubscribeReadPointer();
            if (unsubscribeUnread) unsubscribeUnread();
        };
    }, [orgId, tripId]);

    // 4. Fetch Live Participant Locations for map preview
    useEffect(() => {
        if (!orgId || !tripId) return;

        const locationsRef = ref(database, `trips_active/${orgId}/${tripId}/locations`);
        const unsubscribe = onValue(locationsRef, (snapshot) => {
            if (snapshot.exists()) {
                setLiveLocations(snapshot.val());
            } else {
                setLiveLocations({});
            }
        });


        return () => unsubscribe();
    }, [orgId, tripId]);

    // 5. Track Current User Location

    useEffect(() => {
        let subscription;
        const startWatching = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced,
                    timeInterval: 5000,
                    distanceInterval: 10,
                },
                (loc) => {
                    setUserLocation({
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                    });
                }
            );
        };
        startWatching();
        return () => subscription?.remove();
    }, []);

    // Utility to find nearest participant
    const getNearestParticipant = () => {
        if (!userLocation || Object.keys(liveLocations ?? {}).length === 0) return null;

        let nearestUid = null;
        let minDistance = Infinity;

        for (const [uid, loc] of Object.entries(liveLocations ?? {})) {
            if (uid === auth.currentUser?.uid || !loc) continue;

            // Check if participant is still active and has visibility
            const pProfile = participantsList.find(p => p.id === uid);
            if (!pProfile || pProfile.canSeeLocation === false) continue;

            const dist = Math.sqrt(
                Math.pow(loc.lat - userLocation.latitude, 2) +
                Math.pow((loc.lng || 0) - userLocation.longitude, 2)
            );

            if (dist < minDistance) {
                minDistance = dist;
                nearestUid = uid;
            }
        }

        if (!nearestUid) return null;
        return {
            uid: nearestUid,
            ...liveLocations[nearestUid],
            profile: participantsList.find(p => p.id === nearestUid)
        };
    };

    const nearestParticipant = getNearestParticipant();

    const handleAcceptNotification = async (notif) => {
        const myUid = auth.currentUser?.uid;
        if (!myUid || !orgId || !tripId) return;

        try {
            // 1. Grant permission if it's a location request
            if (notif?.type === 'location_request' && notif?.fromUid) {
                await set(ref(database, `trips_active/${orgId}/${tripId}/location_permissions/${myUid}/${notif.fromUid}`), true);
            }

            // 2. Mark as accepted for visual feedback
            await update(ref(database, `trips_active/${orgId}/${tripId}/notifications/${myUid}/${notif.id}`), {
                status: 'accepted'
            });

            // 3. Remove after delay
            setTimeout(async () => {
                try {
                    await remove(ref(database, `trips_active/${orgId}/${tripId}/notifications/${myUid}/${notif.id}`));
                } catch (e) { }
            }, 2000);
        } catch (error) {
        }
    };


    const handleRequestSeats = () => {
        setSeatModalVisible(false);
        setRequestSentVisible(true);
    };

    const handleShare = async () => {
        if (!invitationCode) return;
        try {
            const shareUrl = `https://gomusafir.app/join?code=${invitationCode}`;
            await Share.share({
                message: `Join our journey on GoMusafir! Use this link to join: ${shareUrl}`,
                url: shareUrl,
                title: 'Join Journey'
            });
        } catch (error) {
        }
    };

    const handleParticipantPress = async (participant) => {
        setIsDecrypting(true);
        setSelectedParticipant(participant);
        setDetailVisible(true);
        
        try {
            await ChatEncryption.initialize();
            const getProfile = httpsCallable(functions, 'getParticipantProfile');
            const result = await getProfile({
                targetUid: participant.id,
                tripId: tripId
            });
            
            if (result && result.data) {
                setSelectedParticipant(prev => {
                    if (!prev || prev.id !== participant.id) return prev;
                    const newData = { ...prev };
                    
                    // Decrypt fields if they are encrypted
                    const decryptedEmail = ChatEncryption.decrypt(result.data.email);
                    const decryptedPhone = ChatEncryption.decrypt(result.data.phone);
                    const decryptedName = ChatEncryption.decrypt(result.data.fullName);

                    // Update if we got valid plaintext results
                    if (decryptedEmail && decryptedEmail.includes('@')) {
                        newData.email = decryptedEmail;
                    } else {
                        newData.email = result.data.email || 'N/A';
                    }
                    if (decryptedPhone && decryptedPhone.length > 5) {
                        newData.phone = decryptedPhone;
                    } else {
                        newData.phone = result.data.phone || 'N/A';
                    }
                    if (decryptedName && !decryptedName.includes('*')) {
                        newData.name = decryptedName;
                    } else {
                        newData.name = result.data.fullName || prev.name;
                    }

                    if (result.data.profile) {
                        newData.firstName = result.data.profile.firstName || '';
                        newData.lastName = result.data.profile.lastName || '';
                    } else {
                        const parts = (result.data.fullName || '').split(' ');
                        newData.firstName = parts[0] || '';
                        newData.lastName = parts.slice(1).join(' ') || '';
                    }
                    
                    return newData;
                });
            }
        } catch (error) {
            console.log("[TripOverview] Decryption error:", error);
        } finally {
            setIsDecrypting(false);
        }
    };

    const handleDeletePress = (type = 'this') => {
        setDeleteType(type);
        setDetailVisible(false);
        setTimeout(() => setDeleteConfirmVisible(true), 300);
    };

    const confirmDelete = async () => {
        if (!selectedParticipant) return;

        setDeleteConfirmVisible(false);
        setIsLoading(true);

        try {
            if (deleteType === 'all') {
                const deleteGlobally = httpsCallable(functions, 'deleteUserGlobally');
                await deleteGlobally({ targetUid: selectedParticipant.id });
            } else {
                const removeParticipant = httpsCallable(functions, 'removeParticipantFromTrip');
                await removeParticipant({
                    tripId: tripId,
                    targetUid: selectedParticipant.id
                });
            }
            Alert.alert("Success", `Participant has been removed ${deleteType === 'all' ? 'globally' : 'from this trip'}.`);
        } catch (error) {
            console.log("Delete Error:", error);
            Alert.alert("Error", "Failed to delete participant. " + error.message);
        } finally {
            setIsLoading(false);
            setSelectedParticipant(null);
        }
    };

    const sortedParticipants = [...participantsList].sort((a, b) => {
        const myUid = auth.currentUser?.uid;
        if (a.id === myUid) return -1;
        if (b.id === myUid) return 1;
        return a.name.localeCompare(b.name);
    });

    const voiceTracks = useTracks([Track.Source.Microphone], { onlyRemote: false });

    const participants = sortedParticipants.map(p => {
        const track = voiceTracks.find(t => t.participant.identity === p.id);
        if (track) {
            const isSpeaking = track.participant.isSpeaking;
            const isMicrophoneEnabled = track.participant.isMicrophoneEnabled;
            return {
                ...p,
                isSpeaking,
                isMicrophoneEnabled,
                voiceStatus: isSpeaking ? 'Speaking' : (isMicrophoneEnabled ? 'Active' : 'Muted')
            };
        }
        return p;
    });


    const QUICK_MESSAGES = [
        'The bus leaves in 5 min',
        'Gather at the meeting point',
        'Bus is arriving, please get ready'
    ];

    const MOCK_NOTIFICATIONS = notificationsList;

    const lastAlert = notificationsList.find(n => n.type === 'alert' || n.type === 'emergency');
    const lastAlertSender = lastAlert ? lastAlert.name : 'Ethan Carter';


    const handleQuickMsgPress = (template) => {
        setAlertTitle(template.name || 'Alert!');
        setAlertMessage(template.message);
        setQuickAlertVisible(true);
    };

    const broadcastNotification = async (msg, title) => {
        if (!orgId || !tripId) {
            alert("Trip information not fully loaded. Please wait.");
            return;
        }

        try {
            const timestamp = serverTimestamp();
            const adminName = currentUserFullName || auth.currentUser?.email?.split('@')[0] || 'Admin';
            const senderPhoto = currentUserPhoto || auth.currentUser?.photoURL || '';

            // 1. Fetch current UIDs directly from the source of truth (trips_participants)
            const participantsRef = ref(database, `trips_participants/${tripId}`);
            const participantsSnap = await get(participantsRef);

            if (!participantsSnap.exists()) {
                alert("No participants found to notify.");
                return;
            }

            const val = participantsSnap.val();
            if (!val) {
                alert("No participants found in this trip.");
                return;
            }

            // S22: Correctly extract UIDs (values) and ensure they are unique
            const rawUids = Array.isArray(val) ? val.filter(v => v !== null) : Object.keys(val);
            const uids = Array.from(new Set(rawUids.filter(id => typeof id === 'string')));

            // 2. Broadcast to all found UIDs
            const promises = uids.map(uid => {
                const userNotifRef = ref(database, `trips_active/${orgId}/${tripId}/notifications/${uid}`);
                return push(userNotifRef, {
                    name: adminName,
                    title: alertTitle || title || 'Alert!',
                    message: msg,
                    timestamp: timestamp,
                    type: 'alert',
                    senderImage: senderPhoto
                });
            });

            await Promise.all(promises);
            setQuickAlertVisible(false); // Close preview
            Alert.alert("Success", "Notification broadcasted to all participants.");
        } catch (error) {
            console.log("Broadcast failed:", error);
            alert("Failed to send notification.");
        }
    };

    const triggerEmergencyAlert = async () => {
        if (!orgId || !tripId) return;
        try {
            // 1. Get all staff members for this organization
            const staffRef = ref(database, `orgs/${orgId}/staff`);
            const staffSnap = await get(staffRef);

            if (staffSnap.exists()) {
                const staffData = staffSnap.val();
                // S22: Ensure unique Staff UIDs to prevent duplicate emergency alerts
                const staffUids = Array.from(new Set(Object.keys(staffData)));
                const userName = currentUserFullName || auth.currentUser?.email?.split('@')[0] || 'A Participant';
                const timestamp = serverTimestamp();
                const senderPhoto = currentUserPhoto || auth.currentUser?.photoURL || '';

                // 2. Send notification to each staff member (excluding the sender)
                const promises = staffUids
                    .filter(sUid => sUid !== auth.currentUser?.uid) // Don't notify yourself
                    .map(sUid => {
                        const notifRef = ref(database, `trips_active/${orgId}/${tripId}/notifications/${sUid}`);
                        return push(notifRef, {
                            name: isAdmin ? "Admin" : userName,
                            title: 'Emergency Alert',
                            message: "needs immediate assistance!",
                            timestamp: timestamp,
                            type: 'emergency',
                            senderUid: auth.currentUser?.uid,
                            senderImage: senderPhoto
                        });
                    });

                await Promise.all(promises);
                // setAlertMessage("Emergency Alert Sent to all staff!");
                // setQuickAlertVisible(true);
            }
        } catch (error) {
            console.log("Emergency Alert Failed:", error);
        }
    };

    const PrayerTimeItem = ({ name, time, icon: Icon, isActive }) => (
        <View style={styles.prayerItem}>
            {Icon && <Icon
                size={24}
                color={isActive ? "#FFF" : "#A1A1AA"}
                style={{ marginBottom: 4 }}
            />}
            <Text style={[styles.prayerName, isActive && { color: '#FFF' }]}>{name}</Text>
            <Text style={[styles.prayerTime, isActive && { color: '#FFF' }]}>{time}</Text>
        </View>
    );

    const [prayerTimes, setPrayerTimes] = useState({
        Fajr: "--:--",
        Dhuhr: "--:--",
        Asr: "--:--",
        Maghrib: "--:--",
        Isha: "--:--",
    });

    useEffect(() => {
        const getLocAndPrayers = async () => {
            try {
                // 1. Immediate Cache Check
                const cached = await AsyncStorage.getItem('cached_prayer_times');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    const today = new Date().toISOString().split('T')[0];
                    if (parsed.date === today) {
                        setPrayerTimes(parsed.timings);
                        // We still want to refresh in the background if it's the first time this session
                    }
                }

                // 2. Permission Check
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;

                // 3. Fast Location (Get Last Known first)
                let location = await Location.getLastKnownPositionAsync();

                // 4. Fallback to Current Position if last known is old or null
                if (!location) {
                    location = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.Balanced,
                    });
                }

                if (location) {
                    const { latitude, longitude } = location.coords;
                    const response = await fetch(
                        `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=4`
                    );

                    const data = await response.json();
                    if (data.code === 200) {
                        const timings = data.data.timings;
                        const newTimings = {
                            Fajr: timings.Fajr,
                            Dhuhr: timings.Dhuhr,
                            Asr: timings.Asr,
                            Maghrib: timings.Maghrib,
                            Isha: timings.Isha,
                        };
                        setPrayerTimes(newTimings);

                        // Save to Cache
                        await AsyncStorage.setItem('cached_prayer_times', JSON.stringify({
                            date: new Date().toISOString().split('T')[0],
                            timings: newTimings
                        }));
                    }
                }
            } catch (error) {
                // Silent error to prevent UI disruption
                console.log("Prayer Load Error:", error);
            }
        };

        getLocAndPrayers();
    }, []);

    const getActivePrayer = () => {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const prayers = [
            { name: "Fajr", time: prayerTimes.Fajr },
            { name: "Dhuhr", time: prayerTimes.Dhuhr },
            { name: "Asr", time: prayerTimes.Asr },
            { name: "Maghrib", time: prayerTimes.Maghrib },
            { name: "Isha", time: prayerTimes.Isha },
        ];

        let activeIdx = -1;
        for (let i = 0; i < prayers.length; i++) {
            const [h, m] = prayers[i].time.split(':').map(Number);
            const pTime = h * 60 + m;
            if (currentTime >= pTime) {
                activeIdx = i;
            }
        }

        if (activeIdx === -1) return "Isha";
        return prayers[activeIdx].name;
    };

    useEffect(() => {
        let timer;
        if (emergencyModalVisible && countdown > 0) {
            timer = setInterval(() => {
                setCountdown(prev => prev - 1);
            }, 1000);
        } else if (countdown === 0) {
            setEmergencyModalVisible(false);
            triggerEmergencyAlert();
            setCountdown(10);
        }
        return () => clearInterval(timer);
    }, [emergencyModalVisible, countdown]);

    // Swipe down to close logic for modals - Interactive Draggable version
    const createDraggableResponder = (setter, animatedValue) => PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
            const { dy, dx } = gestureState;
            return dy > 5 && dy > Math.abs(dx);
        },
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
            const { dy, dx } = gestureState;
            return dy > 20 && dy > Math.abs(dx);
        },
        onPanResponderMove: (_, gestureState) => {
            if (gestureState.dy > 0) {
                animatedValue.setValue(gestureState.dy);
            }
        },
        onPanResponderRelease: (_, gestureState) => {
            if (gestureState.dy > 120 || (gestureState.dy > 50 && gestureState.vy > 0.5)) {
                Animated.timing(animatedValue, {
                    toValue: height,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => {
                    setter(false);
                    animatedValue.setValue(0);
                });
            } else {
                Animated.spring(animatedValue, {
                    toValue: 0,
                    friction: 8,
                    useNativeDriver: true,
                }).start();
            }
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => true,
    });

    const panYDetail = React.useRef(new Animated.Value(0)).current;
    const panYEmergency = React.useRef(new Animated.Value(0)).current;
    const panYDelete = React.useRef(new Animated.Value(0)).current;
    const panYQuick = React.useRef(new Animated.Value(0)).current;

    const detailSwipe = createDraggableResponder(setDetailVisible, panYDetail);
    const emergencySwipe = createDraggableResponder(setEmergencyModalVisible, panYEmergency);
    const deleteConfirmSwipe = createDraggableResponder(setDeleteConfirmVisible, panYDelete); // Reusing for confirm modal
    const quickAlertSwipe = createDraggableResponder(setQuickAlertVisible, panYQuick);



    const activePrayer = getActivePrayer();

    const ControlButton = ({ icon, label, isActive }) => (
        <TouchableOpacity style={[styles.controlButton, isActive && styles.controlButtonActive]}>
            <View style={styles.controlIconWrapper}>
                <Ionicons name={icon} size={20} color="#FFF" />
            </View>
            <Text style={styles.controlLabel}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            {/* Background Image at the top only */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 310 }}>
                <ImageBackground
                    source={typeof tripData.image === 'string' ? { uri: tripData.image } : tripData.image}
                    style={{ flex: 1 }}
                    resizeMode="cover"
                >
                    <LinearGradient
                        colors={['rgba(0,0,0,0.3)', Colors.dark.background]}
                        style={styles.gradientOverlay}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                    />
                </ImageBackground>
            </View>

            <SafeAreaView style={{ flex: 1, marginTop: 20 }}>
                {/* Fixed Background Header Layer (Z-Index: 0) - Title stays fixed */}
                <View style={[styles.header, { position: 'absolute', top: 0, left: 0, right: 0, zIndex: isScrolled ? 5 : 15 }]} pointerEvents="box-none">

                    {isAdmin ? (
                        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.iconButton}>
                            <Ionicons name="arrow-back" size={24} color="#FFF" />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.iconButton} />
                    )}


                    <Text style={[styles.headerTitle, (userRole === 'admin' || userRole === 'co-host') ? null : { marginRight: 30 }]}>Overview</Text>

                    {(userRole === 'admin' || userRole === 'co-host') ? (
                        // {isAdmin ? (
                        <View style={{ flexDirection: 'row' }}>
                            {/* <TouchableOpacity
                                style={styles.iconButton}
                                onPress={handleShare}
                            >
                                <Ionicons name="share-social-outline" size={24} color="#B99A4A" />
                            </TouchableOpacity> */}

                            <TouchableOpacity
                                style={styles.iconButton}
                                onPress={() => navigation.navigate('JourneySuccess', { invitationCode: invitationCode || tripData?.invitationCode })}
                            >
                            <Svg width="26" height="20" viewBox="0 0 26 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <Path d="M9.08595 11.7079C10.108 11.708 11.0565 11.9299 11.6358 12.8554C12.1184 13.622 11.9825 14.6045 11.9824 15.4677C11.9824 15.7573 11.0508 15.8994 11.0508 15.7177C11.0508 14.8545 11.2095 13.9004 10.7041 13.1054C10.1987 12.3105 9.39808 12.123 8.52931 12.123H6.06447C5.84309 12.123 5.61008 12.1062 5.38869 12.1288C4.79813 12.1799 4.33776 12.7078 4.11623 13.2245C3.82658 13.9004 3.94044 14.7357 3.94044 15.457C3.94 15.7463 3.00989 15.8882 3.0088 15.707C3.0088 14.6792 2.88376 13.5773 3.57619 12.7538C4.26896 11.9305 5.32554 11.708 6.34767 11.7079H9.08595ZM4.95021 4.88859C5.83046 3.86636 7.35263 3.41258 8.64748 3.82707C9.87973 4.21889 10.7543 5.3314 10.7715 6.63176C10.7716 6.63723 10.7689 6.64297 10.7686 6.64836C10.7726 6.66456 10.7773 6.68132 10.7774 6.70012C10.7546 8.22785 9.56213 9.45478 8.10255 9.75578C6.802 10.0227 5.3534 9.51753 4.67189 8.41008C3.99042 7.30266 4.07003 5.91085 4.95021 4.88859ZM7.89845 4.29191C6.93297 4.0477 6.02403 4.49142 5.51857 5.33195C4.96782 6.25194 5.0583 7.47292 5.72267 8.3134C6.3076 9.05733 7.3413 9.51688 8.27834 9.19328C9.27208 8.85257 9.82348 7.81948 9.83498 6.81437H9.83693C9.79267 5.66387 9.05133 4.58162 7.89845 4.29191Z" fill="white"/>
                                <Path d="M22.1481 19V20H3.85185V19H22.1481ZM25.037 16V4C25.037 2.34315 23.7436 1 22.1481 1H3.85185C2.25636 1 0.962963 2.34315 0.962963 4V16C0.962963 17.6569 2.25636 19 3.85185 19V20L3.65343 19.9951C1.68403 19.8913 0.104628 18.2512 0.00470197 16.2061L0 16V4C0 1.79086 1.72453 1.61064e-08 3.85185 0H22.1481C24.2755 0 26 1.79086 26 4V16C26 18.14 24.3817 19.8879 22.3466 19.9951L22.1481 20V19C23.7436 19 25.037 17.6569 25.037 16Z" fill="white"/>
                                <Path d="M14.1393 6.72428L14.4528 6.10428C14.4851 6.04032 14.5507 6 14.6223 6H22.7177C22.8525 6 22.9445 6.13659 22.8937 6.26153L22.6417 6.88153C22.6126 6.95315 22.543 7 22.4657 7H14.3089C14.1673 7 14.0754 6.85066 14.1393 6.72428Z" fill="white"/>
                                <Path d="M14.1393 13.7243L14.4528 13.1043C14.4851 13.0403 14.5507 13 14.6223 13H22.7177C22.8525 13 22.9445 13.1366 22.8937 13.2615L22.6417 13.8815C22.6126 13.9532 22.543 14 22.4657 14H14.3089C14.1673 14 14.0754 13.8507 14.1393 13.7243Z" fill="white"/>
                            </Svg>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.iconButton} />
                    )}
                </View>

                {/* Scrollable Layer (Z-Index: 10) */}
                <ScrollView
                    style={{ flex: 1, zIndex: 10, marginTop: 0 }}
                    contentContainerStyle={{ flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={(event) => {
                        const offsetY = event.nativeEvent.contentOffset.y;
                        if (offsetY > 10 && !isScrolled) {
                            setIsScrolled(true);
                        } else if (offsetY <= 10 && isScrolled) {
                            setIsScrolled(false);
                        }
                    }}
                >
                    <View style={{ height: 75 }} pointerEvents="none" />
                    {/* 1. Transparent Gap with Interactive Buttons (Mirror) */}


                    {/* 2. Content Container */}
                    <View style={{ backgroundColor: 'transparent', paddingHorizontal: 20 }}>

                        {/* Trip Info Card */}
                        <View style={styles.tripCard}>
                            <LinearGradient
                                colors={['#235242', 'rgba(35, 82, 66, 0.5)']} // Dark green to semi-transparent dark green
                                style={styles.tripCardGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Text style={styles.tripTitle}>{tripData.title}</Text>
                                <View style={styles.infoRow}>
                                    <Svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <Path d="M12.3423 14.0894H4.4471C3.95455 14.0894 3.51196 14.1251 3.06223 13.8538C2.39835 13.4541 2.19134 12.7616 2.19134 12.0406V7.51483C2.19134 6.43692 1.85583 4.50952 2.86235 3.78139C3.28353 3.47444 3.78322 3.53155 4.27578 3.53155H11.1787C11.5214 3.53155 11.8854 3.50299 12.2281 3.53155C13.1989 3.61007 13.8128 4.45241 13.8414 5.37328C13.8913 6.90806 13.8414 8.44998 13.8414 9.98475C13.8414 11.2982 14.2982 14.018 12.3494 14.0965C11.6927 14.1251 11.4357 14.9674 12.2423 14.9317C13.4844 14.8818 14.6766 14.0965 14.9692 12.8402C15.0835 12.3547 15.0335 11.8051 15.0335 11.3054C15.0335 9.5493 15.0335 7.80037 15.0335 6.0443C15.0335 5.51605 15.0835 4.92356 14.9193 4.41672C14.5409 3.28884 13.4844 2.70348 12.3423 2.68921C11.0074 2.67493 9.67248 2.68921 8.33044 2.68921C6.85278 2.68921 5.36797 2.66779 3.8903 2.68921C2.93374 2.70348 2.00574 3.11752 1.45607 3.92417C1.04918 4.51666 1.00635 5.14485 1.00635 5.82301V11.0056C1.00635 11.4767 0.992068 11.9478 1.00635 12.4118C1.0349 13.6182 1.82727 14.6105 3.0194 14.8603C3.56907 14.9746 4.18298 14.9246 4.74692 14.9246H12.2352C12.8991 14.9246 13.1418 14.0894 12.3423 14.0894Z" fill="#B99A4A"/>
                                        <Path d="M14.6415 7.03516H1.85649C1.64234 7.03516 1.1712 7.11368 1.0784 7.34925C0.985597 7.58482 1.15692 7.67048 1.39249 7.67048H14.1775C14.3917 7.67048 14.8628 7.59196 14.9556 7.35639C15.0484 7.12082 14.8771 7.03516 14.6415 7.03516Z" fill="#B99A4A"/>
                                        <Path d="M10.2227 1.62662V4.73901C10.2227 4.83181 10.394 4.88178 10.4511 4.89605C10.5867 4.92461 10.758 4.91033 10.8865 4.8675C11.1007 4.80325 11.3934 4.6819 11.3934 4.42491V1.31253C11.3934 1.21973 11.222 1.16976 11.1649 1.15548C11.0293 1.12693 10.858 1.1412 10.7295 1.18403C10.5153 1.24828 10.2227 1.36964 10.2227 1.62662Z" fill="#B99A4A"/>
                                        <Path d="M4.61914 1.50301V4.6154C4.61914 4.90808 4.89754 5.06512 5.16881 5.03657C5.41151 5.01515 5.81127 4.84383 5.81127 4.53688V1.42449C5.81127 1.13181 5.53287 0.974764 5.2616 1.00332C5.01889 1.02473 4.61914 1.19606 4.61914 1.50301Z" fill="#B99A4A"/>
                                    </Svg>

                                    <Text style={styles.infoText}>{tripData.date}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <Path d="M7.98762 2.04743C9.45899 2.08102 10.8229 2.78648 11.7097 3.96223C12.5966 5.13798 12.825 6.69669 12.5899 8.1815C12.1531 10.9966 10.3526 13.0793 7.86669 14.329L8.64604 14.2215C6.25423 13.0256 4.46708 11.0705 3.896 8.3965C3.60039 6.99903 3.63398 5.51422 4.3663 4.25113C5.09863 2.98803 6.45579 2.08102 7.98091 2.04743C8.18246 2.04743 8.62589 1.97353 8.71323 1.75181C8.80057 1.5301 8.63932 1.44948 8.42433 1.4562C5.92502 1.50994 3.50632 3.00819 2.80759 5.49407C2.10886 7.97994 3.27117 11.131 5.15238 12.9719C5.83767 13.6437 6.81187 14.4432 7.75247 14.7254C8.47136 14.9471 9.57321 14.1073 10.1107 13.7311C12.3413 12.1656 13.7522 9.59912 13.7992 6.86466C13.8529 3.81442 11.4208 1.51666 8.43105 1.4562C8.03465 1.44948 7.24858 2.03399 7.99434 2.04743H7.98762Z" fill="#B99A4A"/>
                                        <Path d="M9.73656 6.78277C9.73656 7.17245 9.63579 7.53526 9.41408 7.85775C9.37376 7.9115 9.33345 7.97196 9.27971 8.02571C9.25283 8.05259 9.23267 8.07946 9.2058 8.10633C9.21252 8.09962 9.07814 8.21383 9.13861 8.1668C8.98408 8.29446 8.8833 8.3482 8.75565 8.39523C8.79596 8.3818 8.54066 8.4557 8.57425 8.44898C8.65487 8.43554 8.46675 8.46242 8.48019 8.46242C8.43316 8.46242 8.38613 8.46914 8.33238 8.47586C8.2316 8.47586 8.04348 8.4557 7.88895 8.40195C7.55302 8.30117 7.25741 8.07946 7.04241 7.804C6.58555 7.21948 6.50493 6.39309 6.87445 5.74139C6.95507 5.59358 7.04913 5.47265 7.17006 5.35843C7.27756 5.25094 7.42537 5.15688 7.53287 5.10313C7.56646 5.08969 7.60006 5.07625 7.63365 5.0561C7.52615 5.10313 7.69411 5.03594 7.70083 5.03594C7.73443 5.0225 7.77474 5.01578 7.80833 5.00907C7.71427 5.02922 7.82849 5.00907 7.85536 5.00907C8.02333 4.98891 8.15098 4.98891 8.30551 5.0225C9.11174 5.19047 9.70969 5.9631 9.72313 6.78949C9.72313 7.05152 9.99859 7.11198 10.2203 7.09183C10.4017 7.07167 10.8384 6.93058 10.8384 6.67527C10.825 5.63389 10.1934 4.76048 9.21252 4.41111C8.16442 4.04159 6.8543 4.39096 6.13541 5.2375C5.45683 6.03029 5.33589 7.13886 5.87338 8.03915C6.41086 8.93944 7.57318 9.33584 8.60113 9.141C9.79704 8.91928 10.825 7.93165 10.8451 6.67527C10.8451 6.41325 10.5697 6.35278 10.348 6.37294C10.1598 6.39309 9.73657 6.53418 9.72985 6.78949L9.73656 6.78277Z" fill="#B99A4A"/>
                                    </Svg>
                                    <Text style={styles.infoText}>{tripData.location}</Text>
                                </View>
                                <View style={styles.infoRow}>
                                    <Svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <Path d="M2.22837 14.5823C2.22837 13.5157 2.03026 12.307 3.06327 11.507C3.78496 10.9501 4.87457 11.0982 5.78022 11.0982H9.65754C10.6198 11.0982 11.6811 10.9797 12.5302 11.4478C13.9523 12.2418 13.7613 13.6046 13.7613 14.849C13.7613 15.0386 14.9216 14.8904 14.9216 14.5882C14.9216 13.3676 15.0914 12.0759 13.8179 11.2285C12.8415 10.5768 11.6316 10.6716 10.4641 10.6716H6.11984C4.8958 10.6716 3.70005 10.6182 2.60337 11.1811C1.69064 11.6493 1.11753 12.4196 1.07508 13.3143C1.04678 13.8239 1.07508 14.3335 1.07508 14.843C1.07508 15.0327 2.23545 14.8845 2.23545 14.5823H2.22837Z" fill="#B99A4A" />
                                        <Path d="M10.6562 4.8777C10.6433 6.09775 10.0162 7.35227 8.88487 7.76585C7.81818 8.15875 6.64159 7.60042 5.97572 6.69744C5.21935 5.67728 5.11591 4.1953 5.74299 3.07864C6.31836 2.05848 7.35272 1.52083 8.45173 1.81723C9.78993 2.17566 10.6433 3.53358 10.6627 4.96042C10.6627 5.32574 11.7294 5.10517 11.7229 4.65713C11.7035 3.07864 10.7079 1.72762 9.30508 1.25201C7.83111 0.748822 6.09855 1.30026 5.09652 2.54099C4.09448 3.78172 4.00397 5.47049 4.77974 6.81462C5.55552 8.15875 7.20403 8.77222 8.68446 8.44825C10.3459 8.08292 11.7035 6.59405 11.7294 4.73984C11.7294 4.25734 10.6691 4.4917 10.6691 4.8777H10.6562Z" fill="#B99A4A" />
                                    </Svg>

                                    <Text style={styles.infoText}>{tripData.participants}</Text>
                                </View>
                            </LinearGradient>
                        </View>

                        {/* Prayer Times */}
                        <View style={styles.prayerTimesContainer}>
                            <PrayerTimeItem
                                name="Fajr"
                                time={prayerTimes.Fajr}
                                icon={FajrIcon}
                                isActive={activePrayer === "Fajr"}
                            />
                            <PrayerTimeItem
                                name="Dhuhr"
                                time={prayerTimes.Dhuhr}
                                icon={DhuhrIcon}
                                isActive={activePrayer === "Dhuhr"}
                            />
                            <PrayerTimeItem
                                name="Asr"
                                time={prayerTimes.Asr}
                                icon={AsrIcon}
                                isActive={activePrayer === "Asr"}
                            />
                            <PrayerTimeItem
                                name="Maghrib"
                                time={prayerTimes.Maghrib}
                                icon={MaghribIcon}
                                isActive={activePrayer === "Maghrib"}
                            />
                            <PrayerTimeItem
                                name="Isha"
                                time={prayerTimes.Isha}
                                icon={IshaIcon}
                                isActive={activePrayer === "Isha"}
                            />
                        </View>

                        {/* Audio Channel Section */}
                        <View style={styles.sectionCard}>
                            <TouchableOpacity style={styles.channelHeader} onPress={() => navigation.navigate('VoiceChat', { trip: tripData })}>
                                {
                                    isChannelStarted ? (
                                        <View style={styles.avatarWrapper}>
                                    <Image
                                        source={{ uri: activeSpeakerData?.avatar || 'https://ui-avatars.com/api/?name=U&background=B99A4A&color=fff' }}
                                        style={styles.speakerAvatar}
                                    />
                                    {isChannelStarted && <View style={styles.liveIndicator} />}
                                </View>
                                    ) : null
                                }
                                
                                <View style={styles.channelInfo}>
                                    <Text style={styles.channelStatus}>Channel Status: <Text style={{ color: isChannelStarted ? '#34C759' : '#FF383C' }}>{isChannelStarted ? 'Live' : 'Offline'}</Text></Text>
                                    <Text style={styles.activeSpeaker}>
                                        {isChannelStarted ? (activeSpeakerData ? `Active speaker: ${activeSpeakerData.name}` : 'Ready for conversation') : 'Channel not started'}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={24} color="#fff" />
                            </TouchableOpacity>

                            {/* Audio Channel Controls */}
                            <View style={styles.controlsGrid}>
                                {(userRole === 'admin' || userRole === 'co-host' || userRole === 'manager') ? (
                                    <>
                                        <TouchableOpacity
                                            onPress={handleToggleMute}
                                            disabled={!isChannelStarted}
                                            style={[
                                                styles.controlButtonOutline,
                                                isMuted
                                                    ? { backgroundColor: '#B99A4A', borderColor: '#B99A4A' }
                                                    : { backgroundColor: '#23272A', borderColor: '#B99A4A' },
                                                !isChannelStarted && { opacity: 0.5 }
                                            ]}
                                        >
                                            <View style={{ marginRight: 8 }}>
                                                {isMuted ? (
                                                    <MicMutedIcon color="#FFF" size={20} />
                                                ) : (
                                                    <MicUnmutedIcon color="rgba(255, 255, 255, 0.5)" size={20} />
                                                )}
                                            </View>
                                            <Text style={[styles.controlText, isMuted ? { color: '#FFF', fontWeight: 'bold' } : { color: 'rgba(255, 255, 255, 0.6)' }]}>
                                                {isMuted ? 'Unmute Myself' : 'Mute Myself'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={handleToggleAllMute}
                                            disabled={!isChannelStarted}
                                            style={[
                                                styles.controlButtonOutline,
                                                isAllMuted
                                                    ? { backgroundColor: '#B99A4A', borderColor: '#B99A4A' }
                                                    : { backgroundColor: '#23272A', borderColor: '#B99A4A' },
                                                !isChannelStarted && { opacity: 0.5 }
                                            ]}
                                        >
                                            <View style={{ marginRight: 8 }}>
                                                {isAllMuted ? (
                                                    <MicMutedIcon color="#FFF" size={20} />
                                                ) : (
                                                    <MicUnmutedIcon color="rgba(255, 255, 255, 0.5)" size={20} />
                                                )}
                                            </View>
                                            <Text style={[styles.controlText, isAllMuted ? { color: '#FFF', fontWeight: 'bold' } : { color: 'rgba(255, 255, 255, 0.6)' }]}>
                                                {isAllMuted ? 'Unmute All' : 'Mute All'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                styles.controlButtonOutline,
                                                { width: '100%', marginBottom: 0, backgroundColor: isChannelStarted ? '#942F31' : '#B99A4A', borderColor: isChannelStarted ? '#942F31' : '#B99A4A' }
                                            ]}
                                            onPress={handleToggleChannel}
                                        >
                                            <Ionicons
                                                name={isChannelStarted ? "stop-circle-outline" : "play-circle-outline"}
                                                size={20}
                                                color="#FFF"
                                                style={{ marginRight: 8 }}
                                            />
                                            <Text style={[styles.controlText, { color: "#FFF" }]}>
                                                {isChannelStarted ? 'Channel Stop' : 'Start Channel'}
                                            </Text>
                                        </TouchableOpacity>

                                    </>
                                ) : (
                                    <View style={{ width: '100%', alignItems: 'center' }}>
                                        <TouchableOpacity
                                            onPress={handleToggleMute}
                                            disabled={isAllMuted}
                                            style={[
                                                styles.controlButtonOutline,
                                                { width: '100%', marginBottom: 0 },
                                                (!isMuted && !isAllMuted) && { backgroundColor: '#2D2528', borderColor: '#2D2528' },
                                                isAllMuted && { opacity: 0.5 }
                                            ]}
                                        >
                                            <View style={{ marginRight: 8 }}>
                                                {(isMuted || isAllMuted) ? (
                                                    <MicMutedIcon color="#FFF" size={20} />
                                                ) : (
                                                    <MicUnmutedIcon color="#D66A77" size={20} />
                                                )}
                                            </View>
                                            <Text style={[styles.controlText, (!isMuted && !isAllMuted) && { color: '#D66A77' }]}>
                                                {isAllMuted ? 'Muted by Organizer' : (isMuted ? 'Mute Myself' : 'Unmute Myself')}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Map and Chat Row */}
                        <View style={styles.rowContainer}>
                            <TouchableOpacity
                                style={[styles.sectionCard, styles.halfCard, { overflow: 'hidden' }]}
                                onPress={() => navigation.navigate('LiveLocation', { trip: tripData })}
                               
                            >
                                {userLocation ? (
                                    <MapView
                                        style={StyleSheet.absoluteFill}
                                        initialRegion={{
                                            latitude: userLocation.latitude,
                                            longitude: userLocation.longitude,
                                            latitudeDelta: 0.05,
                                            longitudeDelta: 0.05,
                                        }}

                                        region={{
                                            latitude: userLocation.latitude,
                                            longitude: userLocation.longitude,
                                            latitudeDelta: 0.05,
                                            longitudeDelta: 0.05,
                                        }}
                                        scrollEnabled={false}
                                        zoomEnabled={false}
                                        pitchEnabled={false}
                                        rotateEnabled={false}
                                        customMapStyle={mapStyle}
                                        showsPointsOfInterest={false}
                                        showsBuildings={false}
                                        showsTraffic={false}
                                        showsIndoors={false}
                                        showsUserLocation={false}
                                        showsMyLocationButton={false}
                                        toolbarEnabled={false}
                                    >

                                        {/* Me */}
                                        <Marker
                                            coordinate={userLocation}
                                            anchor={{ x: 0.5, y: 0.5 }}
                                            tracksViewChanges={false}
                                        >
                                            <View style={styles.mapAvatar}>
                                                {auth.currentUser?.photoURL ? (
                                                    <Image
                                                        source={{ uri: auth.currentUser.photoURL }}
                                                        style={styles.mapAvatarImg}
                                                        resizeMode="cover"
                                                    />
                                                ) : (
                                                    <View style={styles.mapInitialsContainer}>
                                                        <Text style={styles.mapInitialsText}>
                                                            {currentUserFullName?.[0]?.toUpperCase() || 'U'}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                        </Marker>

                                        {/* Nearest Participant */}
                                        {nearestParticipant && (
                                            <Marker
                                                coordinate={{ latitude: nearestParticipant.lat, longitude: nearestParticipant.lng }}
                                                anchor={{ x: 0.5, y: 0.5 }}
                                            >
                                                <View style={styles.mapAvatar}>
                                                    {nearestParticipant.profile?.image && !nearestParticipant.profile.image.includes('ui-avatars.com') ? (
                                                        <Image
                                                            source={{ uri: nearestParticipant.profile.image }}
                                                            style={styles.mapAvatarImg}
                                                            resizeMode="cover"
                                                        />
                                                    ) : (
                                                        <View style={styles.mapInitialsContainer}>
                                                            <Text style={styles.mapInitialsText}>
                                                                {nearestParticipant.profile?.name?.[0]?.toUpperCase() || 'U'}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </Marker>
                                        )}


                                    </MapView>
                                ) : (
                                    <ImageBackground
                                        source={{ uri: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?q=80&w=2000&auto=format&fit=crop' }}
                                        style={styles.mapBackground}
                                        imageStyle={{ opacity: 0.6 }}
                                    >
                                        <View style={styles.mapOverlay} />
                                        <View style={[styles.mapAvatar, { top: '35%', alignSelf: 'center' }]}>
                                            <Ionicons name="location-outline" size={22} color="#B99A4A" />
                                        </View>
                                    </ImageBackground>
                                )}
                            </TouchableOpacity>



                            <TouchableOpacity
                                style={[styles.sectionCard, styles.halfCard, { backgroundColor: '#23272A', }]}
                                onPress={() => navigation.navigate('TripChat', { trip: tripData })}
                            >
                                <View style={styles.chatIconWrapper}>
                                    <View style={styles.chatIconCircle}>
                                        <Ionicons name="chatbubble-ellipses-outline" size={25} color="#B99A4A" />
                                    </View>
                                    {unreadCount > 0 && (
                                        <View style={styles.badge}>
                                            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                                        </View>
                                    )}
                                </View>
                                <View style={{ marginTop: 'auto', paddingBottom: 10 }}>
                                    <Text style={styles.chatTitle}>{tripData.title}</Text>
                                    <Text style={styles.chatPreview} numberOfLines={1}>
                                        {lastChatMessage
                                            ? (lastChatMessage.text ? lastChatMessage.text :
                                                lastChatMessage.type === 'image' ? '📷 Image' :
                                                    lastChatMessage.type === 'location' ? '📍 Location' :
                                                        lastChatMessage.type === 'voice' ? '🎤 Voice' : lastChatMessage.type)
                                            : "No messages yet"}
                                    </Text>
                                </View>

                            </TouchableOpacity>
                        </View>

                        {/* Notifications Section */}
                        <View style={styles.sectionCard}>
                            <Text style={styles.notificationTitle}>Notification</Text>
                            <View style={styles.notificationListContainer}>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled={true}
                                    contentContainerStyle={{ flexGrow: 1 }}
                                >
                                    {notificationsList
                                        .map((item, index, filteredList) => (
                                            <View key={item.id}>
                                                <View style={styles.notificationItem}>
                                                    <View style={styles.notificationContent}>
                                                        <Text style={styles.notifName}>
                                                            {item.name} <Text style={[styles.notifMsg, item.type === 'emergency' && { color: '#FF4B4B', fontWeight: 'bold' }]}>{item.message}</Text>
                                                        </Text>
                                                    </View>

                                                    {item.type !== 'alert' && item.type !== 'emergency' && item.type !== 'broadcast' && (
                                                        <TouchableOpacity
                                                            style={[styles.acceptButton, item.status === 'accepted' && { backgroundColor: '#A1A1AA' }, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
                                                            onPress={() => handleAcceptNotification(item)}
                                                            disabled={item.status === 'accepted'}
                                                        >
                                                            <Svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 8 }}>
                                                                <Path d="M7.99967 14.6667C11.6816 14.6667 14.6663 11.6819 14.6663 8.00004C14.6663 4.31814 11.6816 1.33337 7.99967 1.33337C4.31778 1.33337 1.33301 4.31814 1.33301 8.00004C1.33301 11.6819 4.31778 14.6667 7.99967 14.6667Z" stroke="white" strokeWidth="1.5"/>
                                                                <Path d="M5.66602 8.33337L6.99935 9.66671L10.3327 6.33337" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                            </Svg>

                                                            <Text style={styles.acceptButtonText}>
                                                                {item.status === 'accepted' ? 'Accepted' : 'Accept'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                                {index < filteredList.length - 1 && <View style={styles.notificationSeparator} />}
                                            </View>
                                        ))}
                                </ScrollView>
                            </View>
                        </View>



                        {/* Participants List */}
                        <View
                            style={styles.sectionCard}
                        >
                            <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => navigation.navigate('TripParticipants', { isAdmin, trip: tripData })}>
                                <Text style={styles.sectionTitle}>Participants</Text>
                                <View style={styles.searchBar}>
                                    <Ionicons name="search" size={24} color="#A1A1AA" />
                                </View>
                                <View >
                                    <Ionicons name="chevron-forward" size={20} color="#fff" />
                                </View>
                            </TouchableOpacity>

                            <View style={styles.participantsScrollContainer}>
                                <ScrollView
                                    showsVerticalScrollIndicator={false}
                                    nestedScrollEnabled={true}
                                >
                                    {participants.length > 0 ? (
                                        participants.map((p, idx) => (
                                            <TouchableOpacity
                                                key={idx}
                                                style={styles.participantRow}
                                                onPress={() => handleParticipantPress(p)}
                                            >
                                                <View style={[
                                                    styles.participantAvatarContainer,
                                                    p.isSpeaking && styles.speakingAvatarBorder
                                                ]}>
                                                    <Image source={{ uri: p.image }} style={styles.participantAvatar} />
                                                </View>
                                                <View style={styles.participantInfo}>
                                                    <Text style={styles.participantName}>
                                                        {p.name} {p.id === auth.currentUser?.uid ? '(You)' : ''}
                                                    </Text>
                                                    <Text style={[
                                                        styles.participantStatus,
                                                        p.voiceStatus === 'Speaking' && styles.statusSpeaking,
                                                        p.voiceStatus === 'Active' && styles.statusActive,
                                                        p.voiceStatus === 'Muted' && styles.statusMuted,
                                                    ]}>
                                                        {p.voiceStatus ? p.voiceStatus : p.status}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))
                                    ) : (
                                        <View style={{ padding: 20, alignItems: 'center' }}>
                                            <Text style={{ color: '#A1A1AA', fontSize: 14 }}>No participants joined yet</Text>
                                        </View>
                                    )}
                                </ScrollView>
                            </View>

                        </View>

                        {/* Quick Messages & Alert Row - Hide Quick Messages for Participants */}
                        <View style={styles.rowContainer}>
                            {(userRole === 'admin' || userRole === 'co-host' || userRole === 'manager') && (
                                <View style={[styles.sectionCard, styles.halfCard, styles.quickMsgCard]}>
                                    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                                        {sharedTemplates.length > 0 ? (
                                            sharedTemplates.map((template, index) => (
                                                <TouchableOpacity
                                                    key={template.id}
                                                    style={styles.quickMsgItem}
                                                    onPress={() => handleQuickMsgPress(template)}
                                                >
                                                    <Text style={styles.quickMsgText} numberOfLines={1}>{template.name}</Text>
                                                </TouchableOpacity>
                                            ))
                                        ) : (
                                            <Text style={[styles.quickMsgText, { opacity: 0.5, fontSize: 12 }]}>No templates. Add in Chat.</Text>
                                        )}
                                    </ScrollView>
                                </View>
                            )}


                            <TouchableOpacity
                                style={[styles.sectionCard, styles.halfCard, styles.alertCard, !isAdmin && { flex: 1 }]}
                                onPress={() => {
                                    navigation.navigate('AlertHistory', {
                                        alerts: notificationsList.filter(n => n.type === 'alert' || n.type === 'emergency')
                                    });
                                }}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
                                    <View style={styles.alertIconContainer}>
                                        <Ionicons name="information-circle-outline" size={24} color="#FDF3DC" />
                                    </View>
                                    <View style={{ padding: 5 }}>
                                        <Ionicons name="chevron-forward" size={24} color="#FFF" />
                                    </View>
                                </View>
                                <View style={styles.alertContent}>
                                    <Text style={styles.alertTitle}>{lastAlertSender}</Text>
                                </View>
                            </TouchableOpacity>
                        </View>

                        <View style={{ height: 150 }} />
                    </View>
                </ScrollView>

                {/* Bottom Trip Navigation (Reusable) */}
                <TripBottomTabBar activeRoute="TripOverview" tripData={tripData} />
            </SafeAreaView>

            {/* Emergency Alert Modal */}
            <Modal
                isVisible={emergencyModalVisible}
                onBackdropPress={() => setEmergencyModalVisible(false)}
                onSwipeComplete={() => setEmergencyModalVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.4}
                style={{ margin: 0, justifyContent: 'center', alignItems: 'center' }}
                animationIn="fadeIn"
                animationOut="fadeOut"
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <View
                    style={[
                        styles.emergencyContent,
                        // { transform: [{ translateY: panYEmergency }] }
                    ]}
                // {...emergencySwipe.panHandlers}
                >
                    <View style={styles.modalHandle} />
                    <Text style={styles.emergencyTitle}>Notifying Host</Text>
                    <Text style={styles.emergencySubtitle}>Emergency alert will be sent in</Text>
                    <Text style={styles.countdownText}>{countdown} <Text style={{ color: '#942F31', fontSize: responsiveFontSize(31) }}>seconds</Text></Text>

                    <GradientBorderButton
                        onPress={() => setEmergencyModalVisible(false)}
                        style={{ borderRadius: 30, width: '100%', marginTop: 10 }}
                        innerBg="transparent"
                    >
                        <Text style={{
                            color: '#FFF',
                            fontSize: responsiveFontSize(14),
                            fontFamily: Typography.sans.bold
                        }}>
                            Cancel
                        </Text>
                    </GradientBorderButton>
                </View>
            </Modal>

            <ParticipantDetailModal
                isVisible={detailVisible}
                onClose={() => setDetailVisible(false)}
                participant={selectedParticipant}
                liveLocations={liveLocations}
                isAdmin={isAdmin}
                onDelete={handleDeletePress}
                mapDarkStyle={mapDarkStyle}
                isDecrypting={isDecrypting}
                tripId={tripId}
            />

            {/* Delete Confirmation Modal */}
            <Modal
                isVisible={deleteConfirmVisible}
                onBackdropPress={() => setDeleteConfirmVisible(false)}
                onSwipeComplete={() => setDeleteConfirmVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.7}
                style={{ margin: 0, justifyContent: 'center', paddingHorizontal: 24 }}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <View
                    style={[
                        styles.confirmBox,
                        // { transform: [{ translateY: panYDelete }] }
                    ]}
                // {...deleteConfirmSwipe.panHandlers}
                >
                    <View style={styles.modalHandle} />
                    <Text style={styles.confirmTitle}>Are You sure you want to delete this participant</Text>

                    <View style={styles.confirmButtons}>
                        <GradientBorderButton
                            text="Cancel"
                            onPress={() => setDeleteConfirmVisible(false)}
                            style={{ flex: 1 }}
                            innerBg="#1E2124"
                        />
                        <TouchableOpacity
                            style={styles.confirmDeleteBtn}
                            onPress={confirmDelete}
                        >
                            <Text style={styles.confirmDeleteText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Trip Visibility Modal */}
            <Modal
                isVisible={visibilityModalVisible}
                onBackdropPress={() => setVisibilityModalVisible(false)}
                onSwipeComplete={() => setVisibilityModalVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.7}
                style={{ margin: 0, justifyContent: 'flex-end' }}
            >
                <View style={styles.bottomSheet}>
                    <View style={styles.handle} />
                    <Text style={styles.sheetTitle}>Trip Visibility</Text>
                    <View style={styles.divider} />

                    <TouchableOpacity
                        style={[styles.visibilityOption, liveTripData?.visibility !== 'private' && styles.visibilityOptionSelected]}
                        onPress={() => {
                            const tripId = trip?.id;
                            const orgId = trip?.orgId;
                            if (tripId && orgId) {
                                update(ref(database, `orgs/${orgId}/trips/${tripId}`), { visibility: 'public' });
                            }
                            setVisibilityModalVisible(false);
                        }}
                    >
                        <Ionicons name="earth-outline" size={24} color="#FFF" />
                        <View style={{ marginLeft: 16 }}>
                            <Text style={styles.visibilityTitle}>Public</Text>
                            <Text style={styles.visibilityDesc}>Visible to everyone in the Explore section.</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.visibilityOption, liveTripData?.visibility === 'private' && styles.visibilityOptionSelected]}
                        onPress={() => {
                            const tripId = trip?.id;
                            const orgId = trip?.orgId;
                            if (tripId && orgId) {
                                update(ref(database, `orgs/${orgId}/trips/${tripId}`), { visibility: 'private' });
                            }
                            setVisibilityModalVisible(false);
                        }}
                    >
                        <Ionicons name="lock-closed-outline" size={24} color="#FFF" />
                        <View style={{ marginLeft: 16 }}>
                            <Text style={styles.visibilityTitle}>Private (Invite Only)</Text>
                            <Text style={styles.visibilityDesc}>Only people with the link or code can join.</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Trip Delete Modal */}
            <Modal
                isVisible={deleteModalVisible}
                onBackdropPress={() => setDeleteModalVisible(false)}
                onSwipeComplete={() => setDeleteModalVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.8}
                style={{ margin: 0, justifyContent: 'center', paddingHorizontal: 24 }}
            >
                <View style={styles.confirmBox}>
                    <View style={styles.modalHandle} />
                    <Ionicons name="warning-outline" size={48} color="#942F31" style={{ marginBottom: 16 }} />
                    <Text style={styles.confirmTitle}>Delete this journey?</Text>
                    <Text style={[styles.confirmTitle, { fontSize: 14, fontFamily: Typography.sans.regular, opacity: 0.7 }]}>
                        This action cannot be undone. All participant data will be lost.
                    </Text>

                    <View style={styles.confirmButtons}>
                        <GradientBorderButton
                            text="Cancel"
                            onPress={() => setDeleteModalVisible(false)}
                            style={{ flex: 1 }}
                            innerBg="#1E2124"
                        />
                        <TouchableOpacity
                            style={styles.confirmDeleteBtn}
                            onPress={async () => {
                                setDeleteModalVisible(false);
                                try {
                                    const { functions } = require('../../config/firebase');
                                    const { httpsCallable } = require('firebase/functions');
                                    const deleteTrip = httpsCallable(functions, 'deleteTrip');

                                    await deleteTrip({ tripId });

                                    Alert.alert("Success", "Journey has been successfully deleted.", [
                                        {
                                            text: "OK",
                                            onPress: () => {
                                                navigation.navigate('Home');
                                            }
                                        }
                                    ]);
                                } catch (error) {
                                    console.error("Delete Trip Error:", error);
                                    Alert.alert("Error", "Failed to delete the journey. " + error.message);
                                }
                            }}
                        >
                            <Text style={styles.confirmDeleteText}>Delete Forever</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Quick Message Alert Modal */}
            <Modal
                isVisible={quickAlertVisible}
                onBackdropPress={() => setQuickAlertVisible(false)}
                onSwipeComplete={() => setQuickAlertVisible(false)}
                swipeDirection="down"
                backdropOpacity={0.8}
                style={{ margin: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}
                useNativeDriver={true}
                hideModalContentWhileAnimating={true}
            >
                <View
                    style={[
                        styles.quickAlertBox,
                    ]}
                >
                    <View style={styles.modalHandle} />
                    <View style={styles.quickAlertHeader}>
                        <View style={styles.alertIconCircleSmall}>
                            <Ionicons name="information" size={20} color="#FF4B4B" />
                        </View>
                        <Text style={styles.quickAlertTitle}>{alertTitle || 'Alert!'}</Text>
                    </View>

                    <Text style={styles.quickAlertMsg}>{alertMessage}</Text>

                    <View style={styles.confirmButtons}>
                        <GradientBorderButton
                            text="Cancel"
                            onPress={() => setQuickAlertVisible(false)}
                            style={{ flex: 1 }}
                            innerBg="#1E2124"
                        />
                        <TouchableOpacity
                            style={[styles.confirmDeleteBtn, { backgroundColor: '#B99A4A' }]}
                            onPress={() => broadcastNotification(alertMessage, alertTitle)}
                        >
                            <Text style={styles.confirmDeleteText}>Send All</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    backgroundImage: {
        flex: 1,
        width: width,
    },
    gradientOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 50,
    },
    headerTitle: {
        fontSize: responsiveFontSize(20),
        color: '#FFF',
        fontFamily: Typography.sans.regular,
    },
    iconButton: {
        padding: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    tripCard: {
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 20,
        height: 150,
    },
    tripCardGradient: {
        flex: 1,
        padding: 20,
        justifyContent: 'center',
    },
    tripTitle: {
        fontSize: responsiveFontSize(22),
        color: '#FFF',
        fontFamily: Typography.sans.bold,
        marginBottom: 12,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 10,
    },
    infoText: {
        color: '#F4F4F5',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
    },
    chatIconWrapper: {
        position: 'relative',
        width: 64,
        height: 64,
        marginBottom: 5
    },
    chatIconCircle: {
        width: 54,
        height: 54,
        borderRadius: 32,
        backgroundColor: '#2D3134',
        justifyContent: 'center',
        alignItems: 'center',
    },
    badge: {
        position: 'absolute',
        bottom: 10,
        right: 10,
        backgroundColor: '#B99A4A',
        width: 18,
        height: 18,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: responsiveFontSize(10),
        fontFamily: Typography.sans.bold,
    },
    chatTitle: {
        color: '#FFFFFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.bold,
        marginBottom: 8,
    },
    chatPreview: {
        color: '#71717A',
        fontSize: responsiveFontSize(14),
        fontFamily: Typography.sans.regular,
        lineHeight: 20,
    },
    prayerTimesContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 25,
        paddingHorizontal: 10,
    },
    prayerItem: {
        alignItems: 'center',
    },
    prayerName: {
        color: '#A1A1AA',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
        lineHeight: 20,
        letterSpacing: 0.2
    },
    prayerTime: {
        color: '#A1A1AA',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
        lineHeight: 20,
        letterSpacing: 0.2
    },
    sectionCard: {
        backgroundColor: '#2D3134',
        borderRadius: 24,
        padding: 20,
        marginVertical: 6,
        // borderWidth: 1,
        // borderColor: 'rgba(255,255,255,0.05)',
    },
    notificationTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(22),
        fontFamily: Typography.sans.bold,
        marginBottom: 10,
    },
    notificationListContainer: {
        maxHeight: 280,
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
    },
    notificationContent: {
        flex: 1,
        marginRight: 10,
    },
    notifName: {
        color: '#FFF',
        fontSize: responsiveFontSize(15),
        fontFamily: Typography.sans.bold
    },
    notifMsg: {
        color: '#fff',
        fontFamily: Typography.sans.regular,
    },
    acceptButton: {
        backgroundColor: '#34C759',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        minWidth: 130,
    },
    acceptButtonText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        letterSpacing: 0.2,
        fontFamily: Typography.sans.bold,
    },
    notificationSeparator: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    channelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        backgroundColor: '#23272A',
        padding: 10,
        borderRadius: 20,
    },
    avatarWrapper: {
        position: 'relative',
    },
    speakerAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        borderWidth: 2,
        borderColor: '#34C759',
        elevation: 14,
        shadowColor: '#34C759',
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowOpacity: 0.8,
        shadowRadius: 10
    },
    liveIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,

        backgroundColor: '#34C759',
        position: 'absolute',
        bottom: 2,
        right: 2,
        borderWidth: 2,
        borderColor: '#1E2023',
    },
    channelInfo: {
        flex: 1,
        marginLeft: 12,
    },
    channelStatus: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
    },
    activeSpeaker: {
        color: '#9BA1A6',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular,
    },
    controlsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
        backgroundColor: '#23272A',
        padding: 10,
        borderRadius: 20,
    },
    controlButtonOutline: {
        width: '48%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 30, // Pill shape
        borderWidth: 1,
        borderColor: '#B99A4A',
        marginBottom: 10,
    },
    controlText: {
        color: '#FFF',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.medium,
    },
    rowContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    halfCard: {
        flex: 1,
        height: 180, // Taller to fit content
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: responsiveFontSize(20),
        color: '#FFF',
        fontFamily: Typography.sans.semiBold,
        flex: 1,
    },
    searchBar: {
        width: "45%",
        height: 40,
        backgroundColor: '#3F4346',
        borderRadius: 15,
        justifyContent: 'center',
        paddingHorizontal: 10,
        marginRight: 10,
    },
    participantRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    participantsScrollContainer: {
        maxHeight: 210,
    },
    participantAvatarContainer: {
        marginRight: 12,
        borderRadius: 24,
         // For border space
    },
    speakingAvatarBorder: {
        borderWidth: 2,
        borderColor: '#34C759',
        // shadowColor: '#34C759',
        // shadowOpacity: 0.5,
        borderRadius: 50,
        shadowRadius: 5,
    },
    participantAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#ccc',
    },
    participantInfo: {
        flex: 1,
    },
    participantName: {
        fontSize: responsiveFontSize(16),
        color: '#FFF',
        fontFamily: Typography.sans.semiBold,
        letterSpacing: 0.2,
    },
    participantStatus: {
        fontSize: responsiveFontSize(13),
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
    },
    participantStatusMuted: {
        fontSize: responsiveFontSize(13),
        color: '#A1A1AA',
        fontFamily: Typography.sans.regular,
    },
    statusSpeaking: {
        color: '#34C759',
        fontWeight: 'bold',
    },
    statusActive: {
        color: '#B99A4A',
    },
    statusMuted: {
        color: '#D66A77',
    },
    quickMsgCard: {
        backgroundColor: '#2D3134',
        padding: 10,
         // Fixed height to match chat card
    },
    quickMsgItem: {
        backgroundColor: '#23272A',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
    },
    quickMsgText: {
        color: '#E0E0E0',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
    },
    alertCard: {
        backgroundColor: '#2D2528', // Dark reddish tint background
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        padding: 20,
    },
    alertIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#D92D20', // Red alert color
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        alignSelf: 'flex-start',
    },
    alertContent: {
        width: '100%',
    },
    alertTitle: {
        fontSize: responsiveFontSize(18),
        color: '#FFF',
        fontFamily: Typography.sans.bold,
    },
    mapBackground: {
        flex: 1,
        width: '100%',
        height: '100%',
        backgroundColor: '#1A1E21',
    },
    mapOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    mapAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,

        borderWidth: 2,
        borderColor: '#B99A4A',
        overflow: 'hidden',
        backgroundColor: '#1E2124',
        justifyContent: 'center',
        alignItems: 'center',

        shadowColor: '#B99A4A',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 10,
    },
    mapAvatarImg: {
        width: '100%',
        height: '100%',
        borderRadius: 25,
    },
    mapInitialsContainer: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#B99A4A',
    },
    mapInitialsText: {
        color: '#FFF',
        fontSize: 20,
        fontFamily: Typography.sans.bold,
    },


    mapAvatarLiveDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#34C759',
        borderWidth: 2,
        borderColor: '#1A1E21',
    },
    // Modal Styles

    bottomSheet: {
        backgroundColor: '#1E2124',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 12,
        width: '100%',
        marginTop: 'auto', // Push to bottom
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
    modalOverlayFull: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
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
    confirmOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    confirmBox: {
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 30,
        width: '100%',
        alignItems: 'center',
    },
    confirmTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
        textAlign: 'center',
        marginBottom: 30,
    },
    confirmButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    confirmDeleteBtn: {
        flex: 1,
        height: 56,
        backgroundColor: '#942F31',
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmDeleteText: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    // Quick Alert Styles
    quickAlertOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    quickAlertBox: {
        backgroundColor: '#1E2124',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        alignItems: 'center',
    },
    quickAlertHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 10,
    },
    alertIconCircleSmall: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#FF4B4B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickAlertTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(20),
        fontFamily: Typography.sans.bold,
    },
    quickAlertMsg: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.semiBold,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 26,
    },
    quickAlertBtn: {
        width: '100%',
    },
    quickAlertGradient: {
        borderRadius: 28,
        padding: 1.5,
    },
    quickAlertInner: {
        backgroundColor: '#1E2124',
        borderRadius: 26.5,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickAlertBtnText: {
        color: '#FFF',
        fontSize: responsiveFontSize(18),
        fontFamily: Typography.sans.bold,
    },
    // Emergency Modal Styles
    emergencyOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    emergencyContent: {
        backgroundColor: '#23272A',
        borderRadius: 24,
        padding: 30,
        width: '100%',
        alignItems: 'center',
    },
    emergencyTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.semiBold,
        marginBottom: 15,
    },
    emergencySubtitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(13),
        fontFamily: Typography.sans.regular
    },
    countdownText: {
        color: '#942F31',
        fontSize: responsiveFontSize(31),
        fontFamily: Typography.sans.bold,
        marginBottom: 10,
    },
    modalHandle: {
        width: 60,
        height: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
    visibilityOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderRadius: 16,
        backgroundColor: '#23272A',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    visibilityOptionSelected: {
        borderColor: '#B99A4A',
        backgroundColor: '#2D3134',
    },
    visibilityTitle: {
        color: '#FFF',
        fontSize: responsiveFontSize(16),
        fontFamily: Typography.sans.bold,
    },
    visibilityDesc: {
        color: '#A1A1AA',
        fontSize: responsiveFontSize(12),
        fontFamily: Typography.sans.regular,
        marginTop: 4,
    },
});

const mapDarkStyle = [
    {
        "elementType": "geometry",
        "stylers": [{ "color": "#212121" }]
    },
    {
        "elementType": "labels.icon",
        "stylers": [{ "visibility": "off" }]
    },
    {
        "elementType": "labels.text.fill",
        "stylers": [{ "color": "#757575" }]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [{ "color": "#1A1E21" }]
    },
    {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [{ "color": "#1E2124" }]
    },
    {
        "featureType": "road",
        "elementType": "geometry.fill",
        "stylers": [{ "color": "#2C2F33" }]
    },
    {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [{ "color": "#000000" }]
    }
];

export default TripOverviewScreen;
