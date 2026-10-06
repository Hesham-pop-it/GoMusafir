// Widget entry always validates afresh. Internal navigation may reuse only an
// in-memory admission for this user and this foreground session.
export function createProtectedSessionValidator({ auth, fetchAccess, readMfaLock, signOut, isDenied }) {
    let blockedUser = null;
    let revision = 0;
    let admission = null;
    const listeners = new Set();
    return {
        hasAdmission() {
            return !!admission && admission.user === auth.currentUser &&
                auth.currentUser !== blockedUser && Date.now() < admission.expiresAt;
        },
        clearAdmission() {
            admission = null;
            revision++;
        },
        isBlocked() {
            return !auth.currentUser || auth.currentUser === blockedUser;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        invalidate() {
            admission = null;
            blockedUser = auth.currentUser;
            revision++;
            for (const listener of listeners) listener();
        },
        async validate() {
            try { await auth.authStateReady(); } catch (_) { return false; }
            const user = auth.currentUser;
            const startedAt = revision;
            if (!user || user === blockedUser) { admission = null; return false; }
            const isCurrent = () => auth.currentUser === user && revision === startedAt && user !== blockedUser;
            try {
                const token = await user.getIdTokenResult(true);
                if (!isCurrent()) return false;
                if (!(user.emailVerified || token.claims.email_verified || token.claims.handoff)) { admission = null; return false; }
                if (await readMfaLock()) { admission = null; return false; }
                // This callable checks Auth revocation/disabled status and canonical
                // staff membership or active trip entitlement on the server.
                const access = await fetchAccess();
                const valid = isCurrent() && (access?.staff === true ||
                    (Number.isFinite(access?.server_now) && access.expires_at > access.server_now));
                if (!valid && isCurrent()) admission = null;
                if (valid) {
                    const tokenExpiry = Date.parse(token.expirationTime);
                    const accessExpiry = access.staff === true ? Infinity :
                        Date.now() + (access.expires_at - access.server_now);
                    // Missing expiry metadata must never produce reusable admission.
                    if (Number.isFinite(tokenExpiry)) {
                        admission = { user, expiresAt: Math.min(tokenExpiry, accessExpiry) };
                    }
                }
                return valid;
            } catch (error) {
                if (isCurrent()) admission = null;
                if (isCurrent() && isDenied(error)) {
                    blockedUser = user;
                    revision++;
                    for (const listener of listeners) listener();
                    await signOut(auth).catch(() => {});
                }
                // Offline or unavailable validation must also deny entry, without
                // destroying otherwise valid saved credentials.
                return false;
            }
        },
    };
}
