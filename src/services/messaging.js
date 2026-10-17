import { database, functions } from '../config/firebase';
import { ref, set, get, serverTimestamp, query, orderByChild, startAt, limitToLast } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { threadIdFor } from '../utils/messagingRules';
import { watchPath, watchQuery } from './sharedListeners';

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
        reports: `${base}/reports`,
        settings: `${base}/message_settings`,
        chat: `${base}/chat`,
        readPointers: `${base}/read_pointers`,
    };
}

// Subscribe to a path and hand back the raw value; returns the unsubscribe function.
// Screens asking for the same path share one listener.
function watch(path, cb, onError) {
    return watchPath(path, cb, onError);
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

// Report alerts, { reportId: { reporter, reported, threadId, at, staffThread? } } (staff only).
export const subscribeReports = (orgId, tripId, cb) => watch(paths(orgId, tripId).reports, (v) => cb(v || {}));
// App presence map { uid: true } for the trip.
export const subscribePresence = (orgId, tripId, cb) => watch(`${paths(orgId, tripId).base}/voice_channel/app_presence`, (v) => cb(v || {}));
// Newest n messages of a path as an array, oldest first.
export function subscribeLastMessages(path, n, cb) {
    return watchQuery(`${path}|last${n}`, () => query(ref(database, path), limitToLast(n)), (value) => {
        const v = value || {};
        cb(Object.keys(v).map((id) => ({ id, ...v[id] })));
    }, () => cb([]));
}
// One-off read of a thread document.
export async function getThread(orgId, tripId, threadId) {
    const snap = await get(ref(database, `${paths(orgId, tripId).threads}/${threadId}`));
    return snap.val();
}
// Group chat messages from others since my read pointer; same logic the Overview chat tile uses.
export function subscribeGroupUnread(orgId, tripId, uid, cb) {
    const p = paths(orgId, tripId);
    let unsubUnread = null;
    const unsubPointer = watchPath(`${p.readPointers}/${uid}`, (pointer) => {
        const lastRead = pointer || 0;
        if (unsubUnread) unsubUnread();
        unsubUnread = watchQuery(`${p.chat}|ts>=${lastRead + 1}`,
            () => query(ref(database, p.chat), orderByChild('timestamp'), startAt(lastRead + 1)), (chat) => {
                const list = chat ? Object.values(chat) : [];
                cb(list.filter((m) => m.sender_id !== uid).length);
            }, () => cb(0));
    }, () => cb(0));
    return () => { unsubPointer(); if (unsubUnread) unsubUnread(); };
}

// Callables (europe-west1 via the shared functions instance).
export async function sendRequest({ tripId, targetUid, text }) {
    const { data } = await httpsCallable(functions, 'sendMessageRequest')({ tripId, targetUid, text });
    return data;
}
export async function respondToRequest({ tripId, threadId, action }) {
    const { data } = await httpsCallable(functions, 'respondToMessageRequest')({ tripId, threadId, action });
    return data;
}
export async function openStaffChat({ tripId, targetUid }) {
    const { data } = await httpsCallable(functions, 'openStaffChat')({ tripId, targetUid });
    return data;
}
export async function reportStaffChat({ tripId, threadId }) {
    const { data } = await httpsCallable(functions, 'reportStaffChat')({ tripId, threadId });
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
