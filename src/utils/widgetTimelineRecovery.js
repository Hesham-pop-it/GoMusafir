// Keep startup recovery from overwriting a newer voice-state snapshot while
// the native timeline read is in flight.
export function createWidgetTimelineRecovery(widget) {
    let revision = 0;
    return {
        updateSnapshot(props) {
            revision++;
            widget.updateSnapshot(props);
        },
        async refresh() {
            const startedAt = revision;
            const entries = await widget.getTimeline();
            if (revision !== startedAt) return;
            if (entries.length === 0) {
                widget.updateSnapshot({
                    activeChannelName: 'No Channel',
                    isConnected: false,
                    isChannelActive: false,
                    isMuted: true,
                    isSpeaking: false,
                    participantCount: 0,
                });
                revision++;
            } else {
                widget.reload();
            }
        },
    };
}
