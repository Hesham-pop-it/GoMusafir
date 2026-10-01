const { onCall: firebaseOnCall } = require('firebase-functions/v2/https');
const { requireAppAccess, requireFreshIdentity } = require('../services/participantAccessService');

// Authentication alone is only sufficient for explicitly marked enrollment
// operations. All other authenticated callable requests need current app access.
function onCall(options, handler) {
  const { enrollment = false, ...firebaseOptions } = options;
  return firebaseOnCall(firebaseOptions, async (request) => {
    if (request.auth) {
      if (enrollment) await requireFreshIdentity(request);
      else await requireAppAccess(request);
    }
    return handler(request);
  });
}
module.exports = { onCall };
