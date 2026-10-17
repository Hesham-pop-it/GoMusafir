// Compares two records the way the Realtime Database would hold them: null and
// empty objects are absent, key order does not matter.
function canonical(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
// The database drops null and empty objects, so compare what it would hold.
function stored(value) {
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const kept = stored(child);
    if (kept === null || kept === undefined || (typeof kept === 'object' && !Object.keys(kept).length)) continue;
    out[key] = kept;
  }
  return out;
}

module.exports = { canonical, stored };
