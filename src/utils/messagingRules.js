// Pure helpers for direct messaging. The server decides; these only drive UI state.
export function threadIdFor(a, b) {
    return [a, b].sort().join('_');
}

// UI hint for whether a request can be started; mirrors the server eligibility check.
export function canRequest({ viewerIsStaff, targetIsStaff, isSelf, nameVisible, blocked }) {
    return !isSelf && !viewerIsStaff && !targetIsStaff && !!nameVisible && !blocked;
}

// Which button the participant detail shows, or null for none.
export function detailButtonFor({ viewerIsStaff, targetIsStaff, isSelf, inboxRow, nameVisible }) {
    if (isSelf) return null;
    if (viewerIsStaff) return targetIsStaff ? null : 'message_staff';
    if (targetIsStaff) return 'team';
    if (!nameVisible) return null;
    switch (inboxRow?.kind) {
        case 'dm': return 'open_chat';
        case 'request_out': return 'waiting';
        case 'request_in':
        case 'declined': return 'accept';
        default: return 'request';
    }
}

// Newest last_at first; ties keep their original order.
export function inboxSort(rows) {
    return (rows || [])
        .map((row, i) => ({ row, i }))
        .sort((x, y) => (y.row?.last_at || 0) - (x.row?.last_at || 0) || x.i - y.i)
        .map(({ row }) => row);
}

// Tab badge: group + team + inbox; an incoming request counts at least 1, declined never.
export function totalUnread({ groupUnread = 0, inboxRows = [], teamUnread = 0 } = {}) {
    let sum = (groupUnread || 0) + (teamUnread || 0);
    for (const row of inboxRows || []) {
        const unread = row?.unread || 0;
        if (row?.kind === 'request_in') sum += Math.max(1, unread);
        else if (row?.kind !== 'declined') sum += unread;
    }
    return sum;
}

// Staff view of one team_meta row: needs a reply, or who replied.
export function teamRowState(meta, myUid) {
    if (!meta || !meta.last_at) return { state: 'none', repliedBy: null, role: null };
    if (meta.needs_reply) return { state: 'needs_reply', repliedBy: null, role: null };
    const repliedBy = meta.replied_by_uid && meta.replied_by_uid === myUid ? 'you' : (meta.replied_by || null);
    return { state: 'replied', repliedBy, role: meta.replied_role || null };
}
