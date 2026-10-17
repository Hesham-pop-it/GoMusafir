# Traffic harness

Measures how much data the app moves per pilgrim, locally, against the Firebase
emulators of the `demo-gomusafir` project. Nothing reaches a real Firebase
project and nothing costs money.

## What it runs

- `emulators.sh` starts a byte-counting proxy (`proxy.cjs`) and the auth,
  database and functions emulators with `firebase.traffic.json`.
  - phones talk to the database through port 19510 and to functions through 19512;
  - the functions' own database reads go through 19511 (`admin-preload.cjs`);
  - stats at http://127.0.0.1:19519/stats, reset with `/reset`.
- `admin-preload.cjs` only exists for the emulator: it routes Admin SDK reads
  through the proxy, moves database triggers to us-central1 (the emulator does
  not fire triggers declared in europe-west1) and restores
  `admin.database.ServerValue`, which the emulator's firebase-admin stand-in drops.
- `seed.cjs N` creates one active trip with N fake pilgrims and one admin.
- `run.mjs` starts N virtual pilgrims that run the app's real
  `src/services/visibilityData.js` in Node (React and React Native are shimmed
  in `shims/`, `vu-loader.mjs` gives each pilgrim its own module copy). Each
  pilgrim holds what the trip overview holds: two revision hooks plus the
  account, voice speaker, notifications, chat and locations subscriptions.
  Someone sends a chat line every 10 s and every pilgrim writes a location every 15 s.
- `probe.mjs` sends single callable requests one at a time and reports, per
  section, what the server read and what the phone received: for a first fetch,
  for a repeat poll with the held hash and (directory) after one pilgrim moved.
  It waits 3.2 s before each request so the server's 3 s record cache never helps.

## Run

```sh
scripts/traffic/emulators.sh            # in its own terminal, wait for "All emulators ready"
node scripts/traffic/seed.cjs 25
node scripts/traffic/run.mjs --label after --users 25 --minutes 3 --warmup 20
node scripts/traffic/probe.mjs --label after --users 25 --repeat 3
```

Results land in `scripts/traffic/results/` (ignored by git). `run.mjs` scales
the measured minutes to a day with the app open 4 h and compares that with
`budgets.json`; `--enforce` exits 1 when a budget is exceeded.

## Reading the numbers

- Bytes are counted on the wire without TLS or gzip, so they are close to, not
  equal to, billed bytes.
- One Mac runs every function call. From about 25 pilgrims the functions
  emulator becomes the bottleneck and pilgrims poll less often than the app
  would; the per-day numbers of `run.mjs` are then too low for the slow code.
  Compare per-call numbers (`probe.mjs`, `serverReadKBPerCall`) when that
  happens.
- `serverDatabaseReads` is everything the functions read, triggers included.
