// Minimal in-memory Realtime Database and Storage fakes for cleanup tests.
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function createFakeDb(initial = {}) {
  let root = clone(initial);
  const parts = path => String(path || '').split('/').filter(Boolean);
  const read = path => {
    let node = root;
    for (const p of parts(path)) {
      if (node === null || typeof node !== 'object' || !(p in node)) return null;
      node = node[p];
    }
    return node === undefined ? null : node;
  };
  const prune = (node) => {
    if (node === null || typeof node !== 'object') return node;
    for (const k of Object.keys(node)) {
      node[k] = prune(node[k]);
      if (node[k] === null || (typeof node[k] === 'object' && Object.keys(node[k]).length === 0)) delete node[k];
    }
    return node;
  };
  const write = (path, value) => {
    const p = parts(path);
    if (!p.length) { root = value === null ? {} : clone(value); return; }
    let node = root;
    for (const seg of p.slice(0, -1)) {
      if (node[seg] === null || typeof node[seg] !== 'object') node[seg] = {};
      node = node[seg];
    }
    if (value === null) delete node[p[p.length - 1]]; else node[p[p.length - 1]] = clone(value);
    prune(root);
  };
  const snapshot = (value) => ({
    exists: () => value !== null && value !== undefined,
    val: () => clone(value),
    forEach: fn => { Object.keys(value || {}).forEach(k => fn({ key: k, val: () => clone(value[k]) })); },
  });
  const childValue = (obj, childPath) => parts(childPath).reduce((n, p) => (n && typeof n === 'object' ? n[p] : undefined), obj);
  const ref = (path = '') => ({
    get: async () => snapshot(read(path)),
    set: async value => write(path, value),
    remove: async () => write(path, null),
    update: async values => {
      for (const [k, v] of Object.entries(values)) write(path ? `${path}/${k}` : k, v);
    },
    orderByChild: child => ({
      equalTo: expected => ({ get: async () => {
        const all = read(path) || {};
        const hit = {};
        Object.keys(all).forEach(k => { if (childValue(all[k], child) === expected) hit[k] = all[k]; });
        return snapshot(Object.keys(hit).length ? hit : null);
      } }),
      startAt: min => ({ get: async () => {
        const all = read(path) || {};
        const hit = {};
        Object.keys(all).forEach(k => { const v = childValue(all[k], child); if (typeof v === 'number' && v >= min) hit[k] = all[k]; });
        return snapshot(Object.keys(hit).length ? hit : null);
      } }),
    }),
  });
  return { ref, dump: () => clone(root), read };
}

function createFakeBucket() {
  const deletedPrefixes = []; const deletedFiles = [];
  return {
    deletedPrefixes, deletedFiles,
    deleteFiles: async ({ prefix }) => { deletedPrefixes.push(prefix); },
    file: name => ({ delete: async () => { deletedFiles.push(name); } }),
  };
}

function createFakeAuth(users = {}) {
  const calls = [];
  return {
    calls,
    getUser: async uid => { if (!users[uid]) { const e = new Error('nf'); e.code = 'auth/user-not-found'; throw e; } return { customClaims: { ...(users[uid].claims || {}) } }; },
    setCustomUserClaims: async (uid, claims) => { calls.push(['claims', uid, claims]); },
    revokeRefreshTokens: async uid => { calls.push(['revoke', uid]); },
    deleteUser: async uid => { calls.push(['delete', uid]); },
  };
}

module.exports = { createFakeDb, createFakeBucket, createFakeAuth };
