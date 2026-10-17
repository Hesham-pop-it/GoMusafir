// Keep a successfully created account available for OTP/upload/join retries.
// Firebase Auth enforces email uniqueness if another request wins the race.
export async function ensureTeamAccount({ auth, email, password, checkUser, createUser, signIn }) {
    const normalized = email.trim().toLowerCase();
    await auth.authStateReady();
    if (auth.currentUser?.email?.toLowerCase() === normalized) return auth.currentUser;
    const result = await checkUser(normalized);
    if (result.data.exists) return (await signIn(auth, normalized, password)).user;
    try {
        return (await createUser(auth, normalized, password)).user;
    } catch (error) {
        if (error.code !== 'auth/email-already-in-use') throw error;
        return (await signIn(auth, normalized, password)).user;
    }
}
