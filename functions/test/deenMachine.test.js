const test = require('node:test');
const assert = require('node:assert/strict');
const { newDraft, say, STEPS } = require('../services/deen/deenMachine');
const { seatUsage } = require('../services/tripSeatMath');

const now = Date.UTC(2026, 9, 16, 10);
let available = 78;
const ctx = (over = {}) => ({
  now,
  validateDestination: value => { if (!/^(makkah|madinah|jeddah)(,|$)/i.test(value)) throw new Error('unknown'); },
  quote: async fields => {
    const { requiredSeats } = seatUsage(fields.start_date, fields.end_date, fields.participants);
    return { required: requiredSeats, available, missing: Math.max(0, requiredSeats - available), price: { amount: 9.99, currency: 'eur' }, currency: 'eur', symbol: '€',
      total: Math.round(Math.max(0, requiredSeats - available) * 9.99 * 100) / 100 };
  },
  ...over,
});
const start = () => newDraft({ id: 'd1', lang: 'nl', now, firstName: 'Saif' });
const talk = async (draft, text, over) => say(draft, { text }, ctx(over));
const act = async (draft, action, over) => say(draft, { action }, ctx(over));
const banner = async d => { d.fields.image = 'https://x.test/b.jpg'; d.banner_done = true; return act(d, 'banner_uploaded'); };

test('the eight steps are fixed and numbered', () => {
  assert.deepEqual(STEPS, ['name', 'banner', 'destination', 'dates', 'participants', 'seats', 'overview', 'created']);
  const d = start();
  assert.equal(d.step, 'name'); assert.equal(d.step_no, 1); assert.equal(d.steps_total, 8);
});

test('a full conversation walks every step and ends at the overview', async () => {
  available = 200;
  const d = start();
  let r = await talk(d, 'Umrah Ramadan 2027');
  assert.equal(r.reply.key, 'ask_banner'); assert.equal(d.step, 'banner'); assert.equal(d.fields.title, 'Umrah Ramadan 2027');
  r = await banner(d);
  assert.equal(r.reply.key, 'ask_destination'); assert.equal(d.step, 'destination');
  r = await talk(d, 'we gaan naar Makkah');
  assert.equal(d.fields.destination, 'Makkah'); assert.equal(r.reply.key, 'ask_dates');
  r = await talk(d, 'we vertrekken 18 februari en zijn 3 maart terug');
  assert.equal(d.fields.start_day, '2027-02-18'); assert.equal(d.fields.end_day, '2027-03-03');
  assert.equal(d.fields.start_date, Date.UTC(2027, 1, 18)); assert.equal(d.fields.end_date, Date.UTC(2027, 2, 4));
  assert.equal(r.reply.key, 'ask_participants');
  r = await talk(d, '110 mensen');
  assert.equal(d.fields.participants, 110);
  assert.equal(r.reply.key, 'overview'); assert.equal(d.step, 'overview');
  assert.equal(r.reply.params.required, 110 * 1); // 14 days = 1 period
  assert.equal(r.reply.params.missing, 0);
  r = await act(d, 'confirm');
  assert.equal(r.reply.key, 'ready');
  assert.deepEqual(d.messages.filter(m => m.role === 'deen').map(m => m.key), ['ack_name', 'ask_banner', 'ask_destination', 'ack_destination', 'ask_dates', 'ack_dates', 'ask_participants', 'ack_participants', 'seats_ok', 'overview', 'ready']);
  assert.ok(d.messages.every(m => Number.isFinite(m.at)));
});

test('missing seats stop at the seat check with the price, and a refresh after paying continues', async () => {
  available = 78;
  const d = start();
  for (const t of ['Trip', null, 'Makkah', '7 tot 20 februari 2027', '120']) {
    if (t === null) await banner(d); else await talk(d, t);
  }
  assert.equal(d.step, 'seats'); assert.equal(d.step_no, 6);
  assert.deepEqual([d.seats.required, d.seats.available, d.seats.missing], [120, 78, 42]);
  assert.equal(d.seats.total, 419.58);
  let r = await talk(d, 'ja');
  assert.equal(r.reply.key, 'seats_missing');
  available = 120;
  r = await act(d, 'refresh');
  assert.equal(r.reply.key, 'seats_paid'); assert.equal(d.step, 'overview');
});

test('a trip over 30 days needs a seat per participant per 30-day period', async () => {
  available = 78;
  const d = start();
  for (const t of ['Trip', null, 'Makkah', '1 maart tot 15 april 2027', '50']) {
    if (t === null) await banner(d); else await talk(d, t);
  }
  assert.equal(d.seats.required, 100); assert.equal(d.seats.missing, 22);
});

