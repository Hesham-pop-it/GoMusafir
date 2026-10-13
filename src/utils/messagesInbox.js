// Pure helpers for the Messages inbox screens.

// Name and photo of an inbox row's peer: the masked people list when loaded, else the server-masked peer_name.
export function peerShown(row, people) {
    const person = (people || []).find((p) => p.id === row?.peer);
    return { name: (person && person.name) || row?.peer_name || '', image: (person && person.image) || '' };
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
