import React, { useEffect, useRef } from 'react';
import {
    TouchableOpacity,
    StyleSheet,
    Animated,
    View,
    Text,
} from 'react-native';

const CustomSwitch = ({ value, onValueChange, activeColor = '#B99A4A', inactiveColor = '#A1A1AA' }) => {
    const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(animatedValue, {
            toValue: value ? 1 : 0,
            duration: 250,
            useNativeDriver: false,
        }).start();
    }, [value]);

    const translateX = animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [2, 21], // Adjusted for 55px width track and 32px thumb
    });

    const backgroundColor = animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [inactiveColor, activeColor],
    });

    const onOpacity = animatedValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0, 1],
    });

    const offOpacity = animatedValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 0, 0],
    });

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onValueChange(!value)}
        >
            <Animated.View style={[styles.container, { backgroundColor }]}>
                <View style={styles.innerContainer}>
                    <Animated.Text style={[styles.indicator, styles.onIndicator, { opacity: onOpacity }]}>I</Animated.Text>
                    <Animated.Text style={[styles.indicator, styles.offIndicator, { opacity: offOpacity }]}>I</Animated.Text>
                    <Animated.View
                        style={[
                            styles.thumb,
                            {
                                transform: [{ translateX }],
                            },
                        ]}
                    />
                </View>
            </Animated.View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 55,
        height: 24,
        borderRadius: 14,
        justifyContent: 'center',
    },
    innerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: '100%',
    },
    thumb: {
        width: 32,
        height: 21,
        borderRadius: 12,
        backgroundColor: '#FFF',
        position: 'absolute',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1.5,
    },
    indicator: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
        position: 'absolute',
    },
    onIndicator: {
        left: 10,
    },
    offIndicator: {
        right: 12,
    },
});

export default CustomSwitch;
