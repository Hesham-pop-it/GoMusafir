// Phones listen to this one small value instead of polling the redacted chat;
// a change tells them to fetch the chat once through getVisibleTripData.
function signalChat(db, orgId, tripId, messageId) {
  return db.ref(`trips_active/${orgId}/${tripId}/chat_signal`).set(messageId);
}

module.exports = { signalChat };
