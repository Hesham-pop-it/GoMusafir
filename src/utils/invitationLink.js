export function parseInvitationCode(input) {
    const value = String(input || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (/^[A-Za-z0-9_-]{1,256}$/.test(value)) return value;
    try {
        const url = new URL(/^(?:www\.)?(?:app|join)\.gomusafir\.app\//i.test(value) ? `https://${value}` : value);
        const web = ['https:', 'http:'].includes(url.protocol) &&
            ['app.gomusafir.app', 'www.app.gomusafir.app', 'join.gomusafir.app', 'www.join.gomusafir.app'].includes(url.hostname);
        const app = url.protocol === 'gomusafir:' && ['link', 'join'].includes(url.hostname);
        if ((!web && !app) || url.username || url.password || url.port) return null;
        if ((web && /^\/join\/?$/.test(url.pathname)) ||
            (app && url.hostname === 'join' && /^\/?$/.test(url.pathname))) {
            const codes = url.searchParams.getAll('code');
            return codes.length === 1 && /^[A-Za-z0-9_-]{1,256}$/.test(codes[0]) ? codes[0] : null;
        }
        if (app && url.hostname !== 'link') return null;
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
