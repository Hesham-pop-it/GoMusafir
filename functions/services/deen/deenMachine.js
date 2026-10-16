// Deen's state machine (T1). The server owns the 8 steps and the trip fields; the interpreter
// (local parser or model) only turns the organiser's words into candidate values, and every value is
// validated here before it is stored. Pure apart from the injected collaborators, so it is unit tested.
const { dayToMs, validDay, DAY_MS, destinationCandidates, parseDates, parseCount, parseYesNo, parseSkip } = require('./deenParser');

const STEPS = ['name', 'banner', 'destination', 'dates', 'participants', 'seats', 'overview', 'created'];
const STEPS_TOTAL = STEPS.length;
const MAX_PARTICIPANTS = 5000;
const MAX_TRIP_DAYS = 366;
const MAX_MESSAGES = 200;
const DRAFT_TTL_MS = 30 * DAY_MS;
const ACTIONS = ['confirm', 'edit_name', 'edit_destination', 'edit_dates', 'edit_participants', 'skip', 'later', 'restart', 'refresh'];
const EDIT_STEP = { edit_name: 'name', edit_destination: 'destination', edit_dates: 'dates', edit_participants: 'participants' };

const stepNo = step => STEPS.indexOf(step) + 1;
const cleanLine = (value, max) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function newDraft({ id, lang, now, copyFrom, firstName }) {
  const draft = {
    id, lang, status: 'active', step: 'name', step_no: 1, steps_total: STEPS_TOTAL,
    fields: { title: null, image: null, destination: null, start_date: null, end_date: null, start_day: null, end_day: null, participants: null },
    banner_done: false, editing: null, pending_start_day: null, seats: null, messages: [],
    created_at: now, updated_at: now, expires_at: now + DRAFT_TTL_MS,
  };
  if (copyFrom) {
    draft.copy_from = { trip_id: copyFrom.tripId, title: copyFrom.title, templates_count: copyFrom.templatesCount };
    draft.fields.title = `Kopie van ${copyFrom.title}`.slice(0, 120);
    draft.fields.image = copyFrom.image || null;
    draft.fields.destination = copyFrom.destination || null;
    draft.banner_done = true;
  }
  draft.first_name = firstName || '';
  return draft;
}

function pushMessage(draft, message, now) {
  draft.messages = [...(draft.messages || []), { ...message, at: now }].slice(-MAX_MESSAGES);
}

function setStep(draft, step) {
  draft.step = step;
  draft.step_no = stepNo(step);
}

function nextIncompleteStep(draft) {
  const f = draft.fields;
  if (draft.editing) return draft.editing;
  if (!f.title) return 'name';
  if (!draft.banner_done) return 'banner';
  if (!f.destination) return 'destination';
  if (!f.start_date || !f.end_date) return 'dates';
  if (!f.participants) return 'participants';
  return null; // seats or overview, decided by the quote
}

const summary = draft => ({
  title: draft.fields.title, destination: draft.fields.destination, start_day: draft.fields.start_day,
  end_day: draft.fields.end_day, participants: draft.fields.participants, has_banner: Boolean(draft.fields.image),
  copy: draft.copy_from ? { title: draft.copy_from.title, templates_count: draft.copy_from.templates_count } : null,
});

// Moves to the first open step and returns the reply that asks for it.
async function advance(draft, ctx, lead) {
  const open = nextIncompleteStep(draft);
  if (open) {
    setStep(draft, open);
    if (lead) return lead;
    const current = summary(draft);
    if (open === 'dates' && draft.pending_start_day) return { key: 'dates_need_end', params: { start_day: draft.pending_start_day } };
    return { key: `ask_${open}`, params: draft.editing ? { current } : {} };
  }
  draft.seats = await ctx.quote(draft.fields);
  if (draft.seats.missing > 0) {
    setStep(draft, 'seats');
    return lead || { key: 'seats_missing', params: { ...draft.seats, summary: summary(draft) } };
  }
  setStep(draft, 'overview');
  return lead || { key: 'overview', params: { ...draft.seats, summary: summary(draft) } };
}

