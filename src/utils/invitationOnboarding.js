// Invitation onboarding owns navigation until verification/join completes.
export async function recoverVerificationParams(params = {}, loadJoinStatus) {
    if (params.invitationCode || params.teamInviteToken) return params;
    // Recovery must finish before consuming the OTP or choosing a continuation.
    // Propagate read failures so a retry cannot silently fall back to Home.
    const saved = await loadJoinStatus();
    return saved?.isJoining ? { ...params, ...saved } : params;
}

export function invitationVerificationParams(previous, { uid, email, isExistingUser = false }) {
    return {
        ...previous,
        uid,
        email,
        isExistingUser,
        targetScreen: isExistingUser ? (previous.isTeamInvite ? 'Home' : 'JoinTerms') : 'JoinFirstName',
        title: 'Verify your email',
        description: `We've sent a 6-digit secure code to ${email}. Please enter it below.`,
    };
}

export function verificationContinuation(params) {
    // A stale Home target must not pull a new trip participant out of onboarding.
    if (params.invitationCode && !params.isTeamInvite) {
        return params.isExistingUser ? 'JoinTerms' : 'JoinFirstName';
    }
    return params.targetScreen || 'Home';
}
