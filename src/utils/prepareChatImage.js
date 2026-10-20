import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Full-resolution photos crash Android when decoded in the chat, so send a bounded JPEG.
export async function prepareChatImage(uri) {
    const photo = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: SaveFormat.JPEG });
    return photo.uri;
}
