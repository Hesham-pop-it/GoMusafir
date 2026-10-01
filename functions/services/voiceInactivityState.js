const INACTIVITY_MS = 5 * 60 * 1000;
const STAFF_ROLES = ['admin', 'manager', 'co-host'];

// No microphone publication means muted. All audio publications must be muted.
function everyoneMuted(participants) {
  return participants.length > 0 && participants.every(p =>
    (p.tracks || []).filter(t => t.type === 0).every(t => t.muted === true));
}

function observe(state, { roomSid, muted, activity, now, id, startedAt = now }) {
  if (state?.observedAt > now) return undefined;
  if (state?.roomSid === roomSid && ['pending', 'ending', 'ended'].includes(state.status)) return undefined;
  const sameRoom = state?.roomSid === roomSid;
  return {
    roomSid, observedAt: now,
    status: muted && !activity ? 'timing' : 'active',
    ...(muted && !activity ? {
      startedAt: sameRoom && state.status === 'timing' ? state.startedAt : startedAt,
      id: sameRoom && state.status === 'timing' ? state.id : id,
    } : {}),
  };
}

function answer(state, id, keepActive, now, muted, uid) {
  if (state?.status !== 'pending' || state.id !== id) return undefined;
  return keepActive
    ? { roomSid: state.roomSid, status: muted ? 'timing' : 'active', observedAt: now,
      ...(muted ? { startedAt: now, id: `${id}-next` } : {}) }
    : { ...state, status: 'ending', answeredBy: uid };
}

module.exports = { INACTIVITY_MS, STAFF_ROLES, everyoneMuted, observe, answer };
