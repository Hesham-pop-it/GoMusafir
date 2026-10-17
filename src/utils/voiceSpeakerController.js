// Keep microphone intent separate from permission and hardware state. A released
// hold must never open the microphone when a delayed slot grant arrives.
export function createVoiceSpeakerController({ send, setMicrophone, onMuted, onIntent, onError,
    participantSid, makeRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}` }) {
    let wanted = false, closed = false, requestId = null, seen = false;
    let entry = null, permission = false, sending = false, micBusy = false;
    let actualMic = false, revision = 0, sentRevision = 0, retryTimer;

    const syncMicrophone = async () => {
        if (micBusy) return;
        micBusy = true;
        try {
            for (;;) {
                const enabled = !closed && wanted && permission && entry?.requestId === requestId &&
                    entry?.sid === participantSid && entry.status === 'granted';
                if (actualMic === enabled) break;
                await setMicrophone(enabled);
                actualMic = enabled;
                onMuted(!enabled || !wanted || closed);
            }
        } catch (error) {
            wanted = false;
            revision++;
            onIntent(false);
            onMuted(true);
            onError(error);
            // A failed enable may have partially opened the device.
            await setMicrophone(false).catch(() => {});
            actualMic = false;
            flush();
        } finally { micBusy = false; }
    };

    const flush = async () => {
        if (sending || !requestId) return;
        clearTimeout(retryTimer);
        sending = true;
        try {
            while (sentRevision !== revision) {
                const version = revision;
                const action = wanted && !closed ? 'request' : 'release';
                try {
                    await send({ action, requestId, participantSid });
                    sentRevision = version;
                } catch (error) {
                    if (action === 'request' && wanted && version === revision) {
                        wanted = false;
                        revision++;
                        onIntent(false);
                        onMuted(true);
                        onError(error);
                        syncMicrophone();
                    }
                    // Release is idempotent, including a request committed before
                    // its response was lost. Retain it across transient failures.
                    if (!String(error.code || '').includes('failed-precondition') &&
                        !String(error.code || '').includes('permission-denied') &&
                        !String(error.code || '').includes('unauthenticated')) {
                        retryTimer = setTimeout(flush, 1500);
                    } else sentRevision = revision;
                    break;
                }
            }
        } finally { sending = false; }
    };

    return {
        setMuted(muted) {
            if (closed || wanted === !muted) return;
            wanted = !muted;
            if (wanted) {
                requestId = makeRequestId();
                seen = false;
                entry = null;
            }
            revision++;
            onIntent(wanted);
            if (muted) onMuted(true);
            syncMicrophone();
            flush();
        },
        updateState(state, uid) {
            entry = state?.entries?.[uid] || null;
            if (entry?.requestId === requestId && entry?.sid === participantSid) seen = true;
            else if (seen && wanted) {
                wanted = false;
                revision++;
                onIntent(false);
                onMuted(true);
                flush();
            }
            syncMicrophone();
        },
        updatePermission(canPublish) {
            permission = canPublish === true;
            syncMicrophone();
        },
        dispose() {
            closed = true;
            wanted = false;
            revision++;
            onIntent(false);
            onMuted(true);
            syncMicrophone();
            flush();
        },
    };
}
