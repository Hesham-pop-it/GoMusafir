// Shared by push delivery and live database banners. No native dependencies.
const listeners = new Set();
const recent = new Map();
const WINDOW = 30000;
function normalizeNotification(remote) {
    const data = remote.data || {};
    return { ...data, id: data.notificationId || data.messageId || data.id || remote.messageId || `push-${Date.now()}`,
        _pushOnly: !data.notificationId && !data.id,
        title: remote.notification?.title || data.title || data.name || 'GoMusāfir',
        message: remote.notification?.body || data.body || data.message || 'You have a new update.',
        tripId: data.tripId || data.trip_id, orgId: data.orgId || data.org_id,
        isUserGlobal: data.isUserGlobal === true || data.isUserGlobal === 'true',
        type: data.type || 'notification', _source: 'push' };
}
function claimNotification(item, source = 'database', now = Date.now()) {
    for (const [key, value] of recent) if (now - value.time > WINDOW) recent.delete(key);
    const id = item.notificationId || item.messageId || item.id;
    const identity = id ? `id:${id}` : null;
    const fingerprint = JSON.stringify([item.type, item.tripId || '', item.title || '', item.message || '']);
    if (identity && recent.has(identity)) return false;
    const previous = recent.get(fingerprint);
    // Legacy pushes lack the database ID. Only match across delivery sources,
    // so two separate chat messages with identical text can still be shown.
    if (previous && previous.source !== source && (item._pushOnly || previous.legacy)) {
        recent.delete(fingerprint);
        if (identity) recent.set(identity, { time: now, source });
        return false;
    }
    const record = { time: now, source, legacy: !!item._pushOnly };
    if (identity) recent.set(identity, record);
    recent.set(fingerprint, record);
    return true;
}
function publishForegroundNotification(remote) {
    const item = normalizeNotification(remote);
    for (const listener of listeners) listener(item);
}
function subscribeForegroundNotifications(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
function resetNotificationPresentation() { recent.clear(); }
module.exports = { normalizeNotification, claimNotification, publishForegroundNotification,
    subscribeForegroundNotifications, resetNotificationPresentation };
