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

const GradientBorderButton = ({ text, onPress, style, innerBg = '#1A1E21', children, innerStyle, disabled, borderRadius = 30, colors = ['#B99A4A', 'rgba(185, 154, 74, 0.44)'] }) => {
    const [isActive, setIsActive] = useState(false);
    const [layout, setLayout] = useState({ width: 0, height: 0 });
    const gradId = React.useMemo(() => `grad-${Math.random().toString(36).substr(2, 9)}`, []);

    const activeColor = '#B99A4A';
    const isTransparent = innerBg === 'transparent';

    const onLayout = (event) => {
        if (!isTransparent) return;
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            setLayout(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
        }
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
                <View style={[styles.buttonInner, { borderRadius: borderRadius - 1.5, backgroundColor: isActive && !disabled ? activeColor : 'transparent' }, innerStyle]}>
                    <Svg width={layout.width} height={layout.height} style={StyleSheet.absoluteFill}>
                        <Defs>
                            <SvgGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                                {colors.map((color, index) => (
                                    <Stop
                                        key={index}
                                        offset={`${(index / (colors.length - 1)) * 100}%`}
                                        stopColor={color}
                                    />
                                ))}
                            </SvgGradient>
                        </Defs>
                        {layout.width > 0 && (
                            <Rect
                                x="1"
                                y="1"
                                width={layout.width - 2}
                                height={layout.height - 2}
                                rx={borderRadius}
                                ry={borderRadius}
                                stroke={`url(#${gradId})`}
                                strokeWidth="2"
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
                    colors={colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.gradientBorder, { borderRadius }]}
                >
                    <View style={[
                        styles.buttonInner,
                        { borderRadius: borderRadius - 1.5 },
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
        letterSpacing: 0.2,
        fontFamily: Typography.sans.semiBold,
    },
});

export default GradientBorderButton;
