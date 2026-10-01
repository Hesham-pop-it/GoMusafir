// Calendar selections use UTC midnight through midnight after the final day.
// Timestamp callers are billed for every started day and 30-day period.
const DAY_MS = 86400000;
function seatUsage(start, end, participants) {
  const count = Number(participants);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start ||
      !Number.isSafeInteger(count) || count < 1 ||
      !['number', 'string'].includes(typeof participants) ||
      !Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime())) {
    throw new Error('Select valid trip dates and a positive whole number of participants.');
  }
  const durationDays = Math.ceil((end - start) / DAY_MS);
  const seatPeriods = Math.ceil(durationDays / 30);
  const requiredSeats = count * seatPeriods;
  if (!Number.isSafeInteger(requiredSeats)) throw new Error('Seat requirement is too large.');
  return { durationDays, seatPeriods, requiredSeats, participants: count };
}
function selectedDateRange(start, end) {
  const parse = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const timestamp = Date.parse(value + 'T00:00:00.000Z');
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : NaN;
  };
  return { startDate: parse(start), endDate: parse(end) + DAY_MS };
}
module.exports = { seatUsage, selectedDateRange, DAY_MS };
