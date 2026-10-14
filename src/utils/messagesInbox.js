// Pure helpers for the Messages inbox screens.

// Name and photo of an inbox row's peer: the masked people list when loaded, else the server-masked peer_name.
export function peerShown(row, people) {
    const person = (people || []).find((p) => p.id === row?.peer);
    if (row?.staff && person?.staffName) return { name: person.staffName, image: person.staffImage || '' };
    return { name: (person && person.name) || row?.peer_name || '', image: (person && person.image) || '' };
}

// Same test the chat screen uses for its system lines (voice chat started, joined, ...).
export const isSystemLine = (m) => m?.type === 'system' && m?.sender_id === 'system';

// The last n real messages for a group row preview; only when there are none, the latest system line.
export function previewMessages(messages, n = 2) {
    const list = messages || [];
    const real = list.filter((m) => !isSystemLine(m));
    if (real.length) return real.slice(-n);
    return list.slice(-1);
}

export function initialsOf(name) {
    return String(name || '?').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

const pad = (n) => String(n).padStart(2, '0');

// Today as HH:MM, yesterday as the given label, within a week as a weekday, else dd/mm.
export function formatInboxTime(ts, now = Date.now(), yesterdayLabel = 'Yesterday') {
    if (!ts) return '';
    const d = new Date(ts);
    const n = new Date(now);
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(n) - startOf(d)) / 86400000);
    if (days <= 0) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (days === 1) return yesterdayLabel;
    if (days < 7) return d.toLocaleDateString('en', { weekday: 'short' });
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

// Staff only: one unread per team thread whose last message is from the pilgrim and newer than my read pointer.
export function teamUnreadCount(metaMap, readMap, myUid) {
    let n = 0;
    for (const [pilgrimUid, meta] of Object.entries(metaMap || {})) {
        if (!meta?.last_at || meta.last_sender_id === myUid) continue;
        if (meta.last_at > ((readMap || {})[pilgrimUid] || 0)) n += 1;
    }
    return n;
}

// Staff inbox rows from team_meta, newest first, each with its unread flag.
export function buildStaffRows(metaMap, readMap, myUid) {
    return Object.entries(metaMap || {})
        .filter(([, meta]) => meta?.last_at)
        .map(([pilgrimUid, meta]) => ({
            pilgrimUid,
            meta,
            unread: meta.last_sender_id !== myUid && meta.last_at > ((readMap || {})[pilgrimUid] || 0) ? 1 : 0,
        }))
        .sort((a, b) => b.meta.last_at - a.meta.last_at);
}

// Staff filter: all, unread or reports (reports hide thread rows).
export function filterStaffRows(rows, filter) {
    if (filter === 'unread') return rows.filter((r) => r.unread > 0);
    if (filter === 'reports') return [];
    return rows;
}

// Reports newest first.
export function sortReports(reportsMap) {
    return Object.entries(reportsMap || {})
        .map(([id, r]) => ({ id, ...r }))
        .sort((a, b) => (b.at || 0) - (a.at || 0));
}

// Reports this staff member may open: a reported private staff chat is for Admins only, and never for the staff member it names.
export function reportsFor(reports, myUid, myRole) {
    return (reports || []).filter((r) => !r.staffThread || (String(myRole).toLowerCase() === 'admin' && r.reported !== myUid));
}

// A staff member's own private chats from their inbox rows, by the same all and unread filters.
export function filterStaffChats(rows, filter) {
    const chats = (rows || []).filter((r) => r.staff);
    if (filter === 'unread') return chats.filter((r) => r.unread > 0);
    if (filter === 'reports') return [];
    return chats;
}

// Inbox rows as an array with their thread id, split by kind.
export function splitInbox(inbox) {
    const rows = Object.entries(inbox || {}).map(([threadId, row]) => ({ threadId, ...row }));
    return {
        chats: rows.filter((r) => r.kind === 'dm' || r.kind === 'request_out'),
        requests: rows.filter((r) => r.kind === 'request_in').sort((a, b) => (b.last_at || 0) - (a.last_at || 0)),
        declined: rows.filter((r) => r.kind === 'declined').sort((a, b) => (b.last_at || 0) - (a.last_at || 0)),
    };
}

// t() has no interpolation: replace {key} placeholders.
export function fill(str, vars = {}) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}
