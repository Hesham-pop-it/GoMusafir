import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { get, limitToLast, onValue, query, ref } from 'firebase/database';
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
    const section = { locations: 'directory', location_permissions: 'directory', chat: 'chat', notifications: 'notifications' }[parts[3]];
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
        const known = !group ? {} : request.section === 'directory' ? { knownParts: group.parts || {} } : { knownHash: group.hash || '' };
        const pending = (request.section === 'account'
            ? httpsCallable(functions, 'getOwnAccount')(known)
            : httpsCallable(functions, 'getVisibleTripData')({ tripId: request.tripId, section: request.section, ...known }))
            .then(result => {
                if (auth.currentUser?.uid !== uid) throw new Error('Account changed.');
                const data = result.data;
                if (!group || data?.envelope !== 1) return data;
                if (data.parts) {
                    // Keys the server left out are unchanged; keys it no longer lists are gone.
                    if (!data.unchanged) group.data = Object.fromEntries(Object.keys(data.parts)
                        .map(part => [part, part in data.data ? data.data[part] : group.data?.[part]]));
                    group.parts = data.parts;
                } else if (!data.unchanged) { group.data = data.data; group.hash = data.hash; }
                return group.data;
            }).finally(() => { if (inFlight.get(key) === pending) inFlight.delete(key); });
        inFlight.set(key, pending);
    }
    return inFlight.get(key);
}
// One person's directory entry: the staff view (staff, or one's own entry), else
// the member view. Null when the trip has no view yet.
async function viewEntry(tripId, person) {
    const staffEntry = await get(ref(database, `trip_view/${tripId}/staff/${person}`)).then(snap => snap.val(), () => null);
    if (staffEntry) return staffEntry;
    return get(ref(database, `trip_view/${tripId}/member/${person}`)).then(snap => snap.val(), () => null);
}
export async function getVisibleSnapshot(target, tripId) {
    const request = resolve(target, tripId);
    if (!request) return get(target);
    if (request.section === 'directory' && request.path.startsWith('users/')) {
        const held = subscriptions.get(`${auth.currentUser?.uid}:${request.tripId}:directory`)?.last;
        if (held?.users) return select(held, request);
        const person = request.path.split('/')[1];
        const entry = await viewEntry(request.tripId, person);
        if (entry) return select({ users: { [person]: entry } }, request);
    }
    return select(await load(request), request);
}
// iOS/Android can suspend networking in the background. Screen-data polling
// follows app visibility; location tracking is managed by its own native service.
function startForegroundPolling(task, intervalMs = 4000, firstDelayMs = 0) {
    // `running` counts polls: a foreground change can start one while an older one is in flight.
    let stopped = false, timer = null, due = 0, revision = 0, running = 0, again = false, gap = 0, lastStart = 0;
    let state = AppState.currentState;
    const active = () => !state || state === 'active';
    // Keeps the earliest of a pending and a new request.
    const schedule = ms => {
        if (timer && due <= Date.now() + ms) return;
        clearTimeout(timer);
        due = Date.now() + ms;
        timer = setTimeout(poll, ms);
    };
    const poll = async () => {
        timer = null;
        if (stopped || !active()) return;
        const started = revision;
        const isCurrent = () => !stopped && active() && revision === started;
        running += 1; again = false; lastStart = Date.now();
        try { await task(isCurrent); }
        finally {
            running -= 1;
            if (isCurrent()) schedule(again ? Math.max(0, lastStart + gap - Date.now()) : intervalMs);
        }
    };
    const subscription = AppState.addEventListener('change', next => {
        if (next === state) return;
        state = next;
        revision += 1;
        clearTimeout(timer); timer = null;
        if (active()) schedule(0);
    });
    if (active()) schedule(firstDelayMs);
    const stop = () => {
        stopped = true;
        revision += 1;
        clearTimeout(timer);
        subscription.remove();
    };
    // Poll as soon as possible, but not within minGapMs of the last start; a poll
    // already running is followed by one more.
    stop.now = (minGapMs = 0) => {
        if (stopped || !active()) return;
        if (running) { again = true; gap = minGapMs; return; }
        schedule(Math.max(0, lastStart + minGapMs - Date.now()));
    };
    stop.setInterval = ms => { if (ms === intervalMs) return; intervalMs = ms; stop.now(); };
    return stop;
}
// Notifications and the own account are fetched when their server-written
// signal moves, when the directory changes (names follow privacy choices), on
// return to the foreground, and as a slow safety net. A listener that is still
// attached does not miss a value, and a refused one switches to the 4 s poll.
const SIGNAL_FALLBACK_MS = 10 * 60 * 1000;
// Signals can move several times a second; one fetch per gap is enough.
const SIGNAL_GAP_MS = 1500;
// The first fetch waits this long for the signal's first value.
const SIGNAL_FIRST_WAIT_MS = 1000;
// A staff reader may be waiting on an SOS, so notifications get a shorter net.
const STAFF_NOTIFICATIONS_FALLBACK_MS = 60 * 1000;
const SIGNALLED = ['chat', 'notifications', 'account'];
// What the reader's directory resolved to for a trip ('staff', 'member' or
// 'legacy'); other sections use it to tell staff readers apart.
const roles = new Map();
function setRole(uid, tripId, role) {
    const entry = roles.get(`${uid}:${tripId}`) || { role: null, watchers: new Set() };
    roles.set(`${uid}:${tripId}`, entry);
    entry.role = role;
    for (const watcher of [...entry.watchers]) watcher(role);
}
function watchRole(uid, tripId, watcher) {
    const key = `${uid}:${tripId}`;
    const entry = roles.get(key) || { role: null, watchers: new Set() };
    roles.set(key, entry);
    entry.watchers.add(watcher);
    if (entry.role) watcher(entry.role);
    return () => { entry.watchers.delete(watcher); if (!entry.watchers.size && roles.get(key) === entry && !entry.role) roles.delete(key); };
}
const fallbackMs = role => role === 'staff' ? STAFF_NOTIFICATIONS_FALLBACK_MS : SIGNAL_FALLBACK_MS;
function signalPath(request, uid) {
    if (request.section === 'account') return `account_signal/${uid}`;
    const [, orgId, tripId] = request.path.split('/');
    const root = `trips_active/${orgId}/${tripId}`;
    if (request.section === 'chat') return `${root}/chat_signal`;
    return `${root}/notification_signal/${uid}`;
}
// The first value also triggers a fetch: the first fetch waits for it, so no
// line written between that fetch and the listener's start is missed. A refused
// listener (rules not yet deployed, trip ended) falls back to the old 4 s poll.
function watchSignal(group, uid, path) {
    let last;
    return onValue(ref(database, path), signal => {
        const next = signal.val();
        if ((last === undefined || next !== last) && auth.currentUser?.uid === uid) group.stopPolling?.now(last === undefined ? 0 : SIGNAL_GAP_MS);
        last = next;
    }, () => { group.refused = true; group.stopPolling?.setInterval(4000); });
}
const LOCATION_KEYS = ['lat', 'lng', 'latitude', 'longitude', 'speed', 'heading', 'accuracy', 'updated_at'];
const CHAT_VIEW_LIMIT = 200;
// How long a signalled chat line may take to reach chat_view before the poll takes over.
const CHAT_SIGNAL_GRACE_MS = 5000;
const wantsLocations = group => [...group.clients].some(client => /\/(locations|location_permissions)(\/|$)/.test(client.request.path));
function ownLocationFields(value) {
    if (!value || typeof value !== 'object') return null;
    const kept = Object.fromEntries(LOCATION_KEYS.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
    return Object.keys(kept).length ? kept : null;
}
// The directory comes from the server-written trip_view: staff read the staff
// view; pilgrims read the member view plus their own entry. Coordinates and
// grants are listened to per person, and only while a screen shows locations.
// Trips without a view yet (not backfilled) use the old poll.
function watchDirectory(group, request, uid) {
    const tripId = request.tripId;
    let staffView, memberView, self, mode = null;
    const setMode = next => { mode = next; setRole(uid, tripId, next); };
    const grantTimers = state => { clearTimeout(state.timer); state.timer = null; state.timerFor = null; };
    const dropPerson = state => { state.stopLocation?.(); state.stopGrant?.(); grantTimers(state); };
    const people = new Map();
    const stops = [];
    const data = () => {
        const users = mode === 'staff' ? { ...(staffView || {}) } : { ...(memberView || {}) };
        if (mode === 'member' && self) users[uid] = self;
        const locations = {}, grants = {};
        for (const [person, state] of people) {
            if (state.grant && isLocationGrantActive(state.grant)) grants[person] = { [uid]: state.grant };
            if (state.location && (users[person]?.visibility?.canSeeLocation || person === uid || grants[person])) locations[person] = state.location;
        }
        return { users, locations, location_permissions: grants };
    };
    const syncLocations = () => {
        const orgId = group.orgId;
        const { users } = data();
        const wanted = new Set();
        if (orgId && wantsLocations(group)) for (const person of Object.keys(users)) wanted.add(person);
        for (const [person, state] of people) {
            if (wanted.has(person)) continue;
            dropPerson(state); people.delete(person);
        }
        const root = `trips_active/${orgId}/${tripId}`;
        for (const person of wanted) {
            const state = people.get(person) || {};
            people.set(person, state);
            const visible = person === uid || users[person]?.visibility?.canSeeLocation;
            if (!visible && !state.stopGrant) {
                state.stopGrant = onValue(ref(database, `${root}/location_permissions/${person}/${uid}`), snap => {
                    state.grant = snap.val(); syncLocations(); publish();
                }, () => { state.grant = null; });
            }
            const active = isLocationGrantActive(state.grant);
            // The location listener's .read is only checked at attach, so detach it when the grant ends.
            if (!active) grantTimers(state);
            else if (state.timerFor !== state.grant.expiresAt) {
                grantTimers(state);
                state.timerFor = state.grant.expiresAt;
                state.timer = setTimeout(() => { state.timer = null; state.timerFor = null; if (!group.stopped) { syncLocations(); publish(); } },
                    Math.min(Math.max(0, state.grant.expiresAt - Date.now()) + 1, 2 ** 31 - 1));
            }
            const allowed = visible || active;
            if (allowed && !state.stopLocation) {
                state.stopLocation = onValue(ref(database, `${root}/locations/${person}`), snap => {
                    state.location = ownLocationFields(snap.val()); publish();
                }, () => { state.location = null; state.stopLocation = null; publish(); });
            } else if (!allowed && state.stopLocation) {
                state.stopLocation(); state.stopLocation = null; state.location = null;
            }
        }
    };
    const publish = () => { if (mode === 'staff' || mode === 'member') group.deliver(data()); };
    const legacy = () => {
        if (mode === 'legacy') return;
        setMode('legacy');
        stops.splice(0).forEach(stop => stop());
        for (const state of people.values()) dropPerson(state);
        people.clear();
        group.startPolling();
    };
    const listenMember = () => {
        setMode('member');
        let seen = 0;
        const ready = () => { if (++seen >= 2) { if (!memberView) return legacy(); syncLocations(); publish(); } };
        let first = [true, true];
        stops.push(onValue(ref(database, `trip_view/${tripId}/member`), snap => {
            memberView = snap.val();
            if (first[0]) { first[0] = false; return ready(); }
            if (!memberView) return group.fail(new Error('Trip directory unavailable.'));
            syncLocations(); publish();
        }, () => legacy()));
        stops.push(onValue(ref(database, `trip_view/${tripId}/staff/${uid}`), snap => {
            self = snap.val();
            if (first[1]) { first[1] = false; return ready(); }
            syncLocations(); publish();
        }, () => {
            // Own entry refused: treat it as absent, but still let the member view deliver.
            self = null;
            if (first[1]) { first[1] = false; return ready(); }
            syncLocations(); publish();
        }));
    };
    let firstStaff = true;
    stops.push(onValue(ref(database, `trip_view/${tripId}/staff`), snap => {
        staffView = snap.val();
        if (firstStaff) { firstStaff = false; if (!staffView) return legacy(); setMode('staff'); }
        syncLocations(); publish();
    }, () => { if (mode === null || mode === 'staff') { staffView = undefined; listenMember(); } }));
    group.onClients = () => { if (mode === 'staff' || mode === 'member') { syncLocations(); publish(); } };
    return () => {
        stops.splice(0).forEach(stop => stop());
        for (const state of people.values()) dropPerson(state);
        people.clear();
    };
}
// Names and photos in chat lines follow the reader's own directory, as on the server.
function chatLine(message, users) {
    if (!message || typeof message !== 'object') return message;
    const uid = message.sender_id || message.senderUid || message.fromUid || message.senderId;
    const result = { ...message };
    for (const key of ['sender', 'sender_name', 'senderName', 'name', 'full_name']) if (key in result) result[key] = users[uid]?.full_name || 'Participant';
    for (const key of ['avatar', 'senderImage', 'photoURL', 'photo_url']) if (key in result) result[key] = users[uid]?.profile?.photoURL || '';
    if (result.replyTo) result.replyTo = chatLine(result.replyTo, users);
    if (!users[uid]?.visibility?.canSeeLocation) {
        for (const key of ['lat', 'lng', 'latitude', 'longitude', 'location', 'coordinates', 'address']) delete result[key];
        if (result.type === 'location') { result.type = 'text'; result.text = 'Location is private'; }
    }
    return result;
}
// The newest chat lines from the server-written chat_view. Trips whose chat has
// lines but no view yet (not backfilled) use the signalled poll. Staff also read
// chat_view_staff, which holds the location fields the member mirror dropped.
// A signalled line that the view never receives (old functions, lost mirror
// write) switches to the poll as well.
function watchChat(group, request, uid) {
    const [, orgId, tripId] = request.path.split('/');
    const root = `trips_active/${orgId}/${tripId}`;
    let users, messages, staffLines, live = false, legacy = false, signalId, graceTimer = null;
    const publish = () => {
        if (!live || users === undefined || messages === undefined) return;
        group.deliver(Object.fromEntries(Object.entries(messages || {}).map(([key, value]) =>
            [key, chatLine(staffLines?.[key] && value && typeof value === 'object' ? { ...value, ...staffLines[key] } : value, users)])));
    };
    const directoryRequest = { path: 'users', tripId: request.tripId, section: 'directory' };
    const stopDirectory = subscribe(directoryRequest, { request: directoryRequest,
        callback: snap => { users = snap.val() || {}; publish(); }, onError: () => { users = {}; publish(); } });
    let stopChat = () => {}, stopSignal = () => {}, unwatchRole = () => {}, stopStaff = null;
    const clearGrace = () => { clearTimeout(graceTimer); graceTimer = null; };
    const goLegacy = () => {
        if (legacy) return;
        legacy = true;
        clearGrace(); stopChat(); stopSignal(); stopStaff?.(); stopStaff = null; stopDirectory(); unwatchRole();
        group.startPolling();
    };
    const has = () => Boolean(messages && signalId in messages);
    const check = () => {
        if (legacy || !live || !signalId || has()) return clearGrace();
        if (!graceTimer) graceTimer = setTimeout(() => { graceTimer = null; if (!legacy && signalId && !has()) goLegacy(); }, CHAT_SIGNAL_GRACE_MS);
    };
    let first = true;
    stopChat = onValue(query(ref(database, `${root}/chat_view`), limitToLast(CHAT_VIEW_LIMIT)), async snap => {
        messages = snap.val();
        if (first) {
            first = false;
            if (!messages) {
                const signal = await get(ref(database, `${root}/chat_signal`)).catch(() => null);
                if (signal?.val()) return goLegacy();
            }
            if (legacy) return;
            live = true;
        }
        publish(); check();
    }, () => goLegacy());
    if (!legacy) unwatchRole = watchRole(uid, tripId, role => {
        if (legacy || role !== 'staff' || stopStaff) return;
        // Members are refused here; that is ignored.
        stopStaff = onValue(query(ref(database, `${root}/chat_view_staff`), limitToLast(CHAT_VIEW_LIMIT)), snap => {
            staffLines = snap.val() || undefined; publish();
        }, () => {});
    });
    if (!legacy) {
        stopSignal = onValue(ref(database, `${root}/chat_signal`), snap => {
            const next = snap.val();
            if (next === signalId) return;
            signalId = next; clearGrace(); check();
        }, () => {});
    }
    return () => { clearGrace(); stopChat(); stopSignal(); stopStaff?.(); unwatchRole(); stopDirectory(); };
}
function subscribe(request, client) {
    const uid = auth.currentUser?.uid;
    const key = `${uid}:${request.tripId}:${request.section}`;
    let group = subscriptions.get(key);
    if (!group) {
        group = { clients: new Set(), stopPolling: null, stopped: false, hash: null, data: undefined };
        subscriptions.set(key, group);
        group.deliver = data => {
            if (group.stopped || auth.currentUser?.uid !== uid) return;
            group.last = data;
            for (const client of group.clients) {
                const next = select(data, client.request);
                const signature = visibilitySignature(next.val());
                if (client.signature !== signature) { client.signature = signature; client.callback(next); }
            }
            if (request.section === 'directory') {
                const people = visibilitySignature(data?.users);
                if (group.people !== undefined && group.people !== people) {
                    for (const section of SIGNALLED) subscriptions.get(`${uid}:${request.tripId}:${section}`)?.stopPolling?.now();
                }
                group.people = people;
            }
        };
        // Access loss must clear old coordinates/profile data, never retain it.
        group.fail = error => {
            if (group.stopped || auth.currentUser?.uid !== uid) return;
            group.hash = null; group.parts = null; group.data = undefined; group.people = undefined; group.last = undefined;
            for (const client of group.clients) { client.signature = undefined; client.callback(snapshot(null)); client.onError(error); }
        };
        const poll = async isCurrent => {
            try {
                const data = await load(request, group);
                if (isCurrent()) group.deliver(data);
            } catch (error) {
                if (isCurrent()) group.fail(error);
            }
        };
        const signalled = SIGNALLED.includes(request.section);
        group.startPolling = () => {
            if (group.stopPolling || group.stopped) return;
            group.stopPolling = startForegroundPolling(poll, signalled ? (request.section === 'notifications' ? fallbackMs(roles.get(`${uid}:${request.tripId}`)?.role) : SIGNAL_FALLBACK_MS) : 4000, signalled ? SIGNAL_FIRST_WAIT_MS : 0);
            if (signalled) group.stopSignal = watchSignal(group, uid, signalPath(request, uid));
            if (request.section === 'notifications') {
                group.stopRole = watchRole(uid, request.tripId, role => { if (!group.refused) group.stopPolling?.setInterval(fallbackMs(role)); });
            }
        };
        if (request.section === 'directory') group.stopListening = watchDirectory(group, request, uid);
        else if (request.section === 'chat') group.stopListening = watchChat(group, request, uid);
        else group.startPolling();
    } else if (group.stopPolling) {
        // A screen joining a running group gets data now, not after the next interval.
        group.stopPolling.now();
    }
    if (request.section === 'directory' && request.path.startsWith('trips_active/')) group.orgId = request.path.split('/')[1];
    group.clients.add(client);
    group.onClients?.();
    // A screen joining a listening group gets the data it already holds.
    if (!group.stopPolling && group.last !== undefined) group.deliver(group.last);
    return () => {
        if (!group.clients.delete(client)) return;
        if (group.clients.size) { group.onClients?.(); return; }
        group.stopped = true;
        group.stopPolling?.();
        group.stopSignal?.();
        group.stopRole?.();
        group.stopListening?.();
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
// One person's directory entry, for lookups that follow privacy choices (for
// example the name of whoever is speaking). Returns the stop function.
export const watchDirectoryUser = tripId => (uid, callback) =>
    onVisibleValue(ref(database, `users/${uid}`), tripId, snapshot => callback(snapshot.val()), () => callback(null));
export const requestParticipantLocation = (tripId, targetUid) => httpsCallable(functions, 'requestParticipantLocation')({ tripId, targetUid });
export const respondToLocationRequest = (tripId, notificationId, accept) => httpsCallable(functions, 'respondToLocationRequest')({ tripId, notificationId, accept });
export const resolveSos = (tripId, notificationId) => httpsCallable(functions, 'resolveSos')({ tripId, notificationId });
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
