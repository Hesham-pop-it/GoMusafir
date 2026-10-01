// Match the roles accepted by requireTripAccess on the server.
export const isVoiceStaff = role => ['admin', 'co-host', 'manager'].includes(role);