test('invalid answers repeat the question without changing anything', async () => {
  available = 500;
  const d = start();
  await talk(d, 'x');
  assert.equal(d.step, 'name');
  await talk(d, 'Trip'); await banner(d);
  let r = await talk(d, 'nergens');
  assert.equal(r.reply.key, 'retry_destination'); assert.equal(d.step, 'destination');
  await talk(d, 'Makkah');
  r = await talk(d, 'binnenkort');
  assert.equal(r.reply.key, 'retry_dates');
  r = await talk(d, '1 januari 2020 tot 5 januari 2020');
  assert.equal(r.reply.key, 'retry_dates');
  r = await talk(d, '18 februari');
  assert.equal(r.reply.key, 'retry_dates'); assert.equal(d.pending_start_day, '2027-02-18'); assert.equal(d.fields.start_date, null);
  r = await talk(d, '3 maart');
  assert.equal(r.reply.key, 'ask_participants'); assert.equal(d.fields.end_day, '2027-03-03');
  r = await talk(d, 'veel');
  assert.equal(r.reply.key, 'retry_participants');
  r = await talk(d, '999999');
  assert.equal(r.reply.key, 'retry_participants');
  r = await talk(d, '40');
  assert.equal(d.step, 'overview');
});

test('end before start and trips over a year are refused', async () => {
  available = 500;
  const d = start();
  await talk(d, 'Trip'); await banner(d); await talk(d, 'Makkah');
  assert.equal((await talk(d, '3 maart 2027 tot 18 februari 2027')).reply.key, 'retry_dates');
  assert.equal((await talk(d, '1 maart 2027 tot 1 maart 2029')).reply.key, 'retry_dates');
});

test('editing a field goes back to it and returns to the overview with fresh seats', async () => {
  available = 100;
  const d = start();
  for (const t of ['Trip', null, 'Makkah', '7 tot 20 februari 2027', '90']) {
    if (t === null) await banner(d); else await talk(d, t);
  }
  assert.equal(d.step, 'overview');
  let r = await act(d, 'edit_participants');
  assert.equal(r.reply.key, 'ask_participants'); assert.equal(d.step, 'participants');
  r = await talk(d, '130');
  assert.equal(d.step, 'seats'); assert.equal(d.seats.missing, 30);
  r = await act(d, 'edit_dates');
  assert.equal(d.step, 'dates');
  r = await talk(d, '1 maart 2027 tot 5 maart 2027');
  assert.equal(d.fields.start_day, '2027-03-01'); assert.equal(d.step, 'seats');
  r = await act(d, 'edit_name');
  r = await talk(d, 'Nieuwe naam');
  assert.equal(d.fields.title, 'Nieuwe naam'); assert.equal(d.editing, null);
  // new dates or a new number can also be said at the overview
  r = await talk(d, '25 maart 2027 tot 30 maart 2027');
  assert.equal(d.fields.start_day, '2027-03-25');
  r = await talk(d, '60');
  assert.equal(d.fields.participants, 60); assert.equal(d.step, 'overview');
  r = await talk(d, 'nee');
  assert.equal(r.reply.key, 'overview_change_what');
  r = await talk(d, 'Ja klopt');
  assert.equal(r.reply.key, 'ready');
});

test('later pauses the draft, the next turn resumes it; restart begins again', async () => {
  const d = start();
  await talk(d, 'Trip');
  let r = await act(d, 'later');
  assert.equal(d.status, 'paused'); assert.equal(r.reply.key, 'saved_later');
  r = await act(d, 'refresh');
  assert.equal(d.status, 'active'); assert.equal(d.step, 'banner');
  r = await act(d, 'restart');
  assert.equal(r.reply.key, 'greeting'); assert.equal(d.step, 'name'); assert.equal(d.fields.title, null);
});

test('copying a trip prefills the name, banner and destination and asks only for dates and number', async () => {
  available = 500;
  const d = newDraft({ id: 'c1', lang: 'nl', now, firstName: 'Saif',
    copyFrom: { tripId: 't9', title: 'Ramadan 2026', image: 'https://x.test/b.jpg', destination: 'Makkah, Saudi Arabia', templatesCount: 4 } });
  assert.equal(d.fields.title, 'Kopie van Ramadan 2026');
  assert.deepEqual(d.copy_from, { trip_id: 't9', title: 'Ramadan 2026', templates_count: 4 });
  let r = await act(d, 'refresh');
  assert.equal(r.reply.key, 'ask_dates'); assert.equal(d.step, 'dates');
  r = await talk(d, '7 tot 20 februari 2027, 110 mensen');
  assert.equal(r.reply.key, 'ask_participants');
  r = await talk(d, '110 mensen');
  assert.equal(d.step, 'overview'); assert.equal(d.fields.image, 'https://x.test/b.jpg');
});

