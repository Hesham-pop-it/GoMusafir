#!/usr/bin/env node
// One-off backfill for trip_view and chat_view on trips that existed before it. Developers run
// this manually, after deploying the functions and rules, before the app release.
//
//   node functions/scripts/backfillTripViews.js                  dry run (counts only)
//   node functions/scripts/backfillTripViews.js --apply          write
//   node functions/scripts/backfillTripViews.js --apply --trip <tripId>
//
// Same database resolution as backfillOrgMembers.js. Idempotent: it rewrites each
// entry from the source records and removes entries of people who left.
const { db } = require('../admin');
const { writeTripView, mirrorRecentChat } = require('../services/tripViewService');

async function run({ apply = false, trip = null } = {}) {
  const tripIds = trip ? [trip] : Object.keys((await db.ref('trips_orgs').get()).val() || {});
  let entries = 0;
  for (const tripId of tripIds) {
    if (apply) entries += (await writeTripView(tripId)).written + await mirrorRecentChat(tripId);
    else entries += Object.keys((await db.ref(`trips_participants/${tripId}`).get()).val() || {}).length;
  }
  return { trips: tripIds.length, entries };
}
module.exports = { run };

if (require.main === module) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const trip = args.includes('--trip') ? args[args.indexOf('--trip') + 1] : null;
  run({ apply, trip }).then(result => {
    console.log(`${apply ? 'Applied' : 'Dry run'}: ${result.trips} trips, ${result.entries} entries.`);
    process.exit(0);
  }, error => { console.error(error); process.exit(1); });
}
