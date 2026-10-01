const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject, withAndroidManifest, withMainApplication, IOSConfig } = require('@expo/config-plugins');
const { STANDARD, SOS } = require('../functions/services/notificationSoundConfig');
const profiles = [STANDARD, SOS];

function copySounds(root, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const profile of profiles) {
        fs.copyFileSync(path.join(root, 'assets/sounds', profile.file), path.join(destination, profile.file));
    }
}

module.exports = function withNotificationSounds(config) {
    config = withDangerousMod(config, ['android', async config => {
        copySounds(config.modRequest.projectRoot, path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/raw'));
        return config;
    }]);
    config = withAndroidManifest(config, config => {
        const app = config.modResults.manifest.application[0];
        const key = 'com.google.firebase.messaging.default_notification_channel_id';
        app['meta-data'] = (app['meta-data'] || []).filter(item => item.$['android:name'] !== key);
        app['meta-data'].push({ $: { 'android:name': key, 'android:value': STANDARD.channelId } });
        return config;
    });
    config = withMainApplication(config, config => {
        if (config.modResults.language !== 'kt') throw new Error('Notification sounds require a Kotlin MainApplication');
        const start = '    // GoMusafir notification channels: start';
        const end = '    // GoMusafir notification channels: end';
        const blocks = profiles.map(profile => `
      android.app.NotificationChannel("${profile.channelId}", "${profile.name}", android.app.NotificationManager.IMPORTANCE_HIGH).also { channel ->
        channel.enableVibration(true)
        channel.setSound(android.net.Uri.parse("android.resource://" + packageName + "/raw/${profile.sound}"), attributes)
        manager.createNotificationChannel(channel)
      }`).join('\n');
        const code = `${start}
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      val manager = getSystemService(android.app.NotificationManager::class.java)
      val attributes = android.media.AudioAttributes.Builder()
        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
${blocks}
    }
${end}`;
        let source = config.modResults.contents;
        source = source.replace(new RegExp(`${start}[\\s\\S]*?${end}\\n?`), '');
        if (!source.includes('super.onCreate()')) throw new Error('Unable to install notification channels in MainApplication');
        config.modResults.contents = source.replace('super.onCreate()', `super.onCreate()\n${code}`);
        return config;
    });
    return withXcodeProject(config, config => {
        const projectName = config.modRequest.projectName;
        copySounds(config.modRequest.projectRoot, path.join(config.modRequest.platformProjectRoot, projectName));
        for (const profile of profiles) {
            IOSConfig.XcodeUtils.addResourceFileToGroup({
                filepath: `${projectName}/${profile.file}`, groupName: projectName,
                isBuildFile: true, project: config.modResults,
            });
        }
        return config;
    });
};
