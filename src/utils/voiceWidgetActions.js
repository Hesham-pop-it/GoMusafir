export async function handleVoiceWidgetAction(event, session) {
    if (!['MyWidget', 'MyLiveActivity'].includes(event.source)) return;
    if (!session.validate || !await session.validate()) return;
    const { tripId, orgId, connected, admin, muted, globallyMuted } = session;
    if (!tripId || !orgId) return;
    switch (event.target) {
        case 'join_channel':
            if (!connected) await session.connect(tripId, orgId, admin);
            break;
        case 'leave_channel':
            if (connected) await session.disconnect();
            break;
        case 'stop_channel':
            if (connected && admin) await session.stop(admin, tripId, orgId);
            break;
        case 'mute_myself':
        case 'hold_to_talk':
            if (connected && !(muted && globallyMuted && !admin)) {
                await session.setMuted(!muted);
            }
            break;
        case 'mute_channel':
            if (connected && admin) await session.setGlobalMuted(!globallyMuted);
            break;
    }
}
