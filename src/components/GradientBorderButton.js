import React, { useState } from 'react';
import {
    Pressable,
    Text,
    StyleSheet,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { Typography } from '../constants/Typography';

const GradientBorderButton = ({ text, onPress, style, innerBg = '#1A1E21', children, innerStyle, disabled }) => {
    const [isActive, setIsActive] = useState(false);
    const [layout, setLayout] = useState({ width: 0, height: 0 });

    const activeColor = '#B99A4A';
    const isTransparent = innerBg === 'transparent';

    const onLayout = (event) => {
        const { width, height } = event.nativeEvent.layout;
        setLayout({ width, height });
    };

    return (
        <Pressable
            style={[styles.gradientButtonWrapper, style, disabled && { opacity: 0.5 }]}
            onPress={disabled ? null : onPress}
            onPressIn={() => !disabled && setIsActive(true)}
            onPressOut={() => setIsActive(false)}
            disabled={disabled}
            onLayout={onLayout}
        >
            {isTransparent ? (
                <View style={[styles.buttonInner, { backgroundColor: isActive && !disabled ? activeColor : 'transparent' }, innerStyle]}>
                    <Svg style={StyleSheet.absoluteFill}>
                        <Defs>
                            <SvgGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <Stop offset="0%" stopColor="#B99A4A" />
                                <Stop offset="100%" stopColor="rgba(50, 53, 55, 0.6)" />
                            </SvgGradient>
                        </Defs>
                        {layout.width > 0 && (
                            <Rect
                                x="0.75"
                                y="0.75"
                                width={layout.width - 1.5}
                                height={layout.height - 1.5}
                                rx={30}
                                ry={30}
                                stroke="url(#grad)"
                                strokeWidth="1.5"
                                fill="transparent"
                            />
                        )}
                    </Svg>
                    {children ? children : (
                        <Text style={styles.gradientButtonText}>{text}</Text>
                    )}
                </View>
            ) : (
                <LinearGradient
                    colors={['#B99A4A', 'rgba(50, 53, 55, 0.6)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.gradientBorder}
                >
                    <View style={[
                        styles.buttonInner,
                        { backgroundColor: isActive && !disabled ? activeColor : innerBg },
                        innerStyle
                    ]}>
                        {children ? children : (
                            <Text style={styles.gradientButtonText}>{text}</Text>
                        )}
                    </View>
                </LinearGradient>
            )}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    gradientButtonWrapper: {
        width: '100%',
    },
    gradientBorder: {
        borderRadius: 30,
        padding: 1.5,
        width: '100%',
    },
    buttonInner: {
        borderRadius: 28.5,
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    gradientButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontFamily: Typography.sans.bold,
    },
});

export default GradientBorderButton;
