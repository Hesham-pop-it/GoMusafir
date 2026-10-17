import { useEffect, useRef, useState } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { database, auth } from '../config/firebase';
import { isStaffMember, checkPIIVisibility, getParticipantDisplayName, getParticipantDisplayPhoto } from '../utils/visibilityHelper';

// Trip participants as the viewer is allowed to see them: [{ id, name, image, isStaff, role, nameVisible }].
// Mirrors how TripOverviewScreen builds its list, so names follow the same visibility rules.
export default function useTripPeople(orgId, tripId, staff) {
    const viewerUid = auth.currentUser?.uid;
    const [uids, setUids] = useState([]);
    const [organizerId, setOrganizerId] = useState(null);
    const [globalConfig, setGlobalConfig] = useState({});
    const [raw, setRaw] = useState({});
    const loaded = useRef({});

    useEffect(() => {
        if (!tripId) return;
        return onValue(ref(database, `trips_participants/${tripId}`), (snap) => {
            const val = snap.val() || {};
            setUids(Array.isArray(val) ? val.filter(Boolean) : Object.keys(val));
        }, () => {});
    }, [tripId]);

    useEffect(() => {
        if (!orgId || !tripId) return;
        const base = `orgs/${orgId}/trips/${tripId}`;
        const u1 = onValue(ref(database, `${base}/visibility_config`), (s) => setGlobalConfig(s.val() || {}), () => {});
        const u2 = onValue(ref(database, `${base}/organizer_id`), (s) => setOrganizerId(s.val() || null), () => {});
        return () => { u1(); u2(); };
    }, [orgId, tripId]);

    const staffUids = Object.keys(staff || {}).filter((u) => ['admin', 'manager', 'co-host'].includes(staff[u]));
    const allUids = Array.from(new Set([...uids, ...staffUids])).filter(Boolean);
    const key = allUids.join(',');

    useEffect(() => {
        if (!tripId) return;
        allUids.forEach((uid) => {
            if (loaded.current[uid]) return;
            loaded.current[uid] = true;
            Promise.all([
                get(ref(database, `users/${uid}/profile`)).catch(() => null),
                get(ref(database, `users/${uid}/full_name`)).catch(() => null),
                get(ref(database, `users/${uid}/photo_url`)).catch(() => null),
                get(ref(database, `users/${uid}/participant_visibility/${tripId}`)).catch(() => null),
            ]).then(([p, n, ph, v]) => {
                const profile = p?.val() || {};
                const photo = profile.photoURL || profile.photo_url || ph?.val() || profile.photo || profile.profile_photo || profile.image;
                setRaw((prev) => ({ ...prev, [uid]: { profile: { ...profile, photoURL: photo, photo_url: photo }, fullName: n?.val() || null, visibility: v?.val() || {} } }));
            });
        });
    }, [key, tripId]);

    const isViewerStaff = isStaffMember(viewerUid, staff, organizerId, staff?.[viewerUid]);
    const people = allUids.filter((uid) => raw[uid]).map((uid) => {
        const { profile, fullName, visibility } = raw[uid];
        const isTargetStaff = isStaffMember(uid, staff, organizerId, staff?.[uid]);
        const common = { targetUid: uid, viewerUid, isViewerStaff, isTargetStaff, globalConfig, personalVisibility: visibility };
        const name = getParticipantDisplayName({ profile, fullName, ...common });
        // Private staff chats always show the staff member by name and photo, whatever the visibility settings say.
        const open = { ...common, globalConfig: {}, personalVisibility: {} };
        const staffName = isTargetStaff ? getParticipantDisplayName({ profile, fullName, ...open }) : null;
        return {
            id: uid,
            name,
            image: getParticipantDisplayPhoto({ profile, displayName: name, ...common }),
            isStaff: isTargetStaff,
            role: staff?.[uid] || null,
            nameVisible: checkPIIVisibility({ field: 'name', ...common }),
            ...(isTargetStaff ? { staffName, staffImage: getParticipantDisplayPhoto({ profile, displayName: staffName, ...open }) } : {}),
        };
    });
    return { people, loaded: allUids.length === 0 || people.length >= allUids.length };
}
