import { useEffect, useState } from 'react';
import { database } from '../config/firebase';
import { watchVoiceChannelStatus } from '../utils/voiceChannelStatus';

// True while the trip's voice chat is live (same status the Voice Chat screen uses).
export default function useVoiceLive(orgId, tripId) {
    const [live, setLive] = useState(false);
    useEffect(() => {
        if (!orgId || !tripId) return;
        return watchVoiceChannelStatus(database, orgId, tripId, (s) => setLive(s === true));
    }, [orgId, tripId]);
    return live;
}
