const { onValueWritten, onValueCreated } = require('firebase-functions/v2/database');
const views = require('../services/tripViewService');

const options = ref => ({ ref, region: 'europe-west1', retry: true });

// A retry cannot fix bad data: log it and finish instead of throwing for another attempt.
const guarded = (label, work) => async event => {
  try { return await work(event); }
  catch (error) {
    if (!views.isPermanent(error)) throw error;
    console.log(`${label}: skipped after a permanent error:`, error.message);
    return null;
  }
};

// Keeps trip_view in step with everything the directory redaction depends on:
// membership, staff roles, profile fields, personal and trip visibility choices.
exports.onParticipantViewChanged = onValueWritten(options('/trips_participants/{tripId}/{uid}'), guarded('participant view', event =>
  views.writeTripView(event.params.tripId, [event.params.uid])));

exports.onStaffViewChanged = onValueWritten(options('/orgs/{orgId}/staff/{uid}'), guarded('staff view', async event => {
  const { db } = require('../admin');
  const tripIds = Object.keys((await db.ref(`orgs/${event.params.orgId}/trips`).get()).val() || {});
  for (const tripId of tripIds) await views.writeTripView(tripId, [event.params.uid]);
}));

exports.onTripVisibilityViewChanged = onValueWritten(options('/orgs/{orgId}/trips/{tripId}/visibility_config'), guarded('trip visibility view', event =>
  views.writeTripView(event.params.tripId)));

exports.onUserVisibilityViewChanged = onValueWritten(options('/users/{uid}/participant_visibility/{tripId}'), guarded('user visibility view', event =>
  views.writeTripView(event.params.tripId, [event.params.uid])));

// trips_orgs/{tripId} is the last write of trip creation, so the trip and its staff exist by now.
exports.onTripCreatedView = onValueCreated(options('/trips_orgs/{tripId}'), guarded('new trip view', event =>
  views.writeTripView(event.params.tripId)));

// Name, photo, email and phone live in these fields (plain or encrypted).
const refresh = event => views.refreshUserViews(event.params.uid);
// profile also receives unrelated writes (likes); only react when a field the directory reads changes.
exports.onUserProfileViewChanged = onValueWritten(options('/users/{uid}/profile'), guarded('profile view', event =>
  views.profileAffectsViews(event.data.before.val(), event.data.after.val()) ? refresh(event) : null));
for (const [name, field] of [['onUserNameViewChanged', 'full_name'], ['onUserPhotoViewChanged', 'photo_url'],
  ['onUserPrivateProfileViewChanged', 'p_profile'], ['onUserEmailViewChanged', 'p_email'], ['onUserPhoneViewChanged', 'p_phone'],
  // Older accounts keep these as top-level fields; getParticipantProfile reads them as fallbacks.
  ['onUserFirstNameViewChanged', 'first_name'], ['onUserLastNameViewChanged', 'last_name'],
  ['onUserPlainEmailViewChanged', 'email'], ['onUserPlainPhoneViewChanged', 'phone'], ['onUserPhoneNumberViewChanged', 'phoneNumber']]) {
  exports[name] = onValueWritten(options(`/users/{uid}/${field}`), guarded(name, refresh));
}

// Own account changes tell the owner's open screens to refetch getOwnAccount.
exports.onOwnAccountChanged = onValueWritten({ ref: '/users/{uid}', region: 'europe-west1' }, event =>
  require('../admin').db.ref(`account_signal/${event.params.uid}`).set(event.id)
    .catch(error => console.log('Error signalling account:', error)));

exports.onChatViewChanged = onValueWritten(options('/trips_active/{orgId}/{tripId}/chat/{messageId}'), guarded('chat view', event =>
  views.mirrorChat(event.params.orgId, event.params.tripId, event.params.messageId, event.data.after.val())));