function setDays(draft, startDay, endDay) {
  draft.fields.start_day = startDay;
  draft.fields.end_day = endDay;
  draft.fields.start_date = dayToMs(startDay);
  draft.fields.end_date = dayToMs(endDay) + DAY_MS;
  draft.pending_start_day = null;
}

const todayOf = now => new Date(now).toISOString().slice(0, 10);

// Validates one or two ISO days against today and the length limit.
function applyDays(draft, days, now) {
  const ok = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && validDay(+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10));
  let [a, b] = days;
  if (draft.pending_start_day && days.length === 1) { b = a; a = draft.pending_start_day; }
  if (!ok(a) || (b !== undefined && !ok(b))) return { key: 'dates_invalid', params: {} };
  if (a < todayOf(now)) return { key: 'dates_past', params: { start_day: a } };
  if (b === undefined) {
    draft.pending_start_day = a;
    return { key: 'dates_need_end', params: { start_day: a } };
  }
  if (b < a) return { key: 'dates_invalid', params: {} };
  if ((dayToMs(b) - dayToMs(a)) / DAY_MS + 1 > MAX_TRIP_DAYS) return { key: 'dates_too_long', params: { max_days: MAX_TRIP_DAYS } };
  setDays(draft, a, b);
  return null;
}

function applyDestination(draft, candidates, ctx) {
  for (const candidate of candidates) {
    try {
      ctx.validateDestination(candidate);
      draft.fields.destination = candidate;
      return null;
    } catch (_) { /* try the next candidate */ }
  }
  return { key: 'destination_invalid', params: {} };
}

const validParticipants = n => Number.isSafeInteger(n) && n >= 1 && n <= MAX_PARTICIPANTS;

// What the organiser said, as candidate values. The interpreter may be the model; its output is only a hint.
async function understand(draft, text, ctx) {
  const local = {
    days: parseDates(text, { now: ctx.now }), participants: parseCount(text), yesNo: parseYesNo(text), skip: parseSkip(text),
    destinations: destinationCandidates(text), title: cleanLine(text, 120), replyText: null,
  };
  if (!ctx.model) return local;
  const hint = await ctx.model({ step: draft.step, text, lang: draft.lang, today: todayOf(ctx.now) }).catch(() => null);
  if (!hint) return local;
  return {
    ...local,
    days: Array.isArray(hint.days) && hint.days.length ? hint.days : local.days,
    participants: Number.isInteger(hint.participants) ? hint.participants : local.participants,
    yesNo: hint.yes_no === 'yes' || hint.yes_no === 'no' ? hint.yes_no : local.yesNo,
    destinations: hint.destination ? [cleanLine(hint.destination, 200), ...local.destinations] : local.destinations,
    title: hint.title ? cleanLine(hint.title, 120) : local.title,
    replyText: typeof hint.reply === 'string' && hint.reply.trim() ? cleanLine(hint.reply, 600) : null,
  };
}

async function handleAction(draft, action, ctx) {
  if (action === 'restart') {
    const fresh = newDraft({ id: draft.id, lang: draft.lang, now: ctx.now, firstName: draft.first_name });
    fresh.messages = draft.messages;
    Object.assign(draft, fresh);
    return { key: 'greeting', params: { name: draft.first_name } };
  }
  if (action === 'later') {
    draft.status = 'paused';
    return { key: 'saved_later', params: { expires_at: draft.expires_at } };
  }
  if (action === 'refresh') {
    const was = draft.step;
    const reply = await advance(draft, ctx, null);
    return was === 'seats' && draft.step === 'overview' ? { ...reply, key: 'seats_paid' } : reply;
  }
  if (EDIT_STEP[action]) {
    draft.editing = EDIT_STEP[action];
    if (action === 'edit_dates') draft.pending_start_day = null;
    return advance(draft, ctx, null);
  }
  if (action === 'skip') {
    if (draft.step === 'banner') { draft.banner_done = true; draft.fields.image = null; return advance(draft, ctx, { key: 'banner_skipped', params: {} }); }
    return advance(draft, ctx, null);
  }
  if (action === 'confirm') {
    if (draft.step === 'overview') return { key: 'ready', params: { summary: summary(draft) } };
    return advance(draft, ctx, null);
  }
  return advance(draft, ctx, null);
}

