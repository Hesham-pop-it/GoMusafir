const { db } = require('../admin');

// True while the user is present in the trip's voice channel; message pushes are quiet then.
async function isInVoice(orgId, tripId, uid) {
  if (!orgId || !tripId || !uid) return false;
  try {
    // Phones write beside the voice node; the server's roster and older app versions write inside it.
    const [beside, inside] = await Promise.all([
      db.ref(`trips_active/${orgId}/${tripId}/voice_presence/${uid}`).get(),
      db.ref(`trips_active/${orgId}/${tripId}/voice_channel/presence/${uid}`).get(),
    ]);
    return beside.val() === true || inside.val() === true;
  } catch (_) {
    return false;
  }
}

module.exports = { isInVoice };
