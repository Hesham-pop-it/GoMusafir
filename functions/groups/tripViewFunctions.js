const { onValueWritten } = require('firebase-functions/v2/database');
const views = require('../services/tripViewService');

const options = ref => ({ ref, region: 'europe-west1', retry: true });

// Keeps trip_view in step with everything the directory redaction depends on:
// membership, staff roles, profile fields, personal and trip visibility choices.
exports.onParticipantViewChanged = onValueWritten(options('/trips_participants/{tripId}/{uid}'), event =>
  views.writeTripView(event.params.tripId, [event.params.uid]));

exports.onStaffViewChanged = onValueWritten(options('/orgs/{orgId}/staff/{uid}'), async event => {
  const { db } = require('../admin');
  const tripIds = Object.keys((await db.ref(`orgs/${event.params.orgId}/trips`).get()).val() || {});
  for (const tripId of tripIds) await views.writeTripView(tripId, [event.params.uid]);
});

exports.onTripVisibilityViewChanged = onValueWritten(options('/orgs/{orgId}/trips/{tripId}/visibility_config'), event =>
  views.writeTripView(event.params.tripId));

exports.onUserVisibilityViewChanged = onValueWritten(options('/users/{uid}/participant_visibility/{tripId}'), event =>
  views.writeTripView(event.params.tripId, [event.params.uid]));

// Name, photo, email and phone live in these fields (plain or encrypted).
const refresh = event => views.refreshUserViews(event.params.uid);
for (const [name, field] of [['onUserProfileViewChanged', 'profile'], ['onUserNameViewChanged', 'full_name'],
  ['onUserPhotoViewChanged', 'photo_url'], ['onUserPrivateProfileViewChanged', 'p_profile'],
  ['onUserEmailViewChanged', 'p_email'], ['onUserPhoneViewChanged', 'p_phone']]) {
  exports[name] = onValueWritten(options(`/users/{uid}/${field}`), refresh);
}

// Own account changes tell the owner's open screens to refetch getOwnAccount.
exports.onOwnAccountChanged = onValueWritten({ ref: '/users/{uid}', region: 'europe-west1' }, event =>
  require('../admin').db.ref(`account_signal/${event.params.uid}`).set(event.id)
    .catch(error => console.log('Error signalling account:', error)));

