const { db } = require('../admin');

// True while the user is present in the trip's voice channel; message pushes are quiet then.
async function isInVoice(orgId, tripId, uid) {
  if (!orgId || !tripId || !uid) return false;
  try {
    return (await db.ref(`trips_active/${orgId}/${tripId}/voice_channel/presence/${uid}`).get()).val() === true;
  } catch (_) {
    return false;
  }
}

module.exports = { isInVoice };
