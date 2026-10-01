const DAY_MS = 86400000;
const ALLOWANCE_SECONDS = 3600;
const HOST_RECONNECT_GRACE_MS = 15000;
const SOLO_TIMEOUT_MS = 5 * 60 * 1000;
const EXHAUSTED_MESSAGE = 'Pre-trip Voice has been used. Full Voice will become available 24 hours before your journey starts.';

function validTripDates(start, end) {
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

// All timestamps and transitions are supplied by trusted backend code.
function featureState(trip, now) {
  const valid = trip?.status === 'active' && validTripDates(trip.start_date, trip.end_date);
  const ended = !valid || now >= trip.end_date;
  return {
    tripStatus: ended ? 'ENDED' : now < trip.start_date ? 'UPCOMING' : 'LIVE',
    voiceAccess: ended ? 'EXPIRED' : now < trip.start_date - DAY_MS ? 'PRE_TRIP_LIMITED' : 'FULL',
    fullVoiceAt: valid ? trip.start_date - DAY_MS : 0,
    tripStartsAt: valid ? trip.start_date : 0,
    tripEndsAt: valid ? trip.end_date : 0,
  };
}

function settle(previous, trip, now) {
  const state = { ...previous, ...featureState(trip, now), serverNow: now,
    preTripVoiceAllowanceSeconds: ALLOWANCE_SECONDS };
  let usedMs = previous?.preTripVoiceUsedMs || 0;
  const session = previous?.session ? { ...previous.session } : null;
  if (session?.status === 'active') {
    // Account against the previous schedule before applying a date change.
    const cutoff = Math.min(now, previous.fullVoiceAt || state.fullVoiceAt, previous.tripEndsAt || state.tripEndsAt);
    const chargeMs = Math.min(Math.max(0, ALLOWANCE_SECONDS * 1000 - usedMs), Math.max(0, cutoff - session.accountedAt));
    if (chargeMs > 0) {
      // Keep contiguous charged intervals per session so a delayed, signed
      // room-finished event can remove time after the actual media stop.
      const intervals = (session.chargedIntervals || []).map(interval => ({ ...interval }));
      const last = intervals[intervals.length - 1];
      const until = session.accountedAt + chargeMs;
      if (last?.until === session.accountedAt) last.until = until;
      else intervals.push({ from: session.accountedAt, until });
      session.chargedIntervals = intervals;
    }
    usedMs += chargeMs;
    session.accountedAt = Math.max(session.accountedAt, now);
  }
  state.preTripVoiceUsedMs = Math.min(ALLOWANCE_SECONDS * 1000, usedMs);
  state.preTripVoiceUsedSeconds = state.preTripVoiceUsedMs / 1000;
  state.preTripVoiceRemainingSeconds = Math.max(0, ALLOWANCE_SECONDS - state.preTripVoiceUsedSeconds);
  state.session = session;
  if (session && session.status !== 'ending') {
    if (state.voiceAccess === 'EXPIRED') {
      session.status = 'ending'; session.endReason = 'trip_ended';
    } else if (state.voiceAccess === 'PRE_TRIP_LIMITED' && state.preTripVoiceRemainingSeconds <= 0) {
      session.status = 'ending'; session.endReason = 'pre_trip_exhausted';
    } else if (session.status === 'pending' && session.pendingUntil <= now) {
      session.status = 'ending'; session.endReason = 'start_timeout';
    }
  }
  const boundaries = [state.tripStartsAt, state.fullVoiceAt, state.tripEndsAt].filter(time => time > now);
  if (session?.status === 'pending') boundaries.push(session.pendingUntil);
  if (session?.status === 'active' && state.voiceAccess === 'PRE_TRIP_LIMITED') {
    boundaries.push(now + state.preTripVoiceRemainingSeconds * 1000);
  }
  if (session?.status === 'active' && Number.isFinite(session.noHostsSince)) {
    boundaries.push(session.noHostsSince + HOST_RECONNECT_GRACE_MS);
  }
  if (session?.status === 'active' && Number.isFinite(session.soloSince)) {
    boundaries.push(session.soloSince + SOLO_TIMEOUT_MS);
  }
  state.horizonAt = previous?.horizonAt > now ? previous.horizonAt : now + 28 * DAY_MS;
  state.nextCheckAt = session?.status === 'ending'
    ? (previous?.session?.status === 'ending' ? previous.nextCheckAt || now : now)
    : Math.min(...boundaries, state.horizonAt);
  if (state.voiceAccess === 'EXPIRED' && !session) state.nextCheckAt = 0;
  return state;
}

function endAt(state, timestamp) {
  if (!state.session || !Number.isFinite(timestamp)) return state;
  const stoppedAt = Math.max(state.session.startedAt || timestamp, Math.min(state.serverNow, timestamp));
  const intervals = state.session.chargedIntervals || [];
  const refund = intervals.reduce((sum, interval) => sum + Math.max(0, interval.until - Math.max(interval.from, stoppedAt)), 0);
  state.preTripVoiceUsedMs = Math.max(0, state.preTripVoiceUsedMs - refund);
  state.preTripVoiceUsedSeconds = state.preTripVoiceUsedMs / 1000;
  state.preTripVoiceRemainingSeconds = ALLOWANCE_SECONDS - state.preTripVoiceUsedSeconds;
  state.session.chargedIntervals = intervals.filter(interval => interval.from < stoppedAt)
    .map(interval => ({ ...interval, until: Math.min(interval.until, stoppedAt) }));
  state.session.stoppedAt = stoppedAt;
  return state;
}

module.exports = { SOLO_TIMEOUT_MS, DAY_MS, ALLOWANCE_SECONDS, HOST_RECONNECT_GRACE_MS, EXHAUSTED_MESSAGE, validTripDates, featureState, settle, endAt };
