// Push notifications and account history must not retain denormalized identities
// or coordinates. Opening the trip resolves the current, viewer-specific data.
function redactNotification(notification) {
  if (!notification || typeof notification !== 'object') return notification;
  const result = { ...notification };
  for (const key of ['name','sender_name','senderName','senderImage','avatar','email','phone','photoURL',
    'lat','lng','latitude','longitude','location','coordinates','address']) delete result[key];
  const personalEvent = notification.senderUid || notification.sender_id || notification.fromUid ||
    ['participant_joined','location_request','emergency','chat_message'].includes(notification.type);
  if (personalEvent) {
    result.name = 'Participant';
    result.title = notification.type === 'emergency' ? 'Emergency Alert' : notification.type === 'location_request' ? 'Location Request' : 'Trip Update';
    result.message = notification.type === 'emergency' ? 'A participant needs assistance. Open the trip for details.' :
      notification.type === 'location_request' ? 'A participant is asking to see your location for 15 minutes.' : 'Open the trip to see this update.';
    if ('body' in result) result.body = result.message;
  }
  if (notification.type === 'location_response') {
    result.title = notification.status === 'accepted' ? 'Location Request Accepted' : 'Location Request Declined';
    result.message = notification.status === 'accepted' ? 'Location is shared with you for 15 minutes.' : 'The participant declined your request.';
    if ('body' in result) result.body = result.message;
  }
  return result;
}
module.exports = { redactNotification };
