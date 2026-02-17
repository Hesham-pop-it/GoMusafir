import { Dimensions, PixelRatio } from 'react-native';

const {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
} = Dimensions.get('window');

// We use 375x812 (iPhone 13 mini/11 Pro) or 390x844 (iPhone 13/14) as a standard reference
const GUIDELINE_BASE_WIDTH = 390;
const GUIDELINE_BASE_HEIGHT = 844;

/**
 * Normalizes a size value based on the screen dimensions with a moderation factor.
 * This prevents text from getting too small on tiny devices.
 */
export function responsiveFontSize(size, factor = 0.5) {
    const scale = SCREEN_WIDTH / GUIDELINE_BASE_WIDTH;

    // Moderate scaling: newSize = size + (scaledSize - size) * factor
    // If factor is 0.5, we only apply 50% of the shrinkage/growth.
    const newSize = size + (size * scale - size) * factor;

    return Math.round(PixelRatio.roundToNearestPixel(newSize));
}
