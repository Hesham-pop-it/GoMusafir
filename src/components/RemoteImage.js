import React from 'react';
import { Image as NativeImage } from 'react-native';

// Remote images go through expo-image (disk cache) when the build includes it,
// and fall back to the react-native Image otherwise.
let ExpoImage = null;
try {
    // eslint-disable-next-line global-require
    ExpoImage = require('expo-image').Image;
} catch {
    ExpoImage = null;
}

export default function RemoteImage({ source, style, resizeMode = 'cover', ...rest }) {
    if (ExpoImage) {
        return <ExpoImage source={source} style={style} contentFit={resizeMode === 'stretch' ? 'fill' : resizeMode} cachePolicy="disk" {...rest} />;
    }
    return <NativeImage source={source} style={style} resizeMode={resizeMode} {...rest} />;
}
