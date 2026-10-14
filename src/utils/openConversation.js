import { detailButtonFor, threadIdFor } from './messagingRules';

// Pure: what opening a conversation with `target` should do. Returns { route, params } without the trip, or null.
// target: { id, name, image, isStaff, nameVisible }; inbox: { threadId: row }.
export function decideOpen({ viewerUid, viewerIsStaff, target, inbox }) {
    if (!target?.id || !viewerUid) return null;
    const threadId = threadIdFor(viewerUid, target.id);
    const inboxRow = (inbox || {})[threadId];
    const button = detailButtonFor({
        viewerIsStaff: !!viewerIsStaff,
        targetIsStaff: !!target.isStaff,
        isSelf: target.id === viewerUid,
        inboxRow,
        nameVisible: !!target.nameVisible,
    });
    const dm = (pending) => ({
        route: 'TripChat',
        params: { conversation: { kind: 'dm', id: threadId, title: target.name, avatar: target.image, peerUid: target.id, ...(pending ? { pending: true } : {}) } },
    });
    switch (button) {
        case 'team': return { route: 'TripChat', params: { conversation: { kind: 'team', id: viewerUid, title: 'Journey team' } } };
        case 'message_staff': return { route: 'TripChat', params: { conversation: { kind: 'team', id: target.id, title: target.name } } };
        case 'open_chat': return dm(false);
        case 'waiting': return dm(true);
        // A pending request is always reviewed by its recipient, never opened as a locked chat.
        case 'accept': return { route: 'RequestReview', params: { threadId, peerUid: target.id, name: target.name, avatar: target.image } };
        case 'request': return { route: 'ComposeRequest', params: { targetUid: target.id, name: target.name, avatar: target.image } };
        default: return null;
    }
}

// Navigate for decideOpen's result; returns whether anything was opened.
export function openConversation(navigation, trip, args) {
    const decision = decideOpen(args);
    if (!decision) return false;
    navigation.navigate(decision.route, { trip, ...decision.params });
    return true;
}

// Journey team thread of the viewing pilgrim.
export const teamConversation = (viewerUid, title = 'Journey team') => ({ kind: 'team', id: viewerUid, title });

// Pure: the TripChat conversation for a private chat between a pilgrim and one staff member.
export const staffPrivateConversation = (viewerUid, target) => ({
    kind: 'dm', id: threadIdFor(viewerUid, target.id), title: target.name, avatar: target.image, peerUid: target.id, staff: true,
});

// Create or find the private chat on the server, then open it. `openChat` is the openStaffChat callable.
export async function openStaffPrivate(navigation, trip, { viewerUid, target, openChat }) {
    await openChat({ tripId: trip?.id || trip?.tripId, targetUid: target.id });
    navigation.navigate('TripChat', { trip, conversation: staffPrivateConversation(viewerUid, target) });
}
