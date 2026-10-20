#!/usr/bin/env node
// Earlier account deletion under the GDPR (decision 2). Developers run this on a support
// request; there is no button in the app. It skips the 30 day waiting period and runs the
// same wipe as the daily job: profile, tokens, location and media go, chat is anonymised,
// payment / invoice / seat records stay. Every run is written to deletion_audit (and to the
// logs of the user's organisations) with the operator, the reason and the ticket.
//
//   node functions/scripts/eraseAccountNow.js --uid <uid> --operator <name> --reason "<text>" --ticket <id>            dry run
//   node functions/scripts/eraseAccountNow.js --uid <uid> --operator <name> --reason "<text>" --ticket <id> --apply    erase
//
// It talks to whatever database functions/admin.js resolves (production with application default
// credentials, or an emulator when the emulator environment variables are set). An early erase
// sends no mail. An organisation owner is refused; delete the organisation first.

function parseArgs(argv) {
  const out = { apply: argv.includes('--apply') };
  for (const key of ['uid', 'operator', 'reason', 'ticket']) {
    const i = argv.indexOf(`--${key}`);
    out[key] = i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  }
  const missing = ['uid', 'operator', 'reason', 'ticket'].filter((k) => !out[k]);
  if (missing.length) throw new Error(`Missing: ${missing.map((k) => `--${k}`).join(', ')}`);
  return out;
}

async function run({ uid, operator, reason, ticket, apply }, service = null) {
  const { db, auth } = require('../admin');
  const queued = (await db.ref(`account_deletions/${uid}`).get()).val();
  let exists = true;
  try { await auth.getUser(uid); } catch (e) { if (e.code === 'auth/user-not-found') exists = false; else throw e; }
  const plan = { uid, auth_user_exists: exists, already_queued: !!queued, apply };
  if (!apply) return { ...plan, status: 'dry-run' };
  const svc = service || require('../services/deletionService').getDeletionService();
  return { ...plan, ...(await svc.eraseAccountNow(uid, { actor: `dev:${operator}`, reason, ticket })) };
}

module.exports = { parseArgs, run };

if (require.main === module) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  run(args).then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  }, (error) => { console.error(error); process.exit(1); });
}
