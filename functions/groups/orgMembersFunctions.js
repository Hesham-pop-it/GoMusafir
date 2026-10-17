const { onValueWritten } = require('firebase-functions/v2/database');
const members = require('../services/orgMembersService');

const options = ref => ({ ref, region: 'europe-west1', retry: true });

// Keeps org_members and trip_cards in step with trips_participants and org staff,
// whichever server path (invite, join, enrollment, trip creation, staff invite)
// wrote the change.
exports.onParticipantIndexChanged = onValueWritten(options('/trips_participants/{tripId}/{uid}'), event =>
  members.onParticipantChanged(event.params.tripId, event.params.uid, event.data.after.exists()));

exports.onStaffIndexChanged = onValueWritten(options('/orgs/{orgId}/staff/{uid}'), event =>
  members.onStaffChanged(event.params.orgId, event.params.uid, event.data.after.exists()));

// Name or photo changed: refresh the user's cards.
const refresh = event => members.refreshUserCards(event.params.uid);
// profile also receives unrelated writes (likes); only react when the card changes.
const cardOf = profile => JSON.stringify(members.buildCard({ profile }));
exports.onUserProfileCardChanged = onValueWritten(options('/users/{uid}/profile'), event =>
  cardOf(event.data.before.val()) === cardOf(event.data.after.val()) ? null : refresh(event));
exports.onUserNameCardChanged = onValueWritten(options('/users/{uid}/full_name'), refresh);
exports.onUserPhotoCardChanged = onValueWritten(options('/users/{uid}/photo_url'), refresh);
