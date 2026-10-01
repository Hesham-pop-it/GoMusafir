import { WebBrowserPresentationStyle } from 'expo-web-browser';
import { Colors } from '../constants/Colors';

// Safari owns the iOS toolbar and home-indicator safe area. Tint the native
// browser itself, rather than adding a fixed-height strip to an app screen.
export const brandedBrowserOptions = {
    presentationStyle: WebBrowserPresentationStyle.FULL_SCREEN,
    enableBarCollapsing: false,
    toolbarColor: Colors.dark.primary,
    secondaryToolbarColor: Colors.dark.primary,
    navigationBarColor: Colors.dark.primary,
    navigationBarDividerColor: Colors.dark.primary,
    controlsColor: Colors.dark.background,
};