async function handleText(draft, text, ctx) {
  const heard = await understand(draft, text, ctx);
  const step = draft.step;
  let lead = null;
  const wasEditing = draft.editing;
  if (step === 'name') {
    if (heard.title.length < 2) return { reply: await advance(draft, ctx, { key: 'ask_name', params: {} }), heard };
    draft.fields.title = heard.title;
    draft.editing = null;
  } else if (step === 'banner') {
    if (heard.skip) { draft.banner_done = true; draft.fields.image = null; lead = { key: 'banner_skipped', params: {} }; }
    else return { reply: await advance(draft, ctx, { key: 'ask_banner', params: {} }), heard };
  } else if (step === 'destination') {
    lead = applyDestination(draft, heard.destinations, ctx);
    if (!lead) draft.editing = null;
  } else if (step === 'dates') {
    lead = heard.days.length ? applyDays(draft, heard.days, ctx.now) : { key: 'dates_invalid', params: {} };
    if (!lead) draft.editing = null;
  } else if (step === 'participants') {
    if (!validParticipants(heard.participants)) lead = { key: 'participants_invalid', params: { max: MAX_PARTICIPANTS } };
    else { draft.fields.participants = heard.participants; draft.editing = null; }
  } else if (step === 'seats' || step === 'overview') {
    if (heard.days.length >= 2) {
      lead = applyDays(draft, heard.days, ctx.now);
    } else if (validParticipants(heard.participants) && heard.yesNo === null) {
      draft.fields.participants = heard.participants;
    } else if (heard.yesNo === 'yes' && step === 'overview') {
      return { reply: { key: 'ready', params: { summary: summary(draft) } }, heard };
    } else if (heard.yesNo === 'yes') {
      lead = null; // at the seat check: show the open seats again
    } else if (heard.yesNo === 'no') {
      lead = { key: 'overview_change_what', params: {} };
    } else {
      lead = { key: 'not_understood', params: {} };
    }
  } else {
    lead = { key: 'not_understood', params: {} };
  }
  // Keep editing mode when the new value was refused.
  if (lead && wasEditing && ['destination_invalid', 'dates_invalid', 'dates_past', 'dates_too_long', 'participants_invalid'].includes(lead.key)) draft.editing = wasEditing;
  const reply = await advance(draft, ctx, lead);
  return { reply, heard };
}

// One turn. Mutates and returns the draft with the new messages appended.
async function say(draft, { text, action }, ctx) {
  if (draft.status === 'created') return { draft, reply: { key: 'already_created', params: { trip_id: draft.trip_id } } };
  if (draft.status === 'paused') draft.status = 'active';
  const now = ctx.now;
  if (action) pushMessage(draft, { role: 'user', text: '', action }, now);
  else pushMessage(draft, { role: 'user', text }, now);
  let reply, replyText = null;
  if (action) reply = await handleAction(draft, action, ctx);
  else {
    const out = await handleText(draft, text, ctx);
    reply = out.reply; replyText = out.heard.replyText;
  }
  if (replyText) reply = { ...reply, text: replyText };
  pushMessage(draft, { role: 'deen', text: reply.text || '', key: reply.key, params: reply.params || {} }, now);
  draft.updated_at = now;
  draft.expires_at = now + DRAFT_TTL_MS;
  return { draft, reply };
}

module.exports = {
  STEPS, STEPS_TOTAL, ACTIONS, MAX_PARTICIPANTS, MAX_TRIP_DAYS, DRAFT_TTL_MS, newDraft, say, pushMessage, advance, setStep, summary, cleanLine,
};
