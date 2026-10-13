import { threadIdFor } from './messagingRules';

// Pure: where a messaging notification (in-app item or push data) opens, without the trip. Returns { route, params } or null.
export function messagingNotificationTarget(type, item, viewerUid) {
    const d = { ...(item?.data || {}), ...(item || {}) };
    const senderUid = d.senderUid || d.sender_id || d.senderId || d.fromUid;
    const name = d.name || undefined;
    const avatar = d.senderImage || undefined;
    switch (type) {
        case 'dm_request': {
            const threadId = d.conversationId || (senderUid && viewerUid ? threadIdFor(viewerUid, senderUid) : null);
            if (!threadId || !senderUid) return { route: 'MessageRequests', params: {} };
            return { route: 'RequestReview', params: { threadId, peerUid: senderUid, name, avatar } };
        }
        case 'dm_message': {
            const id = d.conversationId || (senderUid && viewerUid ? threadIdFor(viewerUid, senderUid) : null);
            if (!id) return { route: 'Messages', params: {} };
            return { route: 'TripChat', params: { conversation: { kind: 'dm', id, title: name, avatar, peerUid: senderUid } } };
        }
        case 'team_message': {
            // A pilgrim's thread is keyed by the pilgrim; staff get it as the conversation id, a pilgrim falls back to their own.
            const id = d.conversationId || viewerUid;
            if (!id) return { route: 'Messages', params: {} };
            const mine = id === viewerUid;
            return { route: 'TripChat', params: { conversation: { kind: 'team', id, title: mine ? 'Journey team' : name } } };
        }
        case 'staff_chat':
            return { route: 'TripChat', params: { conversation: { kind: 'staff', id: 'staff', title: 'Staff chat' } } };
        case 'message_report':
            return { route: 'Messages', params: { filter: 'reports' } };
        default:
            return null;
    }
}
