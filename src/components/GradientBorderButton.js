import React, { useState } from 'react';
import {
    Pressable,
    Text,
    StyleSheet,
    View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const GradientBorderButton = ({ text, onPress, style, innerBg = '#1A1E21', children, innerStyle, disabled }) => {
    const [isActive, setIsActive] = useState(false);

    const activeColor = '#B99A4A';

    return (
        <Pressable
            style={[styles.gradientButtonWrapper, style, disabled && { opacity: 0.5 }]}
            onPress={disabled ? null : onPress}
            onPressIn={() => !disabled && setIsActive(true)}
            onPressOut={() => setIsActive(false)}
            disabled={disabled}
        >
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
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    gradientButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default GradientBorderButton;
