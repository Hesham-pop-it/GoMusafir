import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export async function uploadJoinPhoto(uri) {
    try {
        // Send a bounded JPEG through the authenticated enrollment endpoint.
        // Enrollment authorization uses Auth and Realtime Database.
        const photo = await manipulateAsync(uri, [{ resize: { width: 768 } }], {
            compress: 0.8, format: SaveFormat.JPEG, base64: true,
        });
        if (!photo.base64) throw new Error('Could not read the selected photo.');
        const result = await httpsCallable(functions, 'uploadProfilePhoto')({
            dataUrl: `data:image/jpeg;base64,${photo.base64}`,
        });
        const url = result.data?.url;
        if (typeof url !== 'string' || !url.startsWith('https://')) {
            throw new Error('The upload did not return a photo URL.');
        }
        return url;
    } catch (cause) {
        console.warn('[JoinPhoto] Upload failed:', cause.code || cause.message);
        const message = ['functions/unauthenticated', 'functions/permission-denied', 'functions/invalid-argument'].includes(cause.code)
            ? cause.message
            : 'Your photo could not be uploaded. Please retry before continuing.';
        throw new Error(message, { cause });
    }
}
