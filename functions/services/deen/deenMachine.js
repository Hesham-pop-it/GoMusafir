// Deen's state machine (T1). The server owns the 8 steps and the trip fields; the interpreter
// (local parser or model) only turns the organiser's words into candidate values, and every value is
// validated here before it is stored. Pure apart from the injected collaborators, so it is unit tested.
const { dayToMs, validDay, DAY_MS, destinationCandidates, parseDates, parseCount, parseYesNo, parseSkip, parseFirstMessage, nameBefore } = require('./deenParser');
const { splitDestinations } = require('../destinationList');

const STEPS = ['name', 'banner', 'destination', 'dates', 'participants', 'seats', 'overview', 'created'];
const STEPS_TOTAL = STEPS.length;
const MAX_PARTICIPANTS = 5000;
const MAX_TRIP_DAYS = 366;
const MAX_MESSAGES = 200;
const DRAFT_TTL_MS = 30 * DAY_MS;
const ACTIONS = ['confirm', 'banner_uploaded', 'resume', 'edit_name', 'edit_destination', 'edit_dates', 'edit_participants', 'skip', 'later', 'restart', 'refresh'];
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

const isValidDestination = (value, ctx) => { try { ctx.validateDestination(value); return true; } catch (_) { return false; } };

// "Mekka en Medina" is kept whole when every place in it is valid; otherwise the next candidate is tried.
function applyDestination(draft, candidates, ctx) {
  for (const candidate of candidates) {
    const places = splitDestinations(candidate);
    if (isValidDestination(candidate, ctx) || (places.length > 1 && places.every(place => isValidDestination(place, ctx)))) {
      draft.fields.destination = candidate;
      return null;
    }
  }
  return { key: 'destination_invalid', params: {} };
}

const validParticipants = n => Number.isSafeInteger(n) && n >= 1 && n <= MAX_PARTICIPANTS;

// A first answer that holds more than a name: pick up two dates, a head count and a destination, and
// return the word index where the name ends (-1 when nothing was found). Refused values are left out.
function applyFirstMessage(draft, text, ctx) {
  const found = parseFirstMessage(text, { now: ctx.now });
  const cuts = [];
  if (found.days.length >= 2 && applyDays(draft, found.days, ctx.now) === null) cuts.push(found.daysAt);
  if (validParticipants(found.count)) { draft.fields.participants = found.count; cuts.push(found.countAt); }
  for (const place of found.destinations) {
    if (applyDestination(draft, place.tails, ctx) === null) { cuts.push(place.at); break; }
  }
  return { cut: cuts.length ? Math.min(...cuts) : -1, words: found.words };
}

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
  if (action === 'refresh' || action === 'banner_uploaded' || action === 'resume') {
    const was = draft.step;
    const reply = await advance(draft, ctx, null);
    return was === 'seats' && draft.step === 'overview' ? { ...reply, key: 'seats_paid' } : reply;
  }
  if (EDIT_STEP[action]) {
    draft.editing = EDIT_STEP[action];
    if (action === 'edit_dates') draft.pending_start_day = null;
    return advance(draft, ctx, null);
  }
  if (action === 'skip') return advance(draft, ctx, null); // the banner step cannot be skipped
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
    let title = heard.title;
    if (!wasEditing) {
      const first = applyFirstMessage(draft, text, ctx);
      if (first.cut >= 0) title = cleanLine(nameBefore(first.words, first.cut), 120);
    }
    if (title) draft.fields.title = title; // without a usable name Deen asks for it again, with the other values kept
    draft.editing = null;
  } else if (step === 'banner') {
    return { reply: await advance(draft, ctx, { key: 'ask_banner', params: {} }), heard }; // only an upload completes it
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

// The keys the web client renders. A stored value is acknowledged first, then the next question follows.
const RETRY = { destination_invalid: 'retry_destination', dates_invalid: 'retry_dates', dates_past: 'retry_dates', dates_too_long: 'retry_dates',
  dates_need_end: 'retry_dates', participants_invalid: 'retry_participants' };
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);
function ackFor(draft, before) {
  const f = draft.fields, b = before.fields;
  const acks = [];
  if (f.title && f.title !== b.title) acks.push({ key: 'ack_name', params: { title: f.title } });
  if (f.destination && f.destination !== b.destination) acks.push({ key: 'ack_destination', params: { destination: f.destination } });
  if (f.start_day && (f.start_day !== b.start_day || f.end_day !== b.end_day)) acks.push({ key: 'ack_dates', params: { start: f.start_day, end: f.end_day } });
  if (f.participants && f.participants !== b.participants) acks.push({ key: 'ack_participants', params: { count: f.participants } });
  return acks; // one per turn, except when the first answer held several values
}
function clientReplies(reply, draft, before, isAction) {
  const out = [];
  const acks = !isAction && !RETRY[reply.key] && reply.key !== 'not_understood' && reply.key !== 'overview_change_what' ? ackFor(draft, before) : [];
  out.push(...acks);
  if (RETRY[reply.key]) return [{ ...reply, key: RETRY[reply.key], params: { ...reply.params, reason: reply.key } }];
  if (reply.key === 'overview' && acks.length && before.step !== 'overview' && before.step !== 'seats') {
    out.push({ key: 'seats_ok', params: { required: reply.params.required, available: reply.params.available } });
  }
  if (reply.key === 'ready' || reply.key === 'already_created' || reply.key === 'saved_later') { out.push(reply); return out; }
  out.push(reply);
  return out;
}

// One turn. Mutates and returns the draft with the new messages appended.
async function say(draft, { text, action }, ctx) {
  if (draft.status === 'created') return { draft, reply: { key: 'already_created', params: { trip_id: draft.trip_id } } };
  if (draft.status === 'paused') draft.status = 'active';
  const now = ctx.now;
  if (action) pushMessage(draft, { role: 'user', text: '', action }, now);
  else pushMessage(draft, { role: 'user', text }, now);
  const before = { step: draft.step, fields: { ...draft.fields } };
  let reply, replyText = null;
  if (action) reply = await handleAction(draft, action, ctx);
  else {
    const out = await handleText(draft, text, ctx);
    reply = out.reply; replyText = out.heard.replyText;
  }
  if (replyText) reply = { ...reply, text: replyText };
  const replies = clientReplies(reply, draft, before, Boolean(action));
  const last = replies[replies.length - 1];
  for (const r of replies) pushMessage(draft, { role: 'deen', text: r.text || '', key: r.key, params: r.params || {} }, now);
  draft.updated_at = now;
  draft.expires_at = now + DRAFT_TTL_MS;
  return { draft, reply: last, replies };
}

module.exports = {
  clientReplies, STEPS, STEPS_TOTAL, ACTIONS, MAX_PARTICIPANTS, MAX_TRIP_DAYS, DRAFT_TTL_MS, newDraft, say, pushMessage, advance, setStep, summary, cleanLine,
};
