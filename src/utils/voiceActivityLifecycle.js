import { isMissingLiveActivity } from './liveActivityUpdates';

// ActivityKit instances survive the JS process. Always enumerate native state,
// and invalidate pending starts before waiting for any asynchronous teardown.
export function createVoiceActivityLifecycle(factory, activeRef, dataRef, payloadRef, warn = console.warn) {
    let generation = 0;
    const dismiss = async () => {
        const held = activeRef.current;
        activeRef.current = null;
        dataRef.current = null;
        payloadRef.current = null;
        let instances = [];
        try { instances = factory.getInstances(); } catch (error) { warn('Live Activity lookup failed:', error); }
        const byId = new Map();
        for (const activity of [held, ...instances]) {
            if (activity) byId.set(activity.id || activity, activity);
        }
        await Promise.all([...byId.values()].map(async activity => {
            try { await activity.end('immediate'); }
            catch (error) { if (!isMissingLiveActivity(error)) warn('Live Activity dismissal failed:', error); }
        }));
    };
    return {
        begin() { return ++generation; },
        isCurrent(ticket) { return ticket === generation; },
        end() {
            generation++;
            return dismiss();
        },
        async start(ticket, data, url) {
            if (ticket !== generation) return null;
            // End orphans/duplicates rather than adopting a previous voice session.
            await dismiss();
            if (ticket !== generation) return null;
            const activity = factory.start(data, url);
            activeRef.current = activity;
            dataRef.current = data;
            return activity;
        },
    };
}
