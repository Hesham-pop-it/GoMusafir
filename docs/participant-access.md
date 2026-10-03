# Participant access lifecycle

A participant can use app features only while they have at least one membership in an `active` trip with a finite numeric `end_date` strictly later than server time. Future-start trips are eligible once enrolled; the end timestamp is exclusive. Missing dates, ended/closed/cancelled trips, and removed memberships do not qualify. Staff exemption requires an Auth role and matching organization staff membership.

Trip closure/expiry never deletes an account. Delete Account remains an explicitly requested operation and requires a fresh authenticated session, even without an active trip. A later trip reuses the same account. Other valid memberships preserve access; the current trip moves to an eligible membership if necessary.

## Enforcement

- All authenticated existing callable endpoints use a shared fresh-session and current-trip guard, except explicitly listed enrollment, email verification, and public checkout/metadata operations. Those exceptions do not grant trip access.
- Ordinary participant sign-in is blocked by `onSignIn` without a valid trip. New accounts receive a pending role for onboarding. Returning participants use a valid invitation and a one-time email challenge to authenticate for enrollment. Challenges expire after ten minutes, permit five attempts, and are consumed atomically. `redeemInvitation` revalidates the trip before granting membership.
- RTDB rules check canonical membership, status, end time, and a server-owned revocation cutoff. Profile flags, staff_org_id, and joined_trips cannot be used to self-grant permission. Limited own-account/enrollment data remains accessible during enrollment.
- Media authorization uses Auth and Realtime Database in backend functions. Enrollment photos use `uploadProfilePhoto`; trip photos use `uploadTripPhoto`. Chat attachments, video thumbnails, and participant-avatar edits use `prepareMediaUpload` and `completeMediaUpload`. Direct client Storage writes are denied.
- Access reconciliation uses version-checked Realtime Database transactions. If another refresh publishes first, eligibility is recalculated before retrying. Failed refresh-token revocations remain pending and are retried. Sign-in, joining, account deletion, and media authorization use Realtime Database only.
- The app observes server access state, sets an expiry timer, checks on foreground return, and reconciles every 30 seconds. Failed access verification logs participants out. Another eligible trip preserves access.
- Backend API and RTDB requests reject expiry using server time immediately. Media upload URLs are create-only capabilities valid for five minutes, bound to the caller, trip, content type, and byte length. Finalization rechecks current membership and expiry before returning a download URL. The one-minute scheduler revokes refresh tokens, marks indexed expired trips ended, and disconnects existing LiveKit rooms. Background voice disconnection and scheduled Auth revocation therefore have scheduler latency; new voice tokens are denied immediately. Manually closed trips reconcile synchronously.
- Already downloaded content cannot be recalled. Existing public Firebase download URLs remain bearer links independent of app sessions; download links returned by backend uploads retain that existing behavior. Retiring bearer links requires a separate media-delivery migration.

## Rollout (not performed by the implementation task)

1. Deploy `uploadProfilePhoto`, `prepareMediaUpload`, and `completeMediaUpload` before releasing the updated clients. The functions service account needs Storage object access and signing capability (`iam.serviceAccounts.signBlob`, typically Service Account Token Creator on its own identity when using default credentials). Verify signed uploads on staging. Chat media is limited to less than 100 MB and participant avatars to less than 5 MB.
2. Deploy the access lifecycle functions and the updated callable handlers. Ensure the existing `onSignIn` and `onUserSignup` Identity Platform blocking hooks are registered. Configure the existing SendGrid and LiveKit settings for the new enrollment/lifecycle functions.
3. As an authenticated organization admin, call `backfillParticipantAccess` once per organization. It populates existing RTDB account access records and the indexed expiration queue. Inspect malformed/missing legacy end dates before enforcing the rules; these fail closed.
4. Deploy `database.rules.json` and `storage.rules` with the mobile release. Older clients that upload directly to Storage must update; direct uploads are denied by the new rules. No additional database service or rules integration is needed.
5. Release the mobile app with the new access watcher and enrollment flow. Test email delivery, joining a new trip with an existing account, expiry with an open app/background voice room, and account deletion on an active trip in staging before production rollout.

No production data, deployed functions, or installed mobile build was changed as part of local verification.

## Local verification

Run from the repository root:

```sh
node --test functions/test/*.test.js functions/test/*.test.cjs scripts/tests/uploadTripMedia.test.cjs scripts/tests/uploadJoinPhoto.test.cjs
firebase emulators:exec --project demo-gomusafir --config firebase.test.json --only database,auth,storage 'node functions/test/participantRules.integration.js && node functions/test/participantStorage.integration.js'
```

The demo-only emulator scripts refuse to run without emulator environment variables. Coverage includes expiry without a cron run, cached-token replay, protected authorization fields, preserving accounts, multiple memberships, backend sign-in rejection, enrollment proof/replay/attempt limits, client timers/foreground checks, and media permission checks.

## RTDB-only access service deployment

Deploy every function that calls `refreshAccess`, including lifecycle handlers, so all deployed handlers use the Realtime Database access service:

```sh
firebase deploy --project go-musafir --only functions:getAppAccess,functions:redeemInvitation,functions:onSignIn,functions:onTripAccessChanged,functions:onMembershipAccessChanged,functions:onStaffAccessChanged,functions:expireParticipantAccess,functions:backfillParticipantAccess,functions:closeTrip,functions:removeParticipantFromTrip,functions:deleteTrip,functions:deleteMyAccount,functions:deleteUserGlobally,functions:uploadProfilePhoto,functions:prepareMediaUpload,functions:completeMediaUpload
```

Deploy Storage rules alongside the updated mobile client after staging verification. This command does not deploy the separate email verification functions.
