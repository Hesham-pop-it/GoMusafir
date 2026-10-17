import { protectedSession } from './protectedSessionService';
import { MyWidget, MyLiveActivity } from '../components/Widget';
import { createWidgetTimelineRecovery } from '../utils/widgetTimelineRecovery';

export const journeyWidget = createWidgetTimelineRecovery(MyWidget);

// Recover and dismiss native instances too: they can survive a process restart.
journeyWidget.endLiveActivities = async () => {
    try {
        const instances = MyLiveActivity.getInstances();
        await Promise.all(instances.map(async activity => {
            try { await activity.end('immediate'); }
            catch (error) {
                if (!/can't find live activity|liveactivitynotfound/i.test(String(error?.message))) {
                    console.warn('[Widget] Live Activity dismissal failed:', error);
                }
            }
        }));
    } catch (error) {
        console.warn('[Widget] Live Activity lookup failed:', error);
    }
};
const clearSnapshot = journeyWidget.clear;
journeyWidget.clear = () => {
    clearSnapshot();
    journeyWidget.endLiveActivities();
};

const updateSnapshot = journeyWidget.updateSnapshot;
journeyWidget.updateSnapshot = props => {
    // Late voice-state effects must not repopulate the Widget during logout.
    if (protectedSession.isBlocked()) journeyWidget.clear();
    else updateSnapshot(props);
};
