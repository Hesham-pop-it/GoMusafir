# Four simultaneous speakers

Each trip voice room has four microphone slots total, including Admin, Co-Host
and Manager. Joining uses a listen-only LiveKit token. Hold to Talk requests a
slot; releasing it cancels a waiting request or frees an occupied slot. The next
waiting person receives permission automatically. Organizers can move a request
to the front or revoke a speaker through the participant microphone control.
Moving someone forward does not turn on a microphone they have not requested.

Admin, Co-Host and Manager unmute directly and have priority over regular
participants. If all slots are occupied, the latest admitted regular participant
returns to the waiting queue before the organizer's permission is enabled. They
can regain a slot while still holding to talk. If four organizers already occupy
the slots, another organizer receives a microphones-full error rather than joining
the queue. Organizer priority never increases the four-publisher limit.

The queue is shown on Voice Chat and Trip Overview. Organizer microphone toggles
and lock-screen controls use the same allocator. Global mute clears participant
requests and permissions while retaining staff slots. All connected users can
continue listening. Reconnecting resets microphone intent, so users request again.

## Enforcement

`updateVoiceSpeaker` validates current trip access. A per-room RTDB transaction
lock serializes queue changes and LiveKit RPCs. The allocator persists its intent,
revokes outgoing publisher permissions, then grants at most four microphone-only
permissions. Revocation failures cannot free a slot for another grant. Requests
are bound to a LiveKit participant SID and an individual press/request ID; stale
release calls cannot remove a newer request. Queue and lock writes are server-only.

Signed participant webhooks remove disconnected requests. The minute scheduler
repairs missed events and interrupted permission changes. A crashed worker's lock
expires after two minutes; workers stop starting operations after twenty seconds
and the LiveKit transport timeout is eight seconds. Recovery can therefore delay
queue movement during an outage. Slots count microphone permission, including an
unmuted but silent organizer, rather than voice-activity detection.

## Rollout

Deploy the updated RTDB rules, `generateLiveKitToken`, `livekitWebhook`,
`updateVoiceSpeaker`, `onVoiceGlobalMuteChanged`, and `reconcileVoiceSpeakers`
together with the updated mobile application. Old app versions do not request
speaker slots and cannot speak with the new listen-only token. Schedule this as
a coordinated app/backend rollout and end existing voice sessions to retire
previous unrestricted tokens and rooms. Do not deploy only the token change.

LiveKit must deliver signed participant join/leave webhooks. Verify Scheduler is
enabled for recovery. No Hetzner server provisioning or document changes are part
of this feature. The guide's main rules specify four; its older three-speaker
checklist and load-test rows should be interpreted as four for this rollout.

The application allocator is not a LiveKit server-wide publisher setting.
Self-hosted LiveKit does not invalidate previously issued tokens when permissions
are changed; reconnect/webhook reconciliation repairs unexpected publisher
permissions. A hard transport-level ceiling against malicious replay of refreshed
publisher tokens requires enforcement within the LiveKit server as well.

## Verification

Run focused unit checks:

```sh
node --test functions/test/voiceSpeakers.test.js functions/test/voiceToken.test.js scripts/tests/voiceSpeakerController.test.cjs
```

Run rules and real RTDB concurrency checks with demo emulators:

```sh
firebase emulators:exec --project demo-gomusafir --config firebase.test.json --only database,auth 'node functions/test/tripVoiceRules.integration.js && node functions/test/voiceSpeakerTransactions.integration.js'
```

Before release, use at least six devices on the deployed backend: fill four slots,
hold two waiting requests, release one, cancel another, moderate the queue, mute
all, disconnect a speaker, reconnect, and stop/restart the room. Confirm audible
audio only from admitted speakers, continued listening for the queue, and no late
microphone opening after release. Load-test four publishers at each target listener
count before making capacity claims.
