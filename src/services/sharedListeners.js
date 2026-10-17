import { onValue, ref } from 'firebase/database';
import { database } from '../config/firebase';

// One database listener per path or query, however many screens ask for it. The
// listener opens on the first subscriber and closes shortly after the last one
// leaves (the short delay keeps a screen swap from closing and reopening it).
// Late subscribers get the latest value at once instead of a second download.
export const LINGER_MS = 2000;

export function createSharedListeners(attach, { linger = LINGER_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    const entries = new Map();
    const deliver = (entry, pick, value) => {
        for (const sub of [...entry.subs]) {
            try { sub[pick]?.(value); } catch (error) { console.warn('[sharedListeners] subscriber failed:', error?.message); }
        }
    };
    const close = (key, entry) => {
        if (entries.get(key) !== entry || entry.subs.size) return;
        entries.delete(key);
        entry.detach?.();
    };
    function watch(key, make, onValueCb, onError) {
        let entry = entries.get(key);
        const sub = { onValue: onValueCb, onError };
        if (entry) {
            clearTimer(entry.timer);
            entry.timer = null;
            entry.subs.add(sub);
            if (entry.has) onValueCb(entry.value);
        } else {
            entry = { subs: new Set([sub]), has: false, value: undefined, timer: null, detach: null };
            entries.set(key, entry);
            const mine = entry;
            mine.detach = attach(key, make, value => {
                mine.has = true;
                mine.value = value;
                deliver(mine, 'onValue', value);
            }, error => {
                // A cancelled listener is dead; let the next subscriber open a new one.
                if (entries.get(key) === mine) entries.delete(key);
                deliver(mine, 'onError', error);
            });
        }
        const mine = entry;
        let left = false;
        return () => {
            if (left) return;
            left = true;
            mine.subs.delete(sub);
            if (mine.subs.size) return;
            if (!linger) close(key, mine);
            else mine.timer = setTimer(() => close(key, mine), linger);
        };
    }
    return { watch, size: () => entries.size };
}

const shared = createSharedListeners((key, make, onVal, onError) =>
    onValue(make(), snap => onVal(snap.val()), onError));

// Shared listener on a path; the callback gets the raw value (null when empty).
export function watchPath(path, cb, onError) {
    return shared.watch(path, () => ref(database, path), cb, onError);
}

// Shared listener on a query; `key` must name the path and every constraint.
export function watchQuery(key, makeQuery, cb, onError) {
    return shared.watch(key, makeQuery, cb, onError);
}
