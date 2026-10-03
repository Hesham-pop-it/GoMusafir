const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getDownloadURL } = require('firebase-admin/storage');
const { randomUUID } = require('crypto');
const { admin } = require('../admin');
const { requireFreshIdentity } = require('../services/participantAccessService');
const { decodeTripPhoto } = require('../services/tripPhotoService');
const { verifyAppCheck } = require('../middleware/appCheckMiddleware');

// Enrollment uploads use Auth and Realtime Database.
exports.uploadProfilePhoto = onCall({ region: 'europe-west1' }, async request => {
  verifyAppCheck(request);
  await requireFreshIdentity(request);
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Verify your email before uploading your photo.');
  }
  const bytes = decodeTripPhoto(request.data?.dataUrl);
  const file = admin.storage().bucket().file(`users/${request.auth.uid}/photos/${randomUUID()}.jpg`);
  await file.save(bytes, {
    resumable: false,
    metadata: { contentType: 'image/jpeg', metadata: { firebaseStorageDownloadTokens: randomUUID() } },
  });
  return { url: await getDownloadURL(file) };
});
