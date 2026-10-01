# Notification sounds

Standard notifications use `assets/sounds/gomusafir_standard.wav`, copied from
`GoMusafir_Standard_Short.wav` (1.4 seconds). SOS/emergency notifications use
`assets/sounds/gomusafir_sos.wav`, converted from `GoMusafir_SOS_short_v2.wav`
to 16-bit PCM (3 seconds). The supplied full/long variants are not used.

`functions/services/notificationSoundConfig.js` is shared by the app, push sender,
and Expo build plugin. SOS/emergency types and the legacy Safety channel always
select the SOS sound, even if another field requests a standard channel.
All other notification categories select the standard sound.

Foreground banners play audio after the existing push/database deduplication.
Standard audio cannot interrupt a playing SOS. The background FCM/APNs payload
specifies the sound directly so playback does not depend on JavaScript running.
Data-only messages presented by Notifee use the same policy. Silent server pushes
remain silent. Android channels are created at native application startup and
registered by the app, using versioned IDs to avoid old channels retaining the
system sound. User-controlled notification settings still apply.

## Release and device verification

Build and install new native iOS and Android binaries with the
`withNotificationSounds` Expo plugin, then deploy the Firebase Functions senders
that use `sendPushNotification`. An OTA JavaScript update alone cannot install
native sound resources. The plugin was also applied to the local native projects.
Old installed binaries do not contain these sounds/channels and may fall back to
system audio until upgraded; coordinate the backend release with the app rollout.

On physical devices with notification sound permitted, test standard chat, admin,
and voice notifications plus SOS/emergency notifications while foregrounded,
backgrounded, and locked. Check data-only delivery separately. Verify a standard
foreground notification during SOS playback cannot replace the SOS audio, and
push/database delivery of the same event produces only one sound. Test an upgrade
from a build with the old default/Chat/Safety channels as well as a clean install.

Automated checks: `node --test test/*.test.cjs`.
