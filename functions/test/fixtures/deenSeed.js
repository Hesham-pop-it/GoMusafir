// Seed additions Deen needs, as a flat RTDB update map. The website seed (scripts/dev-seed.mjs) should add the
// same nodes for its demo organisation; the integration tests use this builder with their own organisation.
// Shapes mirror what createTripRecord and the app write (orgs/{org}/trips, trips_active/{org}/{trip}/templates).
const DAY = 86400000;

function deenSeed({ org = 'demoorg1', creator = 'saif', now = Date.now(), prepaidSeats = 78 } = {}) {
  const u = {};
  u[`orgs/${org}/prepaid_seats`] = prepaidSeats; // 78 free: a 120 person trip of 14 days is 42 seats short (EUR 419.58)
  const previous = {
    ramadan2026: {
      title: 'Ramadan 2026', location: 'Makkah, Saudi Arabia', image: 'https://example.test/banners/ramadan-2026.jpg',
      start: -230 * DAY, days: 14, seats: 120,
      templates: [
        ['Welkom', 'Assalamu alaikum, welkom bij de groep. Hier staat alles wat je nodig hebt.'],
        ['Verzamelen', 'We verzamelen vandaag om 18:00 in de lobby.'],
        ['Vertrek luchthaven', 'De bus naar de luchthaven vertrekt om 06:00. Neem je paspoort mee.'],
        ['Gebed', 'Denk aan het gezamenlijke gebed na Maghrib.'],
      ],
    },
    madinahWeek2025: {
      title: 'Madinah Week 2025', location: 'Madinah, Saudi Arabia', image: null,
      start: -400 * DAY, days: 8, seats: 30, templates: [],
    },
  };
  for (const [id, p] of Object.entries(previous)) {
    const start = now + p.start - ((now + p.start) % DAY), end = start + p.days * DAY;
    u[`orgs/${org}/trips/${id}`] = {
      title: p.title, location: p.location, time_zone: 'Asia/Riyadh', date: `${p.days} days`, participants: 1, total_seats: p.seats,
      image: p.image, status: 'closed', invitation_code: null, start_date: start, end_date: end, invite_expires_at: end,
      created_by: creator, created_at: start - 40 * DAY, duration_days: p.days, seat_periods: 1, seats_required: p.seats, seats_allocated: p.seats,
    };
    u[`trips_orgs/${id}`] = org;
    p.templates.forEach(([name, message], i) => {
      u[`trips_active/${org}/${id}/templates/tpl${i + 1}`] = { name, message, created_by: creator, timestamp: start + i * 1000 };
    });
  }
  return u;
}

module.exports = { deenSeed };
