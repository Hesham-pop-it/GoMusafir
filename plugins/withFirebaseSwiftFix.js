const { withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');

module.exports = function withFirebaseSwiftFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const fileInfo = IOSConfig.Paths.getAppDelegate(config.modRequest.projectRoot);
      let contents = fs.readFileSync(fileInfo.path, 'utf8');
      
      // If FirebaseApp.configure() is not already added, inject it right before the first delegate setup
      if (!contents.includes('FirebaseApp.configure()')) {
        contents = contents.replace(
          /reactNativeDelegate\s*=\s*delegate/,
          'FirebaseApp.configure()\n    reactNativeDelegate = delegate'
        );
        fs.writeFileSync(fileInfo.path, contents, 'utf8');
      }
      return config;
    }
  ]);
};
