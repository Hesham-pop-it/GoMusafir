// Measures the cost of single callable requests, one at a time, so the result
// does not depend on how fast the local emulator is. For every section it
// reports what the server read from the database and what the phone received:
// once for a first fetch and once for a repeat poll that sends the held hash.
// Usage: node probe.mjs --label before --users 100 [--repeat 5]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map(part => part.trim().split(/\s+/)).map(([key, value]) => [key, value ?? true]));
const label = args.label || 'probe';
const users = Number(args.users || 25);
const repeat = Number(args.repeat || 5);
const PROJECT = 'demo-gomusafir', ORG = 'org_traffic', TRIP = 'trip_traffic';
const ns = `${PROJECT}-default-rtdb`;
const root = `trips_active/${ORG}/${TRIP}`;

const owner = (p, value) => fetch(`http://127.0.0.1:19500/${p}.json?ns=${ns}`, {
  method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value) });
const stats = async () => (await fetch('http://127.0.0.1:19519/stats')).json();
const reset = () => fetch('http://127.0.0.1:19519/reset');

async function signIn(uid) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch('http://127.0.0.1:19599/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${uid}@traffic.test`, password: 'traffic-pass-1', returnSecureToken: true }) });
    const body = await response.json();
    if (body.idToken) return body.idToken;
    if (attempt >= 4) throw new Error(JSON.stringify(body));
  }
}

// Idle keep-alive sockets can be closed by the emulator between measurements;
// a request that never reached the server is sent again.
async function call(token, name, data, retried = false) {
  let response;
  try { response = await send(token, name, data); }
  catch (error) { if (retried || error.name !== 'TypeError') throw error; return call(token, name, data, true); }
  const body = await response.json();
  if (body.error) throw new Error(`${name}: ${JSON.stringify(body.error)}`);
  return body.result;
}

function send(token, name, data) {
  return fetch(`http://127.0.0.1:19512/${PROJECT}/europe-west1/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }) });
}

// One measured request: database bytes the server read and bytes the phone got.
// Waits out the server's 3 s record cache first, so every number is what one
// request costs on its own; sharing between pilgrims shows in run.mjs instead.
async function measure(token, name, data) {
  await new Promise(done => setTimeout(done, 3200));
  await reset();
  const result = await call(token, name, data);
  const s = await stats();
  return { result, serverReadKB: s.admin_db.down / 1024, phoneKB: s.client_functions.down / 1024 };
}

async function main() {
  // A realistic trip day: 60 chat lines from 10 people, a voice speaker and
  // five notifications for the probing pilgrim. Written straight to the
  // database, so the setup is not counted.
  const now = Date.now();
  const chat = {};
  for (let i = 0; i < 60; i++) chat[`m${String(i).padStart(3, '0')}`] = { sender_id: `vu_${i % 10}`, sender_name: 'Old copy', timestamp: now - (60 - i) * 60000, text: `Message ${i} about the meeting point`, type: 'text' };
  const notifications = {};
  for (let i = 0; i < 5; i++) notifications[`n${i}`] = { type: 'location_request', senderUid: `vu_${i + 1}`, fromUid: `vu_${i + 1}`, status: 'pending', timestamp: now, expiresAt: now + 900000, title: 'Location Request', message: 'x' };
  const locations = {};
  for (let i = 0; i < users; i++) locations[`vu_${i}`] = { lat: 21.42 + i / 1e4, lng: 39.82, accuracy: 5, updated_at: now };
  await owner(`${root}/chat`, chat);
  await owner(`${root}/notifications/vu_0`, notifications);
  await owner(`${root}/voice_channel`, { status: 'active', activeSpeaker: { uid: 'vu_3', name: 'Old copy' } });
  await owner(`${root}/locations`, locations);
  await new Promise(done => setTimeout(done, 15000)); // let chat triggers settle

  const token = await signIn('vu_0');
  const sections = [
    ['directory', 'getVisibleTripData', { tripId: TRIP, section: 'directory' }, 'knownParts'],
    ['chat', 'getVisibleTripData', { tripId: TRIP, section: 'chat' }, 'knownHash'],
    ['voice', 'getVisibleTripData', { tripId: TRIP, section: 'voice' }, 'knownHash'],
    ['notifications', 'getVisibleTripData', { tripId: TRIP, section: 'notifications' }, 'knownHash'],
    ['account', 'getOwnAccount', {}, 'knownHash'],
  ];
  await call(token, 'getOwnAccount', {}); // warm the worker
  const out = {};
  for (const [section, name, data, hashKey] of sections) {
    const rows = { first: [], repeat: [], moved: [] };
    for (let r = 0; r < repeat; r++) {
      const first = await measure(token, name, { ...data, [hashKey]: hashKey === 'knownParts' ? {} : '' });
      rows.first.push(first);
      const held = hashKey === 'knownParts' ? first.result?.parts : first.result?.hash;
      rows.repeat.push(await measure(token, name, { ...data, [hashKey]: held ?? (hashKey === 'knownParts' ? {} : '') }));
      if (section === 'directory') {
        // One pilgrim moved: the common case between two directory polls.
        await owner(`${root}/locations/vu_1/lat`, 21.5 + r / 1e3);
        rows.moved.push(await measure(token, name, { ...data, knownParts: held ?? {} }));
      }
    }
    const avg = (list, key) => list.length ? Math.round(list.reduce((sum, row) => sum + row[key], 0) / list.length * 100) / 100 : null;
    out[section] = {
      firstServerReadKB: avg(rows.first, 'serverReadKB'), firstPhoneKB: avg(rows.first, 'phoneKB'),
      repeatServerReadKB: avg(rows.repeat, 'serverReadKB'), repeatPhoneKB: avg(rows.repeat, 'phoneKB'),
      ...(rows.moved.length ? { movedServerReadKB: avg(rows.moved, 'serverReadKB'), movedPhoneKB: avg(rows.moved, 'phoneKB') } : {}),
    };
  }
  const file = path.join(here, 'results', `probe-${label}-n${users}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ label, users, repeat, sections: out }, null, 2));
  console.log(JSON.stringify({ label, users, sections: out }, null, 1));
}
main().catch(error => { console.error(error); process.exit(1); });
