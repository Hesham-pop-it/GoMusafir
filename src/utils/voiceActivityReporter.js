// Reports what the voice room is doing, from a person who can speak, and only
// when it changes. Brief activity is kept until it has been sent, so a fast
// unmute/mute cannot disappear between network requests.
export function createActivityReporter({ room, send, canReport, isConnected, warn = console.warn }) {
    let disposed = false, busy = false, queued = false, activitySeen = false, lastSent;
    const observe = () => {
        const participants = [room.localParticipant, ...room.remoteParticipants.values()];
        activitySeen = activitySeen || participants.some(p => p.isMicrophoneEnabled || p.isSpeaking);
        return activitySeen;
    };
    // `lowered` is set when someone muted or left: the last report may have come
    // from them, so a quiet room is re-sent even when it matches the last report.
    const flush = async (lowered = false) => {
        if (disposed || busy || !isConnected() || !canReport()) return;
        const activity = observe();
        if (activity === lastSent && !(lowered && !activity)) { activitySeen = false; return; }
        busy = true; queued = false; activitySeen = false;
        try {
            await send(activity);
            lastSent = activity;
            if (activity) queued = true;
        } catch (e) {
            if (disposed || !isConnected()) return;
            activitySeen = activitySeen || activity;
            queued = false; // Retry on the timer, not in a tight loop during session transitions.
            warn('[Voice inactivity] Activity report failed:', e.code);
        } finally {
            busy = false;
            if (queued && !disposed) flush();
        }
    };
    return {
        changed: () => flush(false),
        lowered: () => flush(true),
        unmuted: () => { activitySeen = true; flush(false); },
        reconnected: () => { lastSent = undefined; flush(false); },
        dispose: () => { disposed = true; },
    };
}
