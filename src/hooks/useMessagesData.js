import { useEffect, useMemo, useState } from 'react';
import { auth } from '../config/firebase';
import { watchPath } from '../services/sharedListeners';
import { getChatStaffRole } from '../utils/chatStaffRole';
import { totalUnread } from '../utils/messagingRules';
import { teamUnreadCount, splitInbox } from '../utils/messagesInbox';
import { subscribeInbox, subscribeAllTeamMeta, subscribeTeamRead, subscribeGroupUnread } from '../services/messaging';

// Everything the chat tab badge and the Messages screen share: viewer role, group unread, inbox, team inbox for staff.
export default function useMessagesData(orgId, tripId) {
    const uid = auth.currentUser?.uid;
    const [staff, setStaff] = useState({});
    const [groupUnread, setGroupUnread] = useState(0);
    const [inbox, setInbox] = useState({});
    const [teamMeta, setTeamMeta] = useState({});
    const [teamRead, setTeamRead] = useState({});

    const role = getChatStaffRole(staff, uid);
    const isStaff = !!role;

    useEffect(() => {
        if (!orgId) return;
        return watchPath(`orgs/${orgId}/staff`, (value) => setStaff(value || {}), () => {});
    }, [orgId]);

    useEffect(() => {
        if (!orgId || !tripId || !uid) return;
        const unsubs = [
            subscribeGroupUnread(orgId, tripId, uid, setGroupUnread),
            subscribeInbox(orgId, tripId, uid, setInbox),
        ];
        return () => unsubs.forEach((u) => u());
    }, [orgId, tripId, uid]);

    useEffect(() => {
        if (!orgId || !tripId || !uid || !isStaff) return;
        const unsubs = [
            subscribeAllTeamMeta(orgId, tripId, setTeamMeta),
            subscribeTeamRead(orgId, tripId, uid, setTeamRead),
        ];
        return () => unsubs.forEach((u) => u());
    }, [orgId, tripId, uid, isStaff]);

    const teamUnread = isStaff ? teamUnreadCount(teamMeta, teamRead, uid) : 0;
    const split = useMemo(() => splitInbox(inbox), [inbox]);
    const total = totalUnread({ groupUnread, inboxRows: Object.values(inbox), teamUnread });
    const staffCount = Object.values(staff).filter((r) => r === 'admin' || r === 'manager' || r === 'co-host').length;

    return { uid, staff, role, isStaff, staffCount, groupUnread, inbox, split, teamMeta, teamRead, teamUnread, total };
}
