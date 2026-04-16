import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase App
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize Auth with React Native built-in AsyncStorage for persistence across sessions
// S24: Secure Auth Token Storage (Local persistence via async storage for demo, though Expo SecureStore can also be used if needed)
let auth;
try {
  // Try to initialize Auth with Persistence
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch (e) {
  // If already initialized, fetch the existing instance
  auth = getAuth(app);
}

const functions = getFunctions(app, "europe-west1");
const database = getDatabase(app);
const storage = getStorage(app);

// Use Emulators if configured
// Emulators run on localhost, but Android emulator requires 10.0.2.2 to access host localhost.
if (process.env.EXPO_PUBLIC_USE_EMULATOR === "true") {
  // Note: If running on a real device, change 'localhost' to your computer's local IP address
  const host = "10.0.2.2"; // Default for Android Emulator. Use "localhost" for iOS Simulator.

  try {
    connectFunctionsEmulator(functions, host, 5001);
    connectDatabaseEmulator(database, host, 9000);
    connectStorageEmulator(storage, host, 9199);
    console.log("Connected to Firebase Emulators");
  } catch (err) {
    console.log("Emulators already connected or error connecting", err);
  }
}

export { app, auth, functions, database, storage };
