// Merges chat message lists by id. No native dependencies.
const stamp = (m) => {
    const t = m.rawTimestamp ?? m.timestamp;
    return typeof t === 'number' && !isNaN(t) ? t : 0;
};

/**
 * Merges two message lists by id and returns them newest first (the order the inverted chat list uses).
 * For a duplicate id the newer timestamp wins; on a tie the entry from `preferred` wins.
 */
function mergeMessages(base = [], preferred = []) {
    const byId = new Map();
    for (const m of base) if (m && m.id != null) byId.set(m.id, m);
    for (const m of preferred) {
        if (!m || m.id == null) continue;
        const existing = byId.get(m.id);
        if (!existing || stamp(m) >= stamp(existing)) byId.set(m.id, existing ? { ...existing, ...m } : m);
    }
    return [...byId.values()].sort((a, b) => stamp(b) - stamp(a) || String(b.id).localeCompare(String(a.id)));
}

module.exports = { mergeMessages };
