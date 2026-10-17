// Runs N virtual pilgrims against the local emulators through the counting proxy.
// Each user runs the app's real data module (src/services/visibilityData.js) with
// the subscriptions a pilgrim has open on the trip overview, and the scenario adds
// chat messages and location updates. Usage:
//   node scripts/traffic/run.mjs --label before --users 25 --minutes 3
import { register } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

register('./vu-loader.mjs', import.meta.url);
const require = createRequire(import.meta.url);
const { ORG, TRIP, PASSWORD, PROJECT } = require('./seed.cjs');
const { initializeApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator } = await import('firebase/functions');
const { getDatabase, connectDatabaseEmulator, ref, push, set } = await import('firebase/database');

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) =>
  value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? true : all[i + 1]]] : pairs, []));
const label = args.label || 'run';
const users = Number(args.users || 25);
const minutes = Number(args.minutes || 3);
const warmupSeconds = Number(args.warmup || 45);
const chatEverySeconds = Number(args.chat || 10);
const locationEverySeconds = Number(args.location || 15);
// --map closed: nobody has the map open, so no one subscribes to coordinates.
const mapOpen = args.map !== 'closed';
const here = path.dirname(new URL(import.meta.url).pathname);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Callable traffic per function and section, measured on the request and response bodies.
const calls = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input.url || input);
  const name = url.split('/').pop().split('?')[0];
  let section = '';
  try { section = JSON.parse(init.body || '{}').data?.section || ''; } catch (_) {}
  const key = section ? `${name}:${section}` : name;
  const response = await realFetch(input, init);
  const body = await response.clone().arrayBuffer();
  const entry = calls[key] ||= { calls: 0, requestBytes: 0, responseBytes: 0, errors: 0 };
  entry.calls += 1;
  entry.requestBytes += Buffer.byteLength(init.body || '');
  entry.responseBytes += body.byteLength;
  if (!response.ok) entry.errors += 1;
  return response;
};
const proxy = async action => (await realFetch(`http://127.0.0.1:19519/${action}`)).json();

globalThis.__traffic = { users: [] };
const counters = { chatMessages: 0, locationWrites: 0, callbacks: 0 };

