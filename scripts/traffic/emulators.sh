#!/bin/sh
# Starts the counting proxy and the local emulators for the traffic harness.
# Demo project only: nothing reaches a real Firebase project.
set -e
cd "$(dirname "$0")/../.."
node scripts/traffic/proxy.cjs &
PROXY=$!
# Function discovery only sees the functions .env files, and this one is
# loaded for the demo project alone. Removed again on exit.
ENVFILE=functions/.env.demo-gomusafir
printf 'NODE_OPTIONS=--require %s/scripts/traffic/admin-preload.cjs\nTRAFFIC_ADMIN_DB_HOST=127.0.0.1:19511\n' "$PWD" > "$ENVFILE"
trap 'kill $PROXY 2>/dev/null; rm -f "$ENVFILE"' EXIT INT TERM
NODE_OPTIONS="--require $PWD/scripts/traffic/admin-preload.cjs" \
TRAFFIC_ADMIN_DB_HOST=127.0.0.1:19511 \
FUNCTIONS_DISCOVERY_TIMEOUT=60 \
FIREBASE_DATABASE_URL=https://demo-gomusafir-default-rtdb.firebaseio.com \
firebase emulators:start --config firebase.traffic.json --project demo-gomusafir --only auth,database,functions
