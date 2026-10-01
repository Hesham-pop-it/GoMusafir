# Participant access lifecycle

A participant can use app features only while they have at least one membership in an `active` trip with a finite numeric `end_date` strictly later than server time. Future-start trips are eligible once enrolled; the end timestamp is exclusive. Missing dates, ended/closed/cancelled trips, and removed memberships do not qualify. Staff exemption requires an Auth role and matching organization staff membership.

Trip closure/expiry never deletes an account. Delete Account remains an explicitly requested operation and requires current app access. A later trip reuses the same account. Other valid memberships preserve access; the current trip moves to an eligible membership if necessary.

## Enforcement

- All authenticated existing callable endpoints use a shared fresh-session and current-trip guard, except explicitly listed enrollment, email verification, and public checkout/metadata operations. Those exceptions do not grant trip access.
- Ordinary participant sign-in is blocked by `onSignIn` without a valid trip. New accounts receive a pending role for onboarding. Returning participants use a valid invitation and a one-time email challenge to authenticate for enrollment. Challenges expire after ten minutes, permit five attempts, and are consumed atomically. `redeemInvitation` revalidates the trip before granting membership.
- RTDB rules check canonical membership, status, end time, and a server-owned revocation cutoff. Profile flags, staff_org_id, and joined_trips cannot be used to self-grant permission. Limited own-account/enrollment data remains accessible during enrollment.
- Storage uses server-owned Firestore `app_access` documents, because Storage rules cannot read RTDB. The mirror carries trip expiry timestamps and session revocation cutoffs, not profile data. Clients cannot read or modify the mirror through Firestore.
- Access reconciliation uses Firestore transactions plus versioned RTDB publication so an older refresh cannot overwrite a newer revocation. Failed refresh-token revocations remain pending and are retried.
- The app observes server access state, sets an expiry timer, checks on foreground return, and reconciles every 30 seconds. Failed access verification logs participants out. Another eligible trip preserves access.
- Backend API/RTDB/Storage authenticated requests reject expiry using server time immediately. The one-minute scheduler revokes refresh tokens, marks indexed expired trips ended, and disconnects existing LiveKit rooms. Background voice disconnection and scheduled Auth revocation therefore have scheduler latency; new voice tokens are denied immediately. Manually closed trips reconcile synchronously.
- Already downloaded content cannot be recalled. Existing public Firebase download URLs remain bearer links independent of app sessions; these rules govern authenticated Storage requests. Retiring those historical links or changing media delivery requires a separate media migration.

## Rollout (not performed by the implementation task)

1. Ensure the Firebase project's `(default)` Firestore database exists. The deployed functions service account needs access to it. If the project has other Firestore consumers, merge the `app_access` deny rule into their rules instead of replacing unrelated policies.
2. Deploy the access lifecycle functions and the updated callable handlers. Ensure the existing `onSignIn` and `onUserSignup` Identity Platform blocking hooks are registered. Configure the existing SendGrid and LiveKit settings for the new enrollment/lifecycle functions.
3. As an authenticated organization admin, call `backfillParticipantAccess` once per organization. It populates existing account access mirrors and the indexed expiration queue. Inspect malformed/missing legacy end dates before enforcing the rules; these fail closed.
4. Deploy `database.rules.json`, `firestore.rules`, and `storage.rules`. Approve the Firebase Storage-to-Firestore rules integration permission during deployment. Coordinate deployment with the mobile release; older mobile clients lack the returning-participant enrollment flow.
5. Release the mobile app with the new access watcher and enrollment flow. Test email delivery, joining a new trip with an existing account, expiry with an open app/background voice room, and account deletion on an active trip in staging before production rollout.

No production data, deployed functions, or installed mobile build was changed as part of local verification.

## Local verification

Run from the repository root:

```sh
node --test functions/test/*.test.js
firebase emulators:exec --project demo-gomusafir --config firebase.test.json --only database,auth,firestore,storage 'node functions/test/participantRules.integration.js && node functions/test/participantStorage.integration.js'
```

The demo-only emulator scripts refuse to run without emulator environment variables. Coverage includes expiry without a cron run, cached-token replay, protected authorization fields, preserving accounts, multiple memberships, backend sign-in rejection, enrollment proof/replay/attempt limits, client timers/foreground checks, and media permission checks.
