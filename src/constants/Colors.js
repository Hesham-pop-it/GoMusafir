/**
 * Professional color palette for the application.
 * Uses a refined slate/indigo theme for a modern look.
 */

const tintColorLight = '#B99A4A';
const tintColorDark = '#B99A4A';

export const Colors = {
    light: {
        text: '#121417',
        textSecondary: '#636D77',
        background: '#FFFFFF',
        card: '#FFFFFF',
        border: '#E1E4E8',
        tint: tintColorLight,
        icon: '#636D77',
        tabIconDefault: '#9BA1A6',
        tabIconSelected: tintColorLight,
        primary: '#B99A4A',
        secondary: '#8E773A',
        error: '#CF6679',
        success: '#34C759',
        inputBackground: '#F5F5F5',
    },
    dark: {
        text: '#FFFFFF',
        textSecondary: '#9BA1A6',
        background: '#121417',
        card: '#1A1C1E',
        border: '#2C2E33',
        tint: tintColorDark,
        icon: '#9BA1A6',
        tabIconDefault: '#636D77',
        tabIconSelected: tintColorDark,
        primary: '#B99A4A',
        secondary: '#8E773A',
        error: '#CF6679',
        success: '#34C759',
        inputBackground: '#1A1C1E',
    },
};
