// Allow backend access checks and session reconciliation to finish. The callable
// owns its deadline; an extra short Promise.race used to discard valid responses.
export async function requestVoiceToken(functions, httpsCallable, tripId) {
    try {
        return await httpsCallable(functions, 'generateLiveKitToken', { timeout: 60000 })({ tripId });
    } catch (error) {
        if (['functions/deadline-exceeded', 'deadline-exceeded'].includes(error.code)) {
            throw new Error('The Voice service took too long to prepare your session. Please try again shortly.');
        }
        throw error;
    }
}
