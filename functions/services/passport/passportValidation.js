// What a pilgrim may save in each passport step, how complete a step is, and how uploads are checked.
// Everything here is pure: the callables validate on the server whatever the page already checked.
const { HttpsError } = require('firebase-functions/v2/https');
const { z } = require('zod');

const STEPS = ['gegevens', 'visum', 'paspoort', 'medisch', 'noodcontact', 'familie'];
const REQUIRED_STEPS = ['gegevens', 'visum', 'paspoort', 'medisch', 'noodcontact'];
const RELATIONS = ['father', 'mother', 'son', 'daughter', 'husband', 'wife', 'brother', 'sister', 'other'];
const MEDICAL_CONSENT_VERSION = 'v1';
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const trimmed = (min, max, what) => z.string({ required_error: `${what} is required.`, invalid_type_error: `${what} is required.` })
  .trim().min(min, `${what} is required.`).max(max, `${what} is too long.`);
const optionalText = (max, what) => z.preprocess(v => (v === undefined || v === null ? '' : v),
  z.string({ invalid_type_error: `${what} must be text.` }).trim().max(max, `${what} is too long.`));
// Digits with an optional leading + and the usual separators; 6 to 15 digits.
const phone = z.string({ required_error: 'A phone number is required.', invalid_type_error: 'A phone number is required.' }).trim()
  .max(30, 'The phone number is too long.')
  .refine(v => /^\+?[\d\s().-]+$/.test(v), 'The phone number may only contain digits.')
  .refine(v => { const n = v.replace(/\D/g, '').length; return n >= 6 && n <= 15; }, 'The phone number needs 6 to 15 digits.')
  .transform(v => (v.startsWith('+') ? '+' : '') + v.replace(/\D/g, ''));
const email = z.string({ required_error: 'An email address is required.', invalid_type_error: 'An email address is required.' }).trim().toLowerCase()
  .max(254).regex(/^[^\s@<>()[\]\\,;:"]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i, 'The email address is not valid.');

const todayIso = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const futureDate = now => z.string({ required_error: 'The expiry date is required.', invalid_type_error: 'The expiry date is required.' }).trim()
  .refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v,
    'The expiry date must be a real date (YYYY-MM-DD).')
  .refine(v => v > todayIso(now), 'The passport must expire in the future.');

const schemas = now => ({
  gegevens: z.object({ confirmed: z.boolean().optional(), name: trimmed(2, 100, 'The name'), phone, email }).transform(v => ({ ...v, confirmed: true })),
  visum: z.object({ has_visa: z.boolean({ required_error: 'Say whether you have a visa.', invalid_type_error: 'Say whether you have a visa.' }) }),
  paspoort: z.object({
    number: z.string({ required_error: 'The passport number is required.', invalid_type_error: 'The passport number is required.' })
      .trim().toUpperCase().regex(/^[A-Z0-9]{5,20}$/, 'The passport number needs 5 to 20 letters or digits.'),
    nationality: trimmed(2, 60, 'The nationality'),
    expiry: futureDate(now),
  }),
  // "none" means nothing to report and needs no consent; anything else is stored only with explicit consent.
  medisch: z.object({
    none: z.boolean().optional(), consent: z.boolean().optional(), consent_lang: optionalText(10, 'Consent language'),
    allergies: optionalText(500, 'Allergies'), notes: optionalText(2000, 'Medical notes'),
  }).superRefine((v, ctx) => {
    if (v.none !== true && v.consent !== true) ctx.addIssue({ code: 'custom', path: ['consent'], message: 'Explicit consent is required to store medical information.' });
  }).transform(v => (v.none === true ? { none: true, allergies: '', notes: '', consent: false } : { none: false, consent: true, consent_lang: v.consent_lang, allergies: v.allergies, notes: v.notes })),
  noodcontact: z.object({
    contacts: z.array(z.object({ name: trimmed(2, 100, 'The contact name'), relation: trimmed(2, 40, 'The relation'), phone }),
      { required_error: 'Add at least one emergency contact.', invalid_type_error: 'Add at least one emergency contact.' })
      .min(1, 'Add at least one emergency contact.').max(2, 'At most two emergency contacts.'),
  }),
  familie: z.object({}),
});

// -> the cleaned data of the step (unknown keys dropped) or an invalid-argument error naming the field.
function validateStep(step, data, now = Date.now()) {
  if (!STEPS.includes(step)) throw new HttpsError('invalid-argument', 'Unknown step.', { reason: 'invalid_step' });
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const result = schemas(now)[step].safeParse(source);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpsError('invalid-argument', issue.message, { reason: 'invalid_field', field: issue.path.join('.') || null });
  }
  return result.data;
}

// "NX4123458" -> "NX4•••••8"; short numbers keep only the last character.
function maskPassportNumber(number) {
  const chars = [...String(number || '')];
  if (!chars.length) return '';
  const head = chars.length >= 7 ? 3 : 0;
  return chars.slice(0, head).join('') + '•'.repeat(chars.length - head - 1) + chars[chars.length - 1];
}

// A step is done when it was saved and nothing it needs is missing. A copy is only asked for when the trip needs one.
function stepStatus(step, stored, { needsCopy = false, docs = {} } = {}) {
  if (!stored) return 'todo';
  switch (step) {
    case 'visum': return stored.has_visa === true && needsCopy && !docs.visa ? 'todo' : 'done';
    case 'paspoort': return needsCopy && !docs.passport ? 'todo' : 'done';
    case 'medisch': return stored.none === true || stored.consent === true ? 'done' : 'todo';
    case 'noodcontact': return Array.isArray(stored.contacts) && stored.contacts.length >= 1 ? 'done' : 'todo';
    default: return 'done';
  }
}
function statusMap(stored, context) {
  const out = {};
  for (const step of STEPS) out[step] = stepStatus(step, stored?.[step], context);
  out.complete = REQUIRED_STEPS.every(step => out[step] === 'done');
  return out;
}

const DOCUMENT_TYPES = [
  { type: 'image/jpeg', ext: 'jpg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', ext: 'png', test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: 'image/webp', ext: 'webp', test: b => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { type: 'application/pdf', ext: 'pdf', test: b => b.toString('latin1', 0, 5) === '%PDF-', kinds: ['visa'] },
];
const invalidDocument = message => new HttpsError('invalid-argument', message, { reason: 'invalid_document' });

// The content type is taken from the file's own first bytes and must agree with the one the page declared.
function decodeDocument(dataUrl, kind) {
  if (!['passport', 'visa'].includes(kind)) throw new HttpsError('invalid-argument', 'Unknown document.', { reason: 'invalid_document' });
  const match = typeof dataUrl === 'string' && dataUrl.length <= 7.2 * 1024 * 1024 ? /^data:([a-z]+\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl) : null;
  if (!match) throw invalidDocument('Please choose a photo (JPEG, PNG or WebP) or, for a visa, a PDF smaller than 5 MB.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 16) throw invalidDocument('The file is empty or damaged.');
  if (bytes.length >= MAX_DOCUMENT_BYTES) throw invalidDocument('The file is larger than 5 MB.');
  const found = DOCUMENT_TYPES.find(t => t.test(bytes) && (!t.kinds || t.kinds.includes(kind)));
  if (!found || found.type !== match[1]) throw invalidDocument('This file type is not accepted.');
  return { bytes, contentType: found.type, ext: found.ext };
}

module.exports = {
  STEPS, REQUIRED_STEPS, RELATIONS, MEDICAL_CONSENT_VERSION, MAX_DOCUMENT_BYTES, validateStep, maskPassportNumber, stepStatus, statusMap, decodeDocument, todayIso,
};
