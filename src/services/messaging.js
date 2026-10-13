import { database, functions } from '../config/firebase';
import { ref, onValue, set, get, serverTimestamp } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { threadIdFor } from '../utils/messagingRules';

export { threadIdFor };

// Every new database path lives here so screens never build them.
export function paths(orgId, tripId) {
    const base = `trips_active/${orgId}/${tripId}`;
    return {
        base,
        threads: `${base}/dm_threads`,
        dmMessages: `${base}/dm_messages`,
        dmPrivate: `${base}/dm_private`,
        team: `${base}/team`,
        teamMeta: `${base}/team_meta`,
        teamRead: `${base}/team_read`,
        staffChat: `${base}/staff_chat`,
        inbox: `${base}/inbox`,
        blocks: `${base}/blocks`,
        settings: `${base}/message_settings`,
        chat: `${base}/chat`,
        readPointers: `${base}/read_pointers`,
    };
}

// Subscribe to a path and hand back the raw value; returns the unsubscribe function.
function watch(path, cb, onError) {
    return onValue(ref(database, path), (snap) => cb(snap.val()), (err) => onError?.(err));
}

// Own inbox rows as { threadId: row }.
export const subscribeInbox = (orgId, tripId, uid, cb) => watch(`${paths(orgId, tripId).inbox}/${uid}`, (v) => cb(v || {}));
// One pilgrim's team_meta (null when no team messages yet).
export const subscribeTeamMeta = (orgId, tripId, pilgrimUid, cb) => watch(`${paths(orgId, tripId).teamMeta}/${pilgrimUid}`, cb);
// All team_meta rows keyed by pilgrim uid (staff only).
export const subscribeAllTeamMeta = (orgId, tripId, cb) => watch(paths(orgId, tripId).teamMeta, (v) => cb(v || {}));
// Thread document (members, status, requester).
export const subscribeThread = (orgId, tripId, threadId, cb) => watch(`${paths(orgId, tripId).threads}/${threadId}`, cb);
// People I have blocked, { uid: true }.
export const subscribeBlocks = (orgId, tripId, uid, cb) => watch(`${paths(orgId, tripId).blocks}/${uid}`, (v) => cb(v || {}));
// A staff member's team read pointers, { pilgrimUid: timestamp }.
export const subscribeTeamRead = (orgId, tripId, staffUid, cb) => watch(`${paths(orgId, tripId).teamRead}/${staffUid}`, (v) => cb(v || {}));

// Callables (europe-west1 via the shared functions instance).
export async function sendRequest({ tripId, targetUid, text }) {
    const { data } = await httpsCallable(functions, 'sendMessageRequest')({ tripId, targetUid, text });
    return data;
}
export async function respondToRequest({ tripId, threadId, action }) {
    const { data } = await httpsCallable(functions, 'respondToMessageRequest')({ tripId, threadId, action });
    return data;
}
export async function unblock({ tripId, uid }) {
    const { data } = await httpsCallable(functions, 'unblockParticipant')({ tripId, uid });
    return data;
}

// Clear my unread count; only when the row exists so rules never see a create.
export async function markInboxRead(orgId, tripId, uid, threadId) {
    const base = `${paths(orgId, tripId).inbox}/${uid}/${threadId}`;
    const snap = await get(ref(database, base));
    if (snap.exists() && snap.val()?.unread) await set(ref(database, `${base}/unread`), 0);
}

// Staff read pointer for one pilgrim's team thread.
export function markTeamRead(orgId, tripId, staffUid, pilgrimUid) {
    return set(ref(database, `${paths(orgId, tripId).teamRead}/${staffUid}/${pilgrimUid}`), serverTimestamp());
}

// Who may send me requests; missing node means members.
export async function getMessageSettings(orgId, tripId, uid) {
    const snap = await get(ref(database, `${paths(orgId, tripId).settings}/${uid}`));
    return { requests: 'members', ...(snap.val() || {}) };
}
export function setMessageSettings(orgId, tripId, uid, { requests }) {
    return set(ref(database, `${paths(orgId, tripId).settings}/${uid}`), { requests });
}

// Where a conversation's messages and read pointer live; readPointer null when unread comes from the inbox.
export function conversationPaths(orgId, tripId, conversation, uid) {
    const p = paths(orgId, tripId);
    const { kind, id } = conversation || {};
    switch (kind) {
        case 'dm': return { messages: `${p.dmMessages}/${id}`, readPointer: null };
        case 'team': return { messages: `${p.team}/${id}`, readPointer: `${p.teamRead}/${uid}/${id}` };
        case 'staff': return { messages: p.staffChat, readPointer: null };
        default: return { messages: p.chat, readPointer: `${p.readPointers}/${uid}` };
    }
}
