// Stands in for src/config/firebase.js: each virtual user gets its own Firebase
// app, signed in and pointed at the local emulators by run.mjs.
const vu = Number(new URL(import.meta.url).searchParams.get('vu'));
const entry = globalThis.__traffic.users[vu];
export const app = entry.app;
export const auth = entry.auth;
export const functions = entry.functions;
export const database = entry.database;
export const db = entry.database;
export const storage = null;
export default app;
