// On-phone video compression to about 720p. Needs a native compressor
// (react-native-compressor) which is absent from the current build, so
// every failure path returns the original uri and the upload carries on as before.
let compressor;
function loadCompressor() {
    if (compressor !== undefined) return compressor;
    try {
        // eslint-disable-next-line global-require
        compressor = require('react-native-compressor');
    } catch {
        compressor = null;
    }
    return compressor;
}

export function isVideoCompressionAvailable() {
    const mod = loadCompressor();
    return !!(mod && mod.Video && typeof mod.Video.compress === 'function');
}

export async function compressVideoIfPossible(uri) {
    if (!isVideoCompressionAvailable()) return uri;
    try {
        const out = await loadCompressor().Video.compress(uri, { compressionMethod: 'manual', maxSize: 1280, bitrate: 2500000 });
        return typeof out === 'string' && out ? out : uri;
    } catch (error) {
        console.log('[videoCompression] Falling back to original video:', error?.message);
        return uri;
    }
}
