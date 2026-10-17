// LiveKit determines who is speaking; Firebase only supplies profile details.
export function resolveVoiceWidgetSpeaker({ connected, muted, localSpeaking, localUid,
    localName, localAvatar, speakingUids, remoteParticipants, activeSpeaker, avatarCache, profiles = {} }) {
    const local = { name: localName || 'You', avatar: localAvatar || '', isSpeaking: false };
    if (!connected) return local;
    if (!muted && (localSpeaking || speakingUids.includes(localUid))) {
        return { ...local, isSpeaking: true };
    }
    const uid = speakingUids.find(id => id !== localUid && remoteParticipants.has(id));
    if (!uid) return local;
    const participant = remoteParticipants.get(uid);
    const profile = activeSpeaker?.uid === uid ? activeSpeaker : null;
    return {
        name: profiles[uid]?.name || profile?.name || 'Speaker',
        avatar: avatarCache[uid] || '',
        isSpeaking: true,
    };
}
