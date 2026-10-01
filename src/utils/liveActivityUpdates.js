export function isMissingLiveActivity(error) {
    const detail = `${error?.message || error || ''} ${error?.cause?.message || ''}`;
    return /can't find live activity|liveactivitynotfound/i.test(detail);
}

export async function updateLiveActivity(activity, data, activeRef, lastPayloadRef) {
    const payload = JSON.stringify(data);
    if (lastPayloadRef.current?.activity === activity && lastPayloadRef.current.payload === payload) return;
    const attempt = { activity, payload };
    lastPayloadRef.current = attempt;
    try {
        await activity.update(data);
    } catch (error) {
        // An older update must never clear a replacement activity or its cache.
        if (lastPayloadRef.current === attempt) lastPayloadRef.current = null;
        if (activeRef.current !== activity) return;
        if (isMissingLiveActivity(error)) {
            activeRef.current = null;
            return;
        }
        throw error;
    }
}
