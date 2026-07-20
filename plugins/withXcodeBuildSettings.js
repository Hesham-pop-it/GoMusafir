const { withXcodeProject } = require('@expo/config-plugins');

function withXcodeBuildSettings(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    
    // Disable User Script Sandboxing to allow CocoaPods and Expo scripts
    // (such as copying frameworks and resources via rsync) to execute correctly.
    xcodeProject.addBuildProperty('ENABLE_USER_SCRIPT_SANDBOXING', 'NO');
    
    return config;
  });
}

module.exports = withXcodeBuildSettings;
