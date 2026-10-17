// Loaded into the functions emulator through NODE_OPTIONS by emulators.sh.
// 1. Routes Admin SDK database traffic through the counting proxy.
// 2. The emulator only fires database triggers declared in us-central1, while
//    production uses europe-west1, so the harness moves them there locally.
// 3. The emulator's firebase-admin stand-in drops admin.database.ServerValue,
//    which onSignIn uses, so the harness puts it back.
// Function discovery runs without FUNCTIONS_EMULATOR, so only the host
// override waits for the emulator runtime; the region change applies to both.
if (process.env.TRAFFIC_ADMIN_DB_HOST) {
  if (process.env.FUNCTIONS_EMULATOR === 'true') process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.TRAFFIC_ADMIN_DB_HOST;
  const Module = require('module');
  const load = Module._load;
  const patched = new WeakMap();
  Module._load = function (request, ...rest) {
    const exported = load.call(this, request, ...rest);
    if (request === 'firebase-admin' && exported && !exported.database?.ServerValue) {
      if (!patched.has(exported)) {
        const { ServerValue } = load.call(this, 'firebase-admin/database', ...rest);
        patched.set(exported, new Proxy(exported, { get(target, key) {
          const value = Reflect.get(target, key);
          return key === 'database' && typeof value === 'function'
            ? Object.assign((...args) => value(...args), { ServerValue }) : value;
        } }));
      }
      return patched.get(exported);
    }
    if (request !== 'firebase-functions/v2/database') return exported;
    if (!patched.has(exported)) {
      const copy = { ...exported };
      for (const name of ['onValueCreated', 'onValueWritten', 'onValueUpdated', 'onValueDeleted']) {
        copy[name] = (opts, handler) => exported[name](
          typeof opts === 'object' ? { ...opts, region: 'us-central1' } : opts, handler);
      }
      patched.set(exported, copy);
    }
    return patched.get(exported);
  };
}
