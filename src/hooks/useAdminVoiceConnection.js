import { useEffect, useRef, useState } from 'react';
import { RoomEvent, ConnectionQuality } from 'livekit-client';
import { onValue, ref } from 'firebase/database';
import { database } from '../config/firebase';

export default function useAdminVoiceConnection(room, orgId, connected) {
    const [adminConnectionPending, setAdminConnectionPending] = useState(false);
    const disconnectedAdmins = useRef(new Set());
    useEffect(() => {
        disconnectedAdmins.current.clear();
        setAdminConnectionPending(false);
        if (!connected || !orgId) return;
        let staffData = {};
        const isRemoteAdmin = participant => !participant.isLocal &&
            (staffData?.[participant.identity] === 'admin' || staffData?.[participant.identity]?.role === 'admin');
        const publish = () => setAdminConnectionPending(disconnectedAdmins.current.size > 0);
        const onQuality = (quality, participant) => {
            if (!participant || !isRemoteAdmin(participant)) return;
            if (quality === ConnectionQuality.Lost) disconnectedAdmins.current.add(participant.identity);
            else disconnectedAdmins.current.delete(participant.identity);
            publish();
        };
        const onLeft = participant => {
            if (!isRemoteAdmin(participant)) return;
            disconnectedAdmins.current.add(participant.identity);
            publish();
        };
        const onJoined = participant => {
            disconnectedAdmins.current.delete(participant.identity);
            publish();
        };
        room.remoteParticipants.forEach(participant => onQuality(participant.connectionQuality, participant));
        const unsubscribe = onValue(ref(database, `orgs/${orgId}/staff`), snapshot => {
            staffData = snapshot.val() || {};
            room.remoteParticipants.forEach(participant => onQuality(participant.connectionQuality, participant));
        });
        room.on(RoomEvent.ConnectionQualityChanged, onQuality);
        room.on(RoomEvent.ParticipantDisconnected, onLeft);
        room.on(RoomEvent.ParticipantConnected, onJoined);
        return () => {
            unsubscribe();
            room.off(RoomEvent.ConnectionQualityChanged, onQuality);
            room.off(RoomEvent.ParticipantDisconnected, onLeft);
            room.off(RoomEvent.ParticipantConnected, onJoined);
        };
    }, [room, orgId, connected]);
    return connected && adminConnectionPending;
}
