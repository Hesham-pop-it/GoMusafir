const { withMainActivity } = require('@expo/config-plugins');

// Android can keep the process alive for location after its task is closed.
// Notify the existing JS voice owner before the Activity is destroyed.
module.exports = function withVoiceTaskClose(config) {
    return withMainActivity(config, mod => {
        const marker = '// GoMusafir voice task close';
        if (!mod.modResults.contents.includes(marker)) {
            const hook = `
  ${marker}
  override fun onDestroy() {
    if (isFinishing && !isChangingConfigurations) {
      runCatching {
        (application as com.facebook.react.ReactApplication).reactHost?.currentReactContext
          ?.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          ?.emit("gomusafirTaskClosed", null)
      }
    }
    super.onDestroy()
  }
`;
            const end = mod.modResults.contents.lastIndexOf('}');
            if (end < 0) throw new Error('Could not locate MainActivity class');
            mod.modResults.contents = mod.modResults.contents.slice(0, end) + hook + mod.modResults.contents.slice(end);
        }
        return mod;
    });
};
