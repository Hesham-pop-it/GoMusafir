// Only an explicit rejection can invalidate credentials. Timeouts, transport
// failures and service outages leave the persisted Firebase session intact.
export const isAuthenticationError = error => [
    'auth/user-disabled', 'auth/user-token-expired', 'auth/invalid-user-token',
    'auth/id-token-expired', 'auth/user-not-found', 'functions/unauthenticated',
].includes(String(error?.code || '').toLowerCase());

export const isAccessDeniedError = error => isAuthenticationError(error) || [
    'functions/permission-denied', 'permission_denied', 'permission-denied',
].includes(String(error?.code || '').toLowerCase());

export const isNetworkOffline = state =>
    state.isConnected === false || state.isInternetReachable === false;
