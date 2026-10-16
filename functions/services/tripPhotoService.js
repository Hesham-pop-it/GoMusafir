const { HttpsError } = require('firebase-functions/v2/https');
function decodeTripPhoto(dataUrl) {
  const prefix = 'data:image/jpeg;base64,';
  if (typeof dataUrl !== 'string' || dataUrl.length > 7 * 1024 * 1024 || !dataUrl.startsWith(prefix)) {
    throw new HttpsError('invalid-argument', 'Please select a JPEG photo smaller than 5 MB.');
  }
  const encoded = dataUrl.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new HttpsError('invalid-argument', 'Invalid photo.');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 4 || bytes.length >= 5 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new HttpsError('invalid-argument', 'Invalid or oversized photo. Please capture it again.');
  }
  return bytes;
}

// Stores a decoded banner as trips/{uuid}.jpg (public read by the storage rules) and returns its download URL.
async function saveTripPhoto(bytes) {
  const { admin } = require('../admin');
  const { v4: uuidv4 } = require('uuid');
  const { getDownloadURL } = require('firebase-admin/storage');
  const file = admin.storage().bucket().file(`trips/${uuidv4()}.jpg`);
  await file.save(bytes, { resumable: false, metadata: { contentType: 'image/jpeg',
    metadata: { firebaseStorageDownloadTokens: uuidv4() } } });
  return getDownloadURL(file);
}
module.exports = { decodeTripPhoto, saveTripPhoto };
