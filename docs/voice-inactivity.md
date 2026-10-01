# Voice Chat all-muted confirmation

The shared iOS/Android VoiceProvider mounts VoiceInactivityMonitor while connected to an active channel. LiveKit microphone, speech, membership, and reconnect events report activity. A 30-second recovery heartbeat retries missed reports. Brief speech/unmute events are retained until a report succeeds.

The backend verifies room membership and all audio publications using LiveKit. It stores its timer in the server-owned `voice_inactivity/{orgId}/{tripId}` path. A Cloud Tasks deadline checks again after five minutes. Obsolete timer generations are ignored. No client clock controls the deadline. Network/service failures never count as silence.

Connected Admins, Managers, and Co-Hosts see “Are you still using the Voice Chat?” on any app screen. Background push notifications open Voice Chat; the current server state determines whether the question is still visible. Push delivery uses the existing notification preferences and permissions. Participants cannot read the question or submit a response. No auto-close timer runs while this question is pending.

The mobile prompt waits for database presence and verifies the current LiveKit room SID, preventing permission races during reconnect and questions from an earlier room.

The first valid response commits in an RTDB transaction. Guarded transactions hold a value listener until completion so a cold SDK cache cannot silently discard a response or deadline check. Yes dismisses all copies and starts a fresh five-minute period if everyone is still muted. No dismisses all copies, marks the channel inactive, and deletes the LiveKit room to disconnect everyone. An event-triggered retry also completes room closure if the responding callable fails after accepting No.

## Deployment

Deploy the database rules and these functions before releasing the updated iOS/Android apps:

- `reportVoiceActivity`, `respondToVoiceInactivity`
- `onVoiceInactivityChanged`, `checkVoiceInactivity`, `resetVoiceInactivity`
- Updated `generateLiveKitToken` and `toggleChannelStatus`

Cloud Tasks must be enabled, with enqueue/invoke permissions for the runtime service account and the `checkVoiceInactivity` task function in `europe-west1`. The functions use the existing LiveKit environment configuration and notification service. Production deployment was not performed as part of this change.

## Validation

Run `node --test functions/test/voiceInactivity.test.js functions/test/guardedTransaction.test.js functions/test/tripVoice.test.js` for deadline, activity reset, role/membership, stale task/session, first-answer, room closure, push recipient, and repeated Yes coverage. Both platform Babel transforms were checked. Physical-device behavior and deployed Cloud Tasks/RTDB rules still need validation.

On iOS and Android, connect an Admin, Manager, Co-Host, and Participant. Mute all four and verify the question appears after five minutes only for the three staff members. Repeat with speech/unmute just before the deadline. Answer Yes, remain muted, and verify another question after five minutes. Have two hosts answer concurrently and verify only one action wins. Answer No and verify every device disconnects. Leave the question unanswered beyond five minutes and verify this feature does not close the room. Repeat with a backgrounded host, navigation away from Voice Chat, a disconnected/rejoined host, and a network interruption.

The separate one-person timeout is now enforced by `tripVoiceService` and the existing `checkTripVoiceAccess` Cloud Tasks worker. Signed LiveKit membership events start/cancel a five-minute `session.soloSince` deadline; the minute reconciliation job repairs missed events. Every deadline rechecks actual media connections. Two connected users of any role cancel the timeout; one remaining Participant gets the same five minutes as a host. An empty room retains the existing short cleanup grace period.

Solo termination uses `alone_timeout`, records the remaining user's UID in the channel end metadata, and deletes that session's LiveKit room. The shared app provider explains the termination to that user on iOS/Android. A fresh session receives a fresh timer; obsolete tasks cannot end it. This rule remains independent of all-muted Yes/No questions, including an unanswered question.

Deploy the updated Voice endpoints/webhook, `getTripFeatureAccess`, `checkTripVoiceAccess`, and `reconcileTripVoiceAccess` with the shared backend service changes, and release the updated app code. The existing `onTripFeatureAccessChanged` queue trigger and signed LiveKit webhook delivery must be enabled. No production deployment was performed here.
