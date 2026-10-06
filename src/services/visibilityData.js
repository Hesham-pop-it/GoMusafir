import { useEffect, useState } from 'react';
import { get, onValue } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../config/firebase';

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
async function load(request) {
    const uid = auth.currentUser?.uid;
    if (!uid || (!request.tripId && request.section !== 'account')) throw new Error('An active trip is required to view participant data.');
    if (request.section === 'account' && request.path.split('/')[1] !== uid) throw new Error('A trip is required for another participant.');
    const key = `${uid}:${request.tripId}:${request.section}`;
    if (!inFlight.has(key)) {
        const pending = (request.section === 'account'
            ? httpsCallable(functions, 'getOwnAccount')({})
            : httpsCallable(functions, 'getVisibleTripData')({ tripId: request.tripId, section: request.section }))
            .then(result => {
                if (auth.currentUser?.uid !== uid) throw new Error('Account changed.');
                return result.data;
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
export function onVisibleValue(target, tripId, callback, onError = () => {}) {
    const request = resolve(target, tripId);
    if (!request) return onValue(target, callback, onError);
    const uid = auth.currentUser?.uid;
    const key = `${uid}:${request.tripId}:${request.section}`;
    let group = subscriptions.get(key);
    if (!group) {
        group = { clients: new Set(), timer: null, stopped: false };
        subscriptions.set(key, group);
        const poll = async () => {
            try {
                const data = await load(request);
                if (!group.stopped && auth.currentUser?.uid === uid) {
                    for (const client of group.clients) {
                        const next = select(data, client.request);
                        const signature = JSON.stringify(next.val());
                        if (client.signature !== signature) { client.signature = signature; client.callback(next); }
                    }
                }
            } catch (error) {
                // Access loss must clear old coordinates/profile data, never retain it.
                if (!group.stopped && auth.currentUser?.uid === uid) {
                    for (const client of group.clients) { client.signature = undefined; client.callback(snapshot(null)); client.onError(error); }
                }
            } finally {
                if (!group.stopped && auth.currentUser?.uid === uid) group.timer = setTimeout(poll, 4000);
            }
        };
        group.timer = setTimeout(poll, 0);
    }
    const client = { request, callback, onError };
    group.clients.add(client);
    const stop = () => {
        group.clients.delete(client);
        listeners.get(request.path)?.delete(stop);
        if (!group.clients.size) {
            group.stopped = true;
            clearTimeout(group.timer);
            subscriptions.delete(key);
        }
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
// and clear cached display names after permissions are revoked.
export function useVisibilityRevision(tripId) {
    const [revision, setRevision] = useState('');
    useEffect(() => {
        if (!tripId) { setRevision(''); return; }
        let stopped = false, timer;
        const poll = async () => {
            try {
                const data = await load({ tripId, section: 'directory' });
                if (!stopped) setRevision(JSON.stringify(data.users));
            } catch (_) { if (!stopped) setRevision('unavailable'); }
            if (!stopped) timer = setTimeout(poll, 4000);
        };
        poll();
        return () => { stopped = true; clearTimeout(timer); };
    }, [tripId, auth.currentUser?.uid]);
    return revision;
}
