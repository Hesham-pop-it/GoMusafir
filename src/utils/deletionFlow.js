// Pure helpers for the account and organisation deletion screens.

const KNOWN_REASONS = [
    'reauth-required', 'owns-organization', 'confirm-name-required',
    'name-mismatch', 'active-journeys', 'not-deleted',
];

// Reads the reason the server attached to an HttpsError, tolerating older
// servers and plain errors that carry no details.
export function deletionErrorReason(error) {
    const reason = error?.details?.reason;
    if (KNOWN_REASONS.includes(reason)) return reason;
    if (error?.code === 'auth/requires-recent-login') return 'reauth-required';
    if (typeof error?.message === 'string' && error.message.includes('re-authenticate')) return 'reauth-required';
    return null;
}

export function blockingJourneys(error) {
    const list = error?.details?.journeys;
    return Array.isArray(list) ? list.filter((j) => j && typeof j === 'object') : [];
}

// Staff re-confirm with their password, participants (no password) with an email code.
export function reauthMethod(user, role) {
    const hasPassword = !!user?.providerData?.some((p) => p?.providerId === 'password');
    if (role === 'participant' || !hasPassword) return 'email-code';
    return 'password';
}

// The typed organisation name must match exactly, ignoring only surrounding spaces.
export function confirmNameMatches(typed, orgName) {
    if (typeof typed !== 'string' || typeof orgName !== 'string' || !orgName.trim()) return false;
    return typed.trim() === orgName.trim();
}

export function daysRemaining(purgeAfter, now = Date.now()) {
    if (!Number.isFinite(purgeAfter)) return 0;
    return Math.max(0, Math.ceil((purgeAfter - now) / 86400000));
}