test('the model hint is only a hint: invalid values are refused, a valid one fills the field, text is passed on', async () => {
  available = 500;
  const d = start();
  const model = async ({ step }) => (step === 'name' ? { title: 'Slimme titel', reply: 'Mooi gekozen!' } : null);
  let r = await talk(d, 'ik wil iets noemen', { model });
  assert.equal(d.fields.title, 'Slimme titel'); assert.equal(r.reply.text, 'Mooi gekozen!');
  await banner(d); await talk(d, 'Makkah');
  r = await talk(d, 'tja', { model: async () => ({ days: ['2027-02-30', '2027-03-01'] }) });
  assert.equal(r.reply.key, 'retry_dates');
  r = await talk(d, 'tja', { model: async () => ({ days: ['2027-02-10', '2027-02-12'] }) });
  assert.equal(d.fields.start_day, '2027-02-10');
  r = await talk(d, 'tja', { model: async () => { throw new Error('network'); } });
  assert.equal(r.reply.key, 'retry_participants');
});

test('a created draft does not change any more', async () => {
  const d = start(); d.status = 'created'; d.trip_id = 'trip1';
  const r = await talk(d, 'hallo');
  assert.equal(r.reply.key, 'already_created'); assert.equal(d.messages.length, 0);
});

// Places the validator knows, in the spellings people type.
const PLACES = /^(mekka|makkah|mecca|medina|madinah|medine|jeddah)(,|$)/i;
const places = { validateDestination: value => { if (!PLACES.test(value)) throw new Error('unknown'); } };
const atDestination = async () => { const d = start(); await talk(d, 'Umrah'); await banner(d); return d; };

test('several destinations joined by en, and, und, et, y, ve, dan are kept whole', async () => {
  for (const text of ['Mekka en Medina', 'we gaan naar Mekka en Medina', 'Mecca and Medina', 'Mekka und Medina', 'Mecca et Medine', 'Mecca y Medina',
    'Mekka ve Medina', 'Mekka dan Medina', 'Mekka & Medina']) {
    const d = await atDestination();
    const r = await talk(d, text, places);
    assert.equal(d.fields.destination, text.replace(/^we gaan naar /, ''), text);
    assert.equal(r.reply.key, 'ask_dates');
  }
});

test('a list is refused when one of its places is unknown, and a single place still wins on its own', async () => {
  let d = await atDestination();
  let r = await talk(d, 'Atlantis en Medina', places);
  assert.equal(d.fields.destination, 'Medina'); assert.equal(r.reply.key, 'ask_dates');
  d = await atDestination();
  r = await talk(d, 'Medina', places);
  assert.equal(d.fields.destination, 'Medina');
});

test('a first answer with dates, head count and destination fills those fields and asks only what is missing (nl)', async () => {
  const d = start();
  const r = await talk(d, 'Umrah in maart 2027 met 40 mensen, vertrek 10 maart, terug 20 maart, naar Mekka en Medina', places);
  assert.equal(d.fields.title, 'Umrah in maart 2027');
  assert.equal(d.fields.destination, 'Mekka en Medina');
  assert.equal(d.fields.start_day, '2027-03-10'); assert.equal(d.fields.end_day, '2027-03-20');
  assert.equal(d.fields.participants, 40);
  assert.deepEqual(d.messages.filter(m => m.role === 'deen').map(m => m.key), ['ack_name', 'ack_destination', 'ack_dates', 'ack_participants', 'ask_banner']);
  assert.equal(r.reply.key, 'ask_banner'); assert.equal(d.step, 'banner');
  const next = await banner(d);
  assert.equal(next.reply.key, 'overview'); // the remaining steps follow in their fixed order
});

test('a first answer with dates, head count and destination fills those fields (en)', async () => {
  const d = start();
  await talk(d, 'Umrah March 2027 with 25 people, leaving 10 March, back 20 March, to Makkah and Madinah', places);
  assert.equal(d.fields.title, 'Umrah March 2027');
  assert.equal(d.fields.destination, 'Makkah and Madinah');
  assert.equal(d.fields.start_day, '2027-03-10'); assert.equal(d.fields.end_day, '2027-03-20');
  assert.equal(d.fields.participants, 25);
});

test('a first answer with only some values asks for the rest in order', async () => {
  const d = start();
  await talk(d, 'Umrah, 12 juni tot 25 juni', places);
  assert.equal(d.fields.title, 'Umrah'); assert.equal(d.fields.start_day, '2027-06-12'); assert.equal(d.fields.end_day, '2027-06-25');
  assert.equal(d.fields.destination, null); assert.equal(d.fields.participants, null);
  await banner(d);
  assert.equal(d.step, 'destination');
});

test('a plain name stays a plain name, and a year in it is not a head count', async () => {
  const d = start();
  const r = await talk(d, 'Umrah Ramadan 2027', places);
  assert.equal(d.fields.title, 'Umrah Ramadan 2027');
  assert.equal(d.fields.participants, null); assert.equal(d.fields.start_day, null); assert.equal(d.fields.destination, null);
  assert.equal(r.reply.key, 'ask_banner');
});

test('a first answer without a name part keeps the values and asks for the name', async () => {
  const d = start();
  const r = await talk(d, 'we vertrekken 18 februari en zijn 3 maart terug', places);
  assert.equal(d.fields.title, null); assert.equal(d.fields.start_day, '2027-02-18');
  assert.equal(r.reply.key, 'ask_name'); assert.equal(d.step, 'name');
});
