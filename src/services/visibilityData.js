import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { get, onValue, ref } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { auth, database, functions } from '../config/firebase';

// Directory entries finish parallel server reads in an arbitrary order. Compare
// JSON values by content so unchanged polls do not rebuild screens or close
// participant details. Array order remains meaningful (for example chat lists).
function visibilitySignature(value) {
    return JSON.stringify(value, (_, entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        return Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]));
    });
}

const inFlight = new Map();
const listeners = new Map();
const subscriptions = new Map();
const pathOf = target => decodeURIComponent(new URL(target.toString()).pathname).replace(/^\//, '');
const snapshot = (value, key = null) => ({
    key, val: () => value ?? null, exists: () => value !== null && value !== undefined,
    child: path => snapshot(path.split('/').reduce((v, key) => v?.[key], value), path.split('/').pop()),
    forEach: callback => { for (const [key, child] of Object.entries(value || {})) if (callback(snapshot(child, key)) === true) return true; return false; },
    size: Object.keys(value || {}).length,
});
function resolve(target, tripId) {
    const path = pathOf(target);
    if (path.startsWith('users/')) return { path, tripId, section: tripId ? 'directory' : 'account' };
    const parts = path.split('/');
    if (parts[0] !== 'trips_active') return null;
    const section = { locations: 'directory', location_permissions: 'directory', chat: 'chat', voice_channel: 'voice', notifications: 'notifications' }[parts[3]];
    return section ? { path, tripId: parts[2], section } : null;
}
function select(data, request) {
    const parts = request.path.split('/');
    const keys = request.section === 'account' ? parts.slice(2) : parts[0] === 'users' ? parts : request.section === 'directory' ? parts.slice(3) : parts.slice(request.section === 'notifications' ? 5 : 4);
    return snapshot(keys.reduce((value, key) => value?.[key], data), parts.at(-1));
}
// A group passes the hash of the data it holds; the server then answers an
// unchanged poll with the hash only. Servers without hash support return plain data.
async function load(request, group = null) {
    const uid = auth.currentUser?.uid;
    if (!uid || (!request.tripId && request.section !== 'account')) throw new Error('An active trip is required to view participant data.');
    if (request.section === 'account' && request.path.split('/')[1] !== uid) throw new Error('A trip is required for another participant.');
    const key = `${uid}:${request.tripId}:${request.section}${group ? ':group' : ''}`;
    if (!inFlight.has(key)) {
        const known = group ? { knownHash: group.hash || '' } : {};
        const pending = (request.section === 'account'
            ? httpsCallable(functions, 'getOwnAccount')(known)
            : httpsCallable(functions, 'getVisibleTripData')({ tripId: request.tripId, section: request.section, ...known }))
            .then(result => {
                if (auth.currentUser?.uid !== uid) throw new Error('Account changed.');
                const data = result.data;
                if (!group || data?.envelope !== 1) return data;
                if (!data.unchanged) { group.data = data.data; group.hash = data.hash; }
                return group.data;
            }).finally(() => { if (inFlight.get(key) === pending) inFlight.delete(key); });
        inFlight.set(key, pending);
    }
    return inFlight.get(key);
}
export async function getVisibleSnapshot(target, tripId) {
    const request = resolve(target, tripId);
    if (!request) return get(target);
    return select(await load(request), request);
}
// iOS/Android can suspend networking in the background. Screen-data polling
// follows app visibility; location tracking is managed by its own native service.
function startForegroundPolling(task, intervalMs = 4000) {
    let stopped = false, timer = null, revision = 0, running = false, again = false;
    let state = AppState.currentState;
    const active = () => !state || state === 'active';
    const poll = async () => {
        if (stopped || !active()) return;
        const started = revision;
        const isCurrent = () => !stopped && active() && revision === started;
        running = true; again = false;
        try { await task(isCurrent); }
        finally {
            running = false;
            if (isCurrent()) timer = setTimeout(poll, again ? 0 : intervalMs);
        }
    };
    const subscription = AppState.addEventListener('change', next => {
        if (next === state) return;
        state = next;
        revision += 1;
        clearTimeout(timer);
        if (active()) timer = setTimeout(poll, 0);
    });
    if (active()) timer = setTimeout(poll, 0);
    const stop = () => {
        stopped = true;
        revision += 1;
        clearTimeout(timer);
        subscription.remove();
    };
    // Poll as soon as possible; a poll already running is followed by one more.
    stop.now = () => {
        if (stopped || !active()) return;
        if (running) { again = true; return; }
        clearTimeout(timer);
        timer = setTimeout(poll, 0);
    };
    return stop;
}
// Chat is fetched when the server-written chat signal moves, when the
// directory changes (names in messages follow privacy choices), and as a
// slow fallback in case a signal is missed.
const CHAT_FALLBACK_MS = 30000;
function watchChatSignal(group, uid, request, orgId) {
    let last;
    return onValue(ref(database, `trips_active/${orgId}/${request.tripId}/chat_signal`), signal => {
        const next = signal.val();
        if (last !== undefined && next !== last && auth.currentUser?.uid === uid) group.stopPolling?.now();
        last = next;
    }, () => {});
}
function subscribe(request, client) {
    const uid = auth.currentUser?.uid;
    const key = `${uid}:${request.tripId}:${request.section}`;
    let group = subscriptions.get(key);
    if (!group) {
        group = { clients: new Set(), stopPolling: null, stopped: false, hash: null, data: undefined };
        subscriptions.set(key, group);
        const poll = async isCurrent => {
            try {
                const data = await load(request, group);
                if (isCurrent() && !group.stopped && auth.currentUser?.uid === uid) {
                    for (const client of group.clients) {
                        const next = select(data, client.request);
                        const signature = visibilitySignature(next.val());
                        if (client.signature !== signature) { client.signature = signature; client.callback(next); }
                    }
                    if (request.section === 'directory') {
                        const people = visibilitySignature(data?.users);
                        if (group.people !== undefined && group.people !== people) subscriptions.get(`${uid}:${request.tripId}:chat`)?.stopPolling?.now();
                        group.people = people;
                    }
                }
            } catch (error) {
                // Access loss must clear old coordinates/profile data, never retain it.
                if (isCurrent() && !group.stopped && auth.currentUser?.uid === uid) {
                    group.hash = null; group.data = undefined; group.people = undefined;
                    for (const client of group.clients) { client.signature = undefined; client.callback(snapshot(null)); client.onError(error); }
                }
            }
        };
        const chat = request.section === 'chat' && request.path.split('/')[1];
        group.stopPolling = startForegroundPolling(poll, chat ? CHAT_FALLBACK_MS : 4000);
        if (chat) group.stopSignal = watchChatSignal(group, uid, request, chat);
    } else {
        // A screen joining a running group gets data now, not after the next interval.
        group.stopPolling.now();
    }
    group.clients.add(client);
    return () => {
        if (!group.clients.delete(client) || group.clients.size) return;
        group.stopped = true;
        group.stopPolling();
        group.stopSignal?.();
        if (subscriptions.get(key) === group) subscriptions.delete(key);
    };
}
export function onVisibleValue(target, tripId, callback, onError = () => {}) {
    const request = resolve(target, tripId);
    if (!request) return onValue(target, callback, onError);
    const unsubscribe = subscribe(request, { request, callback, onError });
    const stop = () => {
        unsubscribe();
        listeners.get(request.path)?.delete(stop);
    };
    if (!listeners.has(request.path)) listeners.set(request.path, new Set());
    listeners.get(request.path).add(stop);
    return stop;
}
export function offVisible(target) {
    for (const stop of [...(listeners.get(pathOf(target)) || [])]) stop();
}
export const requestParticipantLocation = (tripId, targetUid) => httpsCallable(functions, 'requestParticipantLocation')({ tripId, targetUid });
export const respondToLocationRequest = (tripId, notificationId, accept) => httpsCallable(functions, 'respondToLocationRequest')({ tripId, notificationId, accept });
export const isLocationGrantActive = grant => Boolean(grant && typeof grant === 'object' && grant.acceptedAt > 0 && grant.expiresAt > Date.now());

// Re-fetch one-shot profile consumers when a participant changes a custom choice,
// and clear cached display names after permissions are revoked. Shares the
// screen's directory poll instead of starting one per caller.
export function useVisibilityRevision(tripId) {
    const [revision, setRevision] = useState('');
    useEffect(() => {
        if (!tripId) { setRevision(''); return; }
        const request = { path: 'users', tripId, section: 'directory' };
        return subscribe(request, { request,
            callback: users => setRevision(visibilitySignature(users.val())),
            onError: () => setRevision('unavailable') });
    }, [tripId, auth.currentUser?.uid]);
    return revision;
}
