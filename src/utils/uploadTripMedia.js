import * as FileSystem from 'expo-file-system/legacy';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../config/firebase';

export async function uploadTripMedia(uri, { tripId, contentType, purpose = 'chat', targetUid }) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Please sign in again.');
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || !info.size) throw new Error('Could not read the selected media.');
    const limitMB = purpose === 'avatar' ? 5 : 100;
    if (info.size >= limitMB * 1024 * 1024) {
        throw new Error(`This file is ${(info.size / 1024 / 1024).toFixed(1)} MB. Choose a file smaller than ${limitMB} MB.`);
    }
    const scope = { tripId, purpose, ...(targetUid ? { targetUid } : {}) };
    let stage = 'Authorizing upload';
    try {
        const { data } = await httpsCallable(functions, 'prepareMediaUpload')({ ...scope, contentType, size: info.size });
        stage = 'Uploading file';
        const response = await FileSystem.uploadAsync(data.uploadUrl, uri, {
            httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: data.headers,
        });
        if (response.status < 200 || response.status >= 300) throw new Error(`Upload server returned HTTP ${response.status}. Please retry.`);
        if (auth.currentUser?.uid !== uid) throw new Error('Your account changed. Please try again.');
        stage = 'Confirming upload';
        const result = await httpsCallable(functions, 'completeMediaUpload')({ ...scope, uploadId: data.uploadId });
        if (typeof result.data?.url !== 'string' || !result.data.url.startsWith('https://')) throw new Error('Could not confirm the media upload.');
        return result.data.url;
    } catch (error) {
        const failure = new Error(`${stage}: ${error.message || 'Please try again.'}`);
        failure.code = error.code;
        failure.stage = stage;
        throw failure;
    }
}
