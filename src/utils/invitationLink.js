export function parseInvitationCode(input) {
    const value = String(input || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (/^[A-Za-z0-9_-]{1,256}$/.test(value)) return value;
    try {
        const url = new URL(/^app\.gomusafir\.app\//i.test(value) ? `https://${value}` : value);
        const web = ['https:', 'http:'].includes(url.protocol) && url.hostname === 'app.gomusafir.app';
        const app = url.protocol === 'gomusafir:' && url.hostname === 'link';
        if ((!web && !app) || url.username || url.password || url.port) return null;
        const match = url.pathname.match(app ? /^\/([A-Za-z0-9_-]{1,256})\/?$/ : /^\/link\/([A-Za-z0-9_-]{1,256})\/?$/);
        return match?.[1] || null;
    } catch (_) { return null; }
}

export function invitationErrorMessage(error) {
    const code = String(error?.code || '').replace(/^functions\//, '');
    if (code === 'not-found' || code === 'invalid-argument') return 'Invalid link. Please check the link and try again.';
    if (code === 'failed-precondition') return 'This invitation has expired. Please ask the organizer for a new link.';
    if (code === 'permission-denied') return 'This trip is no longer available to join. Please contact the organizer.';
    if (code === 'unauthenticated' || code.startsWith('auth/')) return 'Your sign-in could not be verified. Please sign out and try this link again.';
    if (code === 'resource-exhausted') return 'Too many attempts. Please wait a moment and try again.';
    return 'We could not check your invitation right now. Check your connection and try again.';
}
