import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export const PHOTO_FULL_LONG_SIDE = 1280;
export const PHOTO_THUMB_LONG_SIDE = 480;
export const PHOTO_QUALITY = 0.7;
export const AVATAR_LONG_SIDE = 256;
export const AVATAR_THUMB_LONG_SIDE = 96;

// Resize action that fits the long side to `max`; null when the image is already small enough.
export function longSideResize(width, height, max) {
    if (!(width > 0) || !(height > 0) || Math.max(width, height) <= max) return null;
    return width >= height ? { resize: { width: max } } : { resize: { height: max } };
}

async function resizeTo(uri, width, height, max, compress) {
    if (!(width > 0) || !(height > 0)) {
        // Dimensions unknown: a no-op manipulation reports them.
        const probe = await manipulateAsync(uri, [], { format: SaveFormat.JPEG, compress: 1 });
        width = probe.width;
        height = probe.height;
    }
    const action = longSideResize(width, height, max);
    return manipulateAsync(uri, action ? [action] : [], { compress, format: SaveFormat.JPEG });
}

// Full-size chat photo (1280 px long side, q0.7) plus a 480 px thumbnail for lists and bubbles.
export async function preparePhoto(uri, width, height) {
    const full = await resizeTo(uri, width, height, PHOTO_FULL_LONG_SIDE, PHOTO_QUALITY);
    const thumb = await resizeTo(full.uri, full.width, full.height, PHOTO_THUMB_LONG_SIDE, PHOTO_QUALITY);
    return { full, thumb };
}

// Avatar at 256 px; the 96 px variant is returned for callers that can store a thumbnail field.
export async function prepareAvatar(uri, width, height) {
    const full = await resizeTo(uri, width, height, AVATAR_LONG_SIDE, PHOTO_QUALITY);
    const thumb = await resizeTo(full.uri, full.width, full.height, AVATAR_THUMB_LONG_SIDE, PHOTO_QUALITY);
    return { full, thumb };
}