async function startUser(i) {
  const uid = `vu_${i}`;
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, databaseURL: `http://127.0.0.1:19510?ns=${PROJECT}-default-rtdb` }, `vu${i}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:19599', { disableWarnings: true });
  const functions = getFunctions(app, 'europe-west1');
  connectFunctionsEmulator(functions, '127.0.0.1', 19512);
  const database = getDatabase(app);
  connectDatabaseEmulator(database, '127.0.0.1', 19510);
  // Sign-in runs the blocking onSignIn function; a cold emulator worker can
  // exceed the SDK timeout, so retry a few times before giving up.
  for (let attempt = 1; ; attempt++) {
    try { await signInWithEmailAndPassword(auth, `${uid}@traffic.test`, PASSWORD); break; }
    catch (error) { if (attempt >= 4 || error.code !== 'auth/network-request-failed') throw error; }
  }
  globalThis.__traffic.users[i] = { app, auth, functions, database };
  const data = await import(`../../src/services/visibilityData.js?vu=${i}`);
  const root = `trips_active/${ORG}/${TRIP}`;
  const seen = () => { counters.callbacks += 1; };
  // What a pilgrim has open on the trip overview (TripOverviewScreen, VoiceContext,
  // TemplateAlertPopup): two revision hooks, the voice fields and the data paths.
  data.useVisibilityRevision(TRIP);
  data.useVisibilityRevision(TRIP);
  data.onVisibleValue(ref(database, `users/${uid}`), null, seen);
  // Voice status and the active speaker are read straight from the voice node (VoiceContext).
  const voice = await import(`../../src/utils/voiceChannelFields.js?vu=${i}`);
  voice.watchVoiceChannelState(database, ORG, TRIP, seen);
  voice.watchActiveSpeaker(database, ORG, TRIP, data.watchDirectoryUser(TRIP), seen);
  data.onVisibleValue(ref(database, `${root}/notifications/${uid}`), TRIP, seen);
  data.onVisibleValue(ref(database, `${root}/chat`), TRIP, seen);
  if (mapOpen) data.onVisibleValue(ref(database, `${root}/locations`), TRIP, seen);
  return { uid, database, root };
}

const started = [];
const stagger = Math.max(5, warmupSeconds - 15) * 1000 / users;
for (let i = 0; i < users; i++) {
  started.push(await startUser(i));
  await sleep(stagger);
}
console.log(`${label}: ${users} users started`);

let running = true;
(async function chat() {
  while (running) {
    await sleep(chatEverySeconds * 1000);
    const user = started[Math.floor(Math.random() * started.length)];
    await push(ref(user.database, `${user.root}/chat`), { sender_id: user.uid, text: 'Traffic test message, about this long.', type: 'text', timestamp: Date.now() });
    counters.chatMessages += 1;
  }
})();
started.forEach((user, i) => (async () => {
  await sleep((i % locationEverySeconds) * 1000);
  while (running) {
    await set(ref(user.database, `${user.root}/locations/${user.uid}`), (() => {
      // The payload syncLocationToFirebase writes.
      const lat = 21.42 + Math.random() / 100, lng = 39.82 + Math.random() / 100;
      return { lat, lng, updated_at: Date.now() };
    })());
    counters.locationWrites += 1;
    await sleep(locationEverySeconds * 1000);
  }
})());

await sleep(15000);
const startup = { proxy: await proxy('stats'), calls: JSON.parse(JSON.stringify(calls)) };
await proxy('reset');
for (const key of Object.keys(calls)) delete calls[key];
counters.chatMessages = 0; counters.locationWrites = 0; counters.callbacks = 0;
const t0 = Date.now();
await sleep(minutes * 60000);
const elapsedMin = (Date.now() - t0) / 60000;
const steady = { proxy: await proxy('stats'), calls: JSON.parse(JSON.stringify(calls)), counters: { ...counters } };
running = false;

const perUserPerMin = bytes => bytes / users / elapsedMin;
const day = bytes => perUserPerMin(bytes) * 240; // 4 h with the app open
const mb = bytes => Math.round(bytes / 1e4) / 100;
const p = steady.proxy;
const summary = {
  label, users, mapOpen, minutes: Math.round(elapsedMin * 100) / 100, chatEverySeconds, locationEverySeconds,
  perPilgrimPerDayMB: {
    phoneDatabase: mb(day(p.client_db.up + p.client_db.down)),
    phoneCallables: mb(day(p.client_functions.up + p.client_functions.down)),
    phoneTotal: mb(day(p.client_db.up + p.client_db.down + p.client_functions.up + p.client_functions.down)),
    serverDatabaseReads: mb(day(p.admin_db.down)),
  },
  callsPerPilgrimPerDay: Math.round(Object.values(steady.calls).reduce((sum, c) => sum + c.calls, 0) / users / elapsedMin * 240),
  sections: Object.fromEntries(Object.entries(steady.calls).map(([key, c]) => [key, {
    callsPerPilgrimPerMin: Math.round(c.calls / users / elapsedMin * 100) / 100,
    avgResponseKB: Math.round(c.responseBytes / Math.max(1, c.calls) / 10) / 100,
    errors: c.errors,
  }])),
  serverReadKBPerCall: Math.round(p.admin_db.down / Math.max(1, Object.values(steady.calls).reduce((s, c) => s + c.calls, 0)) / 10) / 100,
  coldStartKBPerPilgrim: Math.round((startup.proxy.client_db.up + startup.proxy.client_db.down + startup.proxy.client_functions.up + startup.proxy.client_functions.down) / users / 10) / 100,
  counters: steady.counters,
};
// Location writes that never reach the proxy mean traffic went around it.
if (steady.counters.locationWrites && !p.client_db.up) summary.invalid = 'phone database traffic bypassed the proxy';
if (summary.invalid) console.error(`INVALID RUN: ${summary.invalid}`);
const budgets = JSON.parse(readFileSync(path.join(here, 'budgets.json'), 'utf8'));
summary.budget = Object.fromEntries([
  ['phoneTotalMB', summary.perPilgrimPerDayMB.phoneTotal],
  ['coldStartKB', summary.coldStartKBPerPilgrim],
  ['serverDatabaseReadsMB', summary.perPilgrimPerDayMB.serverDatabaseReads],
  ['functionCalls', summary.callsPerPilgrimPerDay],
].map(([key, value]) => [key, { value, limit: budgets[key], ok: value <= budgets[key] }]));
mkdirSync(path.join(here, 'results'), { recursive: true });
writeFileSync(path.join(here, 'results', `${label}-n${users}${mapOpen ? '' : '-nomap'}.json`), JSON.stringify({ summary, startup, steady }, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.invalid || (args.enforce && Object.values(summary.budget).some(b => !b.ok)) ? 1 : 0);
