// Phones listen to these small values instead of polling redacted trip data;
// a change tells them to fetch that section once through getVisibleTripData.
// Each value is only an event or message id, never content.
const root = (orgId, tripId) => `trips_active/${orgId}/${tripId}`;

function signalChat(db, orgId, tripId, messageId) {
  return db.ref(`${root(orgId, tripId)}/chat_signal`).set(messageId);
}

function signalVoice(db, orgId, tripId, eventId) {
  return db.ref(`${root(orgId, tripId)}/voice_signal`).set(eventId);
}

function signalNotifications(db, orgId, tripId, uid, eventId) {
  return db.ref(`${root(orgId, tripId)}/notification_signal/${uid}`).set(eventId);
}

module.exports = { signalChat, signalVoice, signalNotifications };
