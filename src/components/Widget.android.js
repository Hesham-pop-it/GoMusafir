import { createWidget, createLiveActivity } from 'expo-widgets';

// Android has no SwiftUI/ActivityKit views. Use Expo's Android stubs without
// importing Widget.js: its SwiftUI imports execute before any Platform guard.
const emptyLayout = () => null;

export const MyWidget = createWidget('MyWidget', emptyLayout);
export const MyLiveActivity = createLiveActivity('MyLiveActivity', emptyLayout);
