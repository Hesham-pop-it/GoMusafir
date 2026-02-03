import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors'; // Adjust path if needed

export default function AppRootLayout({ children }) {
    const insets = useSafeAreaInsets();

    return (
        <View style={styles.container}>
            {children}

            {Platform.OS === 'android' && (
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: insets.bottom,
                        backgroundColor: '#23272A', // Custom dark color for the system nav bar area
                        zIndex: -1,
                    }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
    },
});
