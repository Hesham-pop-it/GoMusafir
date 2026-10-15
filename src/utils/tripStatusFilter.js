// Derives the home-screen status filter bucket from a trip. No native dependencies.
const STATUS_FILTERS = ['upcoming', 'active', 'ended'];

function toMs(value) {
    if (value === null || value === undefined || value === '') return NaN;
    const ms = typeof value === 'number' ? value : new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
}

// upcoming: start_date in the future and status 'active'. active: start_date <= now < end_date and status 'active'.
// ended: now >= end_date, or any status other than 'active'. A trip without usable dates matches only via closed.
function matchesStatusFilter(trip, filter, now = Date.now()) {
    if (!filter) return true;
    if (!trip) return false;
    const start = toMs(trip.start_date);
    const end = toMs(trip.end_date);
    // Only an 'active' trip can be upcoming or active; closed or any other status counts as ended.
    const closed = trip.status !== 'active';
    if (filter === 'upcoming') return !closed && start > now;
    if (filter === 'active') return !closed && start <= now && now < end;
    if (filter === 'ended') return closed || now >= end;
    return false;
}

module.exports = { STATUS_FILTERS, matchesStatusFilter };
