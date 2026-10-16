#!/usr/bin/env node
// One-off backfill for org_members and trip_cards. Developers run this manually.
//
//   node functions/scripts/backfillOrgMembers.js                 dry run (counts only)
//   node functions/scripts/backfillOrgMembers.js --apply         write
//   node functions/scripts/backfillOrgMembers.js --apply --org <orgId>
//
// It talks to whatever database functions/admin.js resolves: production with the
// local service account or application default credentials, or an emulator when
// FIREBASE_DATABASE_EMULATOR_HOST and FIREBASE_DATABASE_URL are set. It is
// idempotent: it only sets org_members/<org>/<uid> = true and rewrites cards from
// the staff lists and trips_participants. It never deletes anything.
const { db } = require('../admin');
const { backfillOrg } = require('../services/orgMembersService');

async function run({ apply = false, org = null } = {}) {
  const orgIds = org ? [org] : Object.keys((await db.ref('orgs').get()).val() || {});
  const results = [];
  for (const orgId of orgIds) results.push(await backfillOrg(orgId, { apply }));
  return results;
}
module.exports = { run };

if (require.main === module) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const org = args.includes('--org') ? args[args.indexOf('--org') + 1] : null;
  run({ apply, org }).then(results => {
    const total = results.reduce((sum, r) => ({ members: sum.members + r.members, cards: sum.cards + r.cards }), { members: 0, cards: 0 });
    console.log(`${apply ? 'Applied' : 'Dry run'}: ${results.length} orgs, ${total.members} members, ${total.cards} cards.`);
    process.exit(0);
  }, error => { console.error(error); process.exit(1); });
}
