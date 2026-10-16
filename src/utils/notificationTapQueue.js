// Holds notification taps until navigation is ready and handles each notification once.
// No native dependencies.
const WINDOW = 30000;

function createTapQueue({ isReady, navigate, now = Date.now }) {
    const seen = new Map();
    const pending = [];

    const keyOf = (item) => item.notificationId || item.messageId || item.id || JSON.stringify(item);

    const claim = (item) => {
        const key = keyOf(item);
        const t = now();
        for (const [id, time] of seen) if (t - time > WINDOW) seen.delete(id);
        if (seen.has(key)) return false;
        seen.set(key, t);
        return true;
    };

    const flush = async () => {
        if (!isReady()) return;
        while (pending.length) {
            const item = pending.shift();
            try { await navigate(item); } catch (e) { console.warn('[NotificationTap] Navigation failed:', e); }
        }
    };

    const enqueue = async (item) => {
        if (!item || !claim(item)) return;
        pending.push(item);
        await flush();
    };

    return { enqueue, flush, pendingCount: () => pending.length };
}

module.exports = { createTapQueue };
