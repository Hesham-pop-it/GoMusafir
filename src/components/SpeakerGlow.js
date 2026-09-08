import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated } from 'react-native';

const SpeakerGlow = ({ size = 50, color = '#34C759', style }) => {
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(0.65)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.parallel([
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.35,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    })
                ]),
                Animated.sequence([
                    Animated.timing(opacityAnim, {
                        toValue: 0.15,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                    Animated.timing(opacityAnim, {
                        toValue: 0.65,
                        duration: 400,
                        useNativeDriver: true,
                    })
                ])
            ])
        );
        animation.start();

        return () => animation.stop();
    }, [pulseAnim, opacityAnim]);

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.glowCircle,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                    transform: [{ scale: pulseAnim }],
                    opacity: opacityAnim,
                },
                style
            ]}
        />
    );
};

const styles = StyleSheet.create({
    glowCircle: {
        position: 'absolute',
        zIndex: 0,
    }
});

export default SpeakerGlow;
