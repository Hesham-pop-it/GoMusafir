const { HttpsError } = require('firebase-functions/v2/https');
const { db, auth } = require('../admin');
const { requireTripAccess } = require('./participantAccessService');
const { decrypt } = require('./kmsService');

const roles = ['admin', 'co-host', 'manager'];
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z]/g, '');
const aliases = { name: ['name', 'firstname', 'first', 'fname'], lastname: ['lastname', 'last', 'surname', 'lname'],
  email: ['email', 'emailaddress', 'mail'], phone: ['phone', 'phonenumber', 'mobile', 'cell'], photo: ['photo', 'profilephoto', 'profilepicture', 'avatar'] };
function setting(config, field) {
  const key = Object.keys(config || {}).find(key => aliases[field].includes(normalize(key)));
  return normalize(config?.[key] || 'Show to organizer');
}
function visible(field, config, personal, self, staff, targetStaff) {
  if (self) return true;
  let option = setting(config, field);
  if (option.includes('custom')) option = setting(personal, field);
  if (/notshow|dontshow|hide|none|hidden/.test(option)) return false;
  if (/everyone|all/.test(option)) return true;
  return staff || (targetStaff && ['name', 'lastname', 'photo'].includes(field));
}
const value = (...values) => values.find(v => typeof v === 'string' && v.trim() && !['N/A', '***'].includes(v.trim())) || '';

async function getParticipantProfile(request) {
  const { targetUid, tripId } = request.data || {};
  if (![targetUid, tripId].every(v => typeof v === 'string' && /^[\w-]{1,128}$/.test(v))) {
    throw new HttpsError('invalid-argument', 'targetUid and tripId are required.');
  }
  const { orgId, trip, staff } = await requireTripAccess(request, tripId);
  const [member, role, userSnap] = await Promise.all([
    db.ref(`trips_participants/${tripId}/${targetUid}`).get(),
    db.ref(`orgs/${orgId}/staff/${targetUid}`).get(),
    db.ref(`users/${targetUid}`).get(),
  ]);
  const targetStaff = roles.includes(role.val());
  if (member.val() !== true && !targetStaff) throw new HttpsError('permission-denied', 'This user does not belong to the trip.');
  if (!userSnap.exists()) throw new HttpsError('not-found', 'User not found.');
  const user = userSnap.val();
  let encrypted = {};
  if (user.p_profile) {
    try { encrypted = JSON.parse(decrypt(user.p_profile)) || {}; } catch (_) { /* Use individual field fallbacks. */ }
  }
  const profile = user.profile || {};
  const resolveEncrypted = v => {
    const result = v ? decrypt(v) : '';
    return result === v && /^[a-f0-9]+\.[a-f0-9]+\.[a-f0-9]+$/i.test(v || '') ? '' : result;
  };
  let email = value(encrypted.email, profile.email, resolveEncrypted(user.p_email), user.email);
  if (!email) {
    try { email = (await auth.getUser(targetUid)).email || ''; }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  }
  const resolved = {
    firstName: value(encrypted.firstName, profile.firstName, profile.first_name, user.first_name),
    lastName: value(encrypted.lastName, profile.lastName, profile.last_name, user.last_name),
    email,
    phone: value(encrypted.phone, profile.phone, profile.phoneNumber, resolveEncrypted(user.p_phone), user.phone, user.phoneNumber),
    photoURL: value(profile.photoURL, encrypted.photoURL, user.photo_url),
  };
  const visibility = {};
  for (const [field, property, flag] of [['name', 'firstName', 'canSeeFirstName'], ['lastname', 'lastName', 'canSeeLastName'],
    ['email', 'email', 'canSeeEmail'], ['phone', 'phone', 'canSeePhone'], ['photo', 'photoURL', 'canSeePhoto']]) {
    visibility[flag] = visible(field, trip.visibility_config || {}, user.participant_visibility?.[tripId] || {},
      request.auth.uid === targetUid, staff, targetStaff);
    if (!visibility[flag]) resolved[property] = '***';
  }
  return { uid: targetUid, email: resolved.email, phone: resolved.phone,
    fullName: `${resolved.firstName} ${resolved.lastName}`.trim(), profile: resolved, visibility };
}
module.exports = { getParticipantProfile };
