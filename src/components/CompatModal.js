/**
 * CompatModal — Drop-in replacement for react-native-modal@13 which is
 * incompatible with Expo SDK 56 / React Native 0.79.
 *
 * Accepts the same props as react-native-modal so no call-sites need to change:
 *   isVisible, onBackdropPress, onSwipeComplete, backdropOpacity, style,
 *   animationIn, animationOut, avoidKeyboard, children, etc.
 */
import React, { useEffect, useRef } from 'react';
import {
    Modal,
    View,
    Pressable,
    StyleSheet,
    Animated,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';

const FADE_DURATION = 200;

export default function CompatModal({
    isVisible = false,
    onBackdropPress,
    onSwipeComplete,
    backdropOpacity = 0.5,
    style,
    animationIn,
    animationOut,
    avoidKeyboard = false,
    children,
    // ignored props — kept for API compatibility
    useNativeDriver: _und,
    hideModalContentWhileAnimating: _hwma,
    swipeDirection: _sd,
    backdropTransitionInTiming: _btit,
    backdropTransitionOutTiming: _btot,
    animationInTiming: _ait,
    animationOutTiming: _aot,
    propagateSwipe: _ps,
    scrollTo: _st,
    scrollOffset: _so,
    scrollOffsetMax: _som,
    ...rest
}) {
    const backdropAnim = useRef(new Animated.Value(0)).current;
    const contentAnim = useRef(new Animated.Value(0)).current;

    const animType = animationIn || 'fadeIn';
    const isZoom = animType.toLowerCase().includes('zoom');
    const isSlide = animType.toLowerCase().includes('slide');

    const contentTranslateY = contentAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [60, 0],
    });
    const contentScale = contentAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.85, 1],
    });

    useEffect(() => {
        if (isVisible) {
            Animated.parallel([
                Animated.timing(backdropAnim, { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
                Animated.timing(contentAnim, { toValue: 1, duration: FADE_DURATION, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(backdropAnim, { toValue: 0, duration: FADE_DURATION, useNativeDriver: true }),
                Animated.timing(contentAnim, { toValue: 0, duration: FADE_DURATION, useNativeDriver: true }),
            ]).start();
        }
    }, [isVisible]);

    const handleBackdropPress = () => {
        if (onSwipeComplete) onSwipeComplete();
        if (onBackdropPress) onBackdropPress();
    };

    const contentTransform = isZoom
        ? [{ scale: contentScale }]
        : isSlide
        ? [{ translateY: contentTranslateY }]
        : [];

    const inner = (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Animated.View
                style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: `rgba(0,0,0,${backdropOpacity})`, opacity: backdropAnim },
                ]}
            >
                <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />
            </Animated.View>
            <Animated.View
                style={[
                    styles.contentWrapper,
                    style,
                    { opacity: contentAnim, transform: contentTransform },
                ]}
                pointerEvents="box-none"
            >
                {avoidKeyboard ? (
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ width: '100%' }}
                        pointerEvents="box-none"
                    >
                        {children}
                    </KeyboardAvoidingView>
                ) : (
                    children
                )}
            </Animated.View>
        </View>
    );

    return (
        <Modal
            visible={isVisible}
            transparent
            animationType="none"
            onRequestClose={handleBackdropPress}
            statusBarTranslucent
            {...rest}
        >
            {inner}
        </Modal>
    );
}

const styles = StyleSheet.create({
    contentWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
    },
});
