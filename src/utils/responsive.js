import { Dimensions, Platform, PixelRatio } from 'react-native';

const {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
} = Dimensions.get('window');

// Standard reference width (e.g., iPhone 11 Pro / X width)
const REFERENCE_WIDTH = 375;

/**
 * Normalizes a size value based on the screen width.
 * Useful for font sizes, margins, sizes to be responsive across different screens.
 * 
 * @param {number} size - The size in pixels to normalize
 * @returns {number} - The normalized size
 */
export function responsiveFontSize(size) {
    const scale = SCREEN_WIDTH / REFERENCE_WIDTH;
    const newSize = size * scale;
    
    if (Platform.OS === 'ios') {
        return Math.round(PixelRatio.roundToNearestPixel(newSize));
    } else {
        // Android fonts can behave a bit differently
        return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 1;
    }
}
