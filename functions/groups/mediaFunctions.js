const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getDownloadURL } = require('firebase-admin/storage');
const { randomUUID } = require('crypto');
const { admin, db } = require('../admin');
const { requireTripAccess } = require('../services/participantAccessService');
const { verifyAppCheck, requireRole } = require('../middleware/appCheckMiddleware');

const TYPES = { 'image/jpeg': 'jpg', 'video/mp4': 'mp4', 'audio/m4a': 'm4a' };
const validKey = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[.#$\[\]/\x00-\x1f\x7f]/.test(value);
async function authorize(request) {
  verifyAppCheck(request);
  const { tripId, purpose, targetUid } = request.data || {};
  if (!validKey(tripId) || !['chat', 'avatar'].includes(purpose)) {
    throw new HttpsError('invalid-argument', 'Invalid media destination.');
  }
  const access = await requireTripAccess(request, tripId);
  if (purpose === 'avatar') {
    requireRole(request, ['admin', 'manager', 'co-host']);
    if (!access.staff || request.auth.token.orgId !== access.orgId || !validKey(targetUid)) {
      throw new HttpsError('permission-denied', 'Cannot edit this participant.');
    }
    const [participant, staff] = await Promise.all([
      db.ref(`trips_participants/${tripId}/${targetUid}`).get(),
      db.ref(`orgs/${access.orgId}/staff/${targetUid}`).get(),
    ]);
    if (!participant.exists() && !staff.exists()) throw new HttpsError('permission-denied', 'Participant not found in this trip.');
  }
  return {
    prefix: `${purpose === 'chat' ? 'chat_media' : 'participant_avatars'}/${tripId}/${request.auth.uid}/`,
    maxSize: (purpose === 'chat' ? 100 : 5) * 1024 * 1024,
  };
}

exports.prepareMediaUpload = onCall({ region: 'europe-west1' }, async request => {
  const { prefix, maxSize } = await authorize(request);
  const { contentType, size, purpose } = request.data;
  if (!Object.hasOwn(TYPES, contentType) || (purpose === 'avatar' && contentType !== 'image/jpeg') ||
      !Number.isSafeInteger(size) || size <= 0 || size >= maxSize) {
    throw new HttpsError('invalid-argument', `Unsupported media or file too large (limit ${maxSize / 1024 / 1024} MB).`);
  }
  const uploadId = `${randomUUID()}.${TYPES[contentType]}`;
  // Signed size/type and create-only precondition prevent oversized uploads and overwrites.
  const headers = { 'Content-Type': contentType, 'Content-Length': String(size), 'x-goog-if-generation-match': '0' };
  const [uploadUrl] = await admin.storage().bucket().file(prefix + uploadId).getSignedUrl({
    version: 'v4', action: 'write', expires: Date.now() + 5 * 60 * 1000,
    contentType, extensionHeaders: { 'content-length': String(size), 'x-goog-if-generation-match': '0' },
  });
  return { uploadId, uploadUrl, headers };
});

exports.completeMediaUpload = onCall({ region: 'europe-west1' }, async request => {
  const { prefix, maxSize } = await authorize(request);
  const { uploadId, purpose } = request.data;
  if (typeof uploadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|mp4|m4a)$/.test(uploadId)) {
    throw new HttpsError('invalid-argument', 'Invalid upload.');
  }
  const file = admin.storage().bucket().file(prefix + uploadId);
  const [metadata] = await file.getMetadata();
  if (!Object.hasOwn(TYPES, metadata.contentType) || !uploadId.endsWith(`.${TYPES[metadata.contentType]}`) ||
      (purpose === 'avatar' && metadata.contentType !== 'image/jpeg') ||
      !(Number(metadata.size) > 0 && Number(metadata.size) < maxSize)) {
    throw new HttpsError('invalid-argument', 'Invalid uploaded media.');
  }
  // Recheck current trip access before publishing a persistent Firebase download link.
  if (!metadata.metadata?.firebaseStorageDownloadTokens) {
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: randomUUID() } });
  }
  return { url: await getDownloadURL(file) };
});
