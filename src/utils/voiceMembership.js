// Local membership must never be restored from a persisted presence flag.
export function isVoiceMember({ uid, currentUid, connected, roomState, activeTripId, tripId,
    liveParticipantIds, presence, channelActive }) {
    const inThisRoom = connected && roomState === 'connected' && activeTripId === tripId;
    if (uid === currentUid) return Boolean(inThisRoom);
    if (inThisRoom) return liveParticipantIds.has(uid);
    return channelActive === true && presence?.[uid] === true;
}
