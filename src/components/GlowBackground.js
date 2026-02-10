import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

import { Colors } from '../constants/Colors';

const { width, height } = Dimensions.get('window');

const GlowBackground = ({ children }) => {
    return (
        <View style={styles.container}>
            <View style={styles.glowContainer}>
                <Svg height={height} width={width} style={StyleSheet.absoluteFill}>
                    <Defs>
                        <RadialGradient
                            id="grad"
                            cx="0"
                            cy="0"
                            rx="500"
                            ry="500"
                            gradientUnits="userSpaceOnUse"
                        >
                            <Stop offset="0" stopColor={Colors.dark.primary} stopOpacity="0.2" />
                            <Stop offset="1" stopColor={Colors.dark.background} stopOpacity="0" />
                        </RadialGradient>
                    </Defs>
                    <Rect x="0" y="0" width={width} height={height} fill="url(#grad)" />
                </Svg>
            </View>
            <View style={styles.content}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
    glowContainer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 0,
    },
    content: {
        flex: 1,
        zIndex: 1,
    }
});

export default GlowBackground;
