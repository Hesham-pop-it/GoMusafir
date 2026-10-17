import { get, onValue, ref, update } from 'firebase/database';

// The phone reads the few voice status fields it needs straight from the
// database: ids, flags and reasons only. Names and photos are never stored in
// these fields; they come from the directory (see watchActiveSpeaker).
const END_FIELDS = ['isAllMuted', 'endedSessionId', 'endReason', 'endRecipientUid'];

// Calls onState({ isAllMuted, endedSessionId, endReason, endRecipientUid }) once
// every field has reported, then on each change. A refused read reports null.
export function watchVoiceChannelState(database, orgId, tripId, onState) {
    const base = `trips_active/${orgId}/${tripId}/voice_channel`;
    const values = {};
    const loaded = new Set();
    let stopped = false;
    const emit = () => {
        if (stopped || loaded.size < END_FIELDS.length) return;
        onState({ ...values });
    };
    const stops = END_FIELDS.map(field => onValue(ref(database, `${base}/${field}`), snapshot => {
        values[field] = snapshot.val() ?? null;
        loaded.add(field);
        emit();
    }, () => {
        if (stopped) return;
        onState(null);
    }));
    return () => { stopped = true; stops.forEach(stop => stop()); };
}

// A person's display name and photo, the way the server's voice section built them.
export function speakerFromDirectory(uid, user, speaking = true) {
    const profile = user?.profile || {};
    const photo = profile.photoURL || '';
    return { uid, name: user?.full_name || 'Participant', photoURL: photo, avatar: photo, speaking };
}

// Calls onSpeaker with { uid, name, photoURL, avatar, speaking } or null.
// Only the speaker's uid and flag are read from the voice node; the name follows
// the directory, so a hidden person stays "Participant". watchUser(uid, callback)
// subscribes to that person's directory entry and returns a stop function.
export function watchActiveSpeaker(database, orgId, tripId, watchUser, onSpeaker) {
    const base = `trips_active/${orgId}/${tripId}/voice_channel/activeSpeaker`;
    let uid = null, speaking = null, user, stopUser = null, stopped = false;
    const emit = () => {
        if (stopped) return;
        if (!uid || speaking === false) return onSpeaker(null);
        if (user === undefined) return;
        onSpeaker(speakerFromDirectory(uid, user, speaking !== false));
    };
    const follow = next => {
        if (next === uid) return;
        stopUser?.(); stopUser = null;
        uid = next; user = undefined;
        if (uid) stopUser = watchUser(uid, value => { user = value || null; emit(); });
    };
    const stops = [
        onValue(ref(database, `${base}/uid`), snapshot => {
            const next = typeof snapshot.val() === 'string' && snapshot.val() ? snapshot.val() : null;
            follow(next); emit();
        }, () => { follow(null); emit(); }),
        onValue(ref(database, `${base}/speaking`), snapshot => { speaking = snapshot.val() ?? null; emit(); }, () => {}),
    ];
    return () => { stopped = true; stops.forEach(stop => stop()); stopUser?.(); };
}

// Clears the speaker record only while it still names this person.
export async function clearActiveSpeakerIfMine(database, orgId, tripId, uid) {
    const base = `trips_active/${orgId}/${tripId}/voice_channel`;
    const current = await get(ref(database, `${base}/activeSpeaker/uid`));
    if (current.val() === uid) await update(ref(database, base), { activeSpeaker: null });
}

// Per-person presence lives beside the voice node, so its constant movement
// never wakes the listeners on the status fields. The old location is still read
// because the server's roster and older app versions write there.
export const PRESENCE_PATHS = { voice: ['voice_presence', 'voice_channel/presence'], app: ['voice_app_presence', 'voice_channel/app_presence'] };
export const presencePath = (orgId, tripId, kind) => `trips_active/${orgId}/${tripId}/${PRESENCE_PATHS[kind][0]}`;

// Calls onMap({ uid: true }) with both locations merged.
export function watchPresence(database, orgId, tripId, kind, onMap) {
    const parts = PRESENCE_PATHS[kind].map(() => ({}));
    const emit = () => onMap(Object.assign({}, ...parts));
    const stops = PRESENCE_PATHS[kind].map((path, index) => onValue(ref(database, `trips_active/${orgId}/${tripId}/${path}`), snapshot => {
        parts[index] = snapshot.val() || {};
        emit();
    }, () => { parts[index] = {}; emit(); }));
    return () => stops.forEach(stop => stop());
}

// True while this person is in the voice channel, from either location.
export async function isInVoiceChannel(database, orgId, tripId, uid) {
    const reads = await Promise.all(PRESENCE_PATHS.voice.map(path =>
        get(ref(database, `trips_active/${orgId}/${tripId}/${path}/${uid}`)).then(snapshot => snapshot.val() === true, () => false)));
    return reads.some(Boolean);
}

// Calls onPresent(true|false) for this person's own voice presence, from either location.
export function watchOwnVoicePresence(database, orgId, tripId, uid, onPresent) {
    const seen = PRESENCE_PATHS.voice.map(() => false);
    const emit = () => onPresent(seen.some(Boolean));
    const stops = PRESENCE_PATHS.voice.map((path, index) => onValue(ref(database, `trips_active/${orgId}/${tripId}/${path}/${uid}`), snapshot => {
        seen[index] = snapshot.val() === true; emit();
    }, () => { seen[index] = false; emit(); }));
    return () => stops.forEach(stop => stop());
}
