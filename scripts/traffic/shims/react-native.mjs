// The app's data code only needs AppState from React Native. Virtual users are
// always in the foreground.
export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
export const Platform = { OS: 'ios' };
