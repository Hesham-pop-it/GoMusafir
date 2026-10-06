// One server-side policy for all participant data. Unknown values fail closed.
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z]/g, '');
const aliases = {
  name: ['name', 'firstname', 'first', 'fname'], lastname: ['lastname', 'last', 'surname', 'lname'],
  email: ['email', 'emailaddress', 'mail'], phone: ['phone', 'phonenumber', 'mobile', 'cell'],
  photo: ['photo', 'profilephoto', 'profilepicture', 'image', 'avatar', 'photourl'],
  location: ['location', 'livelocation', 'gps'],
};
function setting(config, field) {
  const key = Object.keys(config || {}).find(key => aliases[field]?.includes(normalize(key)));
  const value = normalize(config?.[key]);
  if (['showtoeveryone', 'everyone', 'all'].includes(value)) return 'everyone';
  if (['donotshow', 'dontshow', 'hide', 'none', 'hidden'].includes(value)) return 'hidden';
  if (['customchoice', 'custom'].includes(value)) return 'custom';
  return 'organizers';
}
function visible(field, config, personal, self, staff) {
  let option = setting(config, field);
  if (option === 'custom') option = setting(personal, field);
  if (option === 'hidden') return false;
  return option === 'everyone' || Boolean(staff) || Boolean(self);
}
function activeGrant(grant, now = Date.now()) {
  return Boolean(grant && typeof grant === 'object' && grant.acceptedAt > 0 && grant.expiresAt > now);
}
module.exports = { normalize, setting, visible, activeGrant };
