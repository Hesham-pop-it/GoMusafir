import { ref, get } from 'firebase/database';

const safe = (promise) => promise.catch(() => null);

/**
 * Name and photo of another trip member, in the shape the participant screens
 * used to read from users/<uid>/{profile,full_name,photo_url}.
 *
 * Fellow travellers cannot read other users' records any more. They read the
 * server-written trip_cards/<tripId>/<uid> (name and photo only, no email or
 * phone); your own record is still read directly. Staff of the same organisation fall back to the user record when no
 * card exists yet. Email and phone come from getParticipantProfile only.
 */
export async function fetchParticipantDisplay(database, uid, tripId, selfUid = null) {
    if (tripId && uid !== selfUid) {
        const cardSnap = await safe(get(ref(database, `trip_cards/${tripId}/${uid}`)));
        const card = cardSnap?.val();
        if (card) {
            return {
                profile: card.profile || null,
                fullName: card.full_name || null,
                photoUrl: card.photo_url || null,
            };
        }
    }
    const [profileSnap, nameSnap, photoSnap] = await Promise.all([
        safe(get(ref(database, `users/${uid}/profile`))),
        safe(get(ref(database, `users/${uid}/full_name`))),
        safe(get(ref(database, `users/${uid}/photo_url`))),
    ]);
    return {
        profile: profileSnap?.val() || null,
        fullName: nameSnap?.val() || null,
        photoUrl: photoSnap?.val() || null,
    };
}
