const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../services/passport/passportValidation');

const NOW = Date.parse('2026-10-16T12:00:00Z');
const bad = (step, data, field, now = NOW) => assert.throws(() => v.validateStep(step, data, now),
  e => e.code === 'invalid-argument' && e.details.field === field, `${step} ${field}`);

test('gegevens: name, phone digits and email are checked and cleaned', () => {
  assert.deepEqual(v.validateStep('gegevens', { name: '  Fatima Zahra ', phone: '+31 (6) 1234-5678', email: ' Fatima@Example.COM ', extra: 1 }, NOW),
    { name: 'Fatima Zahra', phone: '+31612345678', email: 'fatima@example.com' });
  bad('gegevens', { name: 'F', phone: '0612345678', email: 'a@b.co' }, 'name');
  bad('gegevens', { name: 'Fatima', phone: '06abc', email: 'a@b.co' }, 'phone');
  bad('gegevens', { name: 'Fatima', phone: '12345', email: 'a@b.co' }, 'phone');
  bad('gegevens', { name: 'Fatima', phone: '1'.repeat(16), email: 'a@b.co' }, 'phone');
  bad('gegevens', { name: 'Fatima', phone: '0612345678', email: 'nope' }, 'email');
  bad('gegevens', null, 'name');
});
test('visum needs a real yes or no', () => {
  assert.deepEqual(v.validateStep('visum', { has_visa: true }, NOW), { has_visa: true });
  bad('visum', { has_visa: 'yes' }, 'has_visa');
  bad('visum', {}, 'has_visa');
});
test('paspoort: expiry must be a real date in the future', () => {
  const ok = { passport_number: ' nx4123458 ', nationality: 'Nederlandse', expiry: '2031-03-14' };
  assert.deepEqual(v.validateStep('paspoort', ok, NOW), { passport_number: 'NX4123458', nationality: 'Nederlandse', expiry: '2031-03-14' });
  bad('paspoort', { ...ok, expiry: '2026-10-16' }, 'expiry'); // today is not the future
  bad('paspoort', { ...ok, expiry: '2020-01-01' }, 'expiry');
  bad('paspoort', { ...ok, expiry: '2031-02-30' }, 'expiry');
  bad('paspoort', { ...ok, expiry: '14-03-2031' }, 'expiry');
  assert.equal(v.validateStep('paspoort', { ...ok, expiry: '2026-10-17' }, NOW).expiry, '2026-10-17');
  bad('paspoort', { ...ok, passport_number: 'NX4•••••8' }, 'passport_number');
  bad('paspoort', { ...ok, passport_number: 'AB1' }, 'passport_number');
  bad('paspoort', { ...ok, nationality: '' }, 'nationality');
});
test('medisch: explicit consent is required, texts are optional', () => {
  assert.deepEqual(v.validateStep('medisch', { consent: true }, NOW), { consent: true, allergies: '', notes: '' });
  assert.equal(v.validateStep('medisch', { consent: true, allergies: ' Pinda ', notes: null }, NOW).allergies, 'Pinda');
  bad('medisch', { allergies: 'Pinda' }, 'consent');
  bad('medisch', { consent: false }, 'consent');
  bad('medisch', { consent: 'true' }, 'consent');
  bad('medisch', { consent: true, notes: 'x'.repeat(2001) }, 'notes');
});
test('noodcontact: one or two contacts with name, relation and phone', () => {
  const c = n => ({ name: `Contact ${n}`, relation: 'brother', phone: '+31611111111' });
  assert.equal(v.validateStep('noodcontact', { contacts: [c(1)] }, NOW).contacts.length, 1);
  assert.equal(v.validateStep('noodcontact', { contacts: [c(1), c(2)] }, NOW).contacts.length, 2);
  bad('noodcontact', { contacts: [] }, 'contacts');
  bad('noodcontact', { contacts: [c(1), c(2), c(3)] }, 'contacts');
  bad('noodcontact', { contacts: [{ ...c(1), phone: 'abc' }] }, 'contacts.0.phone');
  bad('noodcontact', { contacts: [{ ...c(1), name: '' }] }, 'contacts.0.name');
  bad('noodcontact', {}, 'contacts');
});
test('familie accepts an empty save and unknown steps are refused', () => {
  assert.deepEqual(v.validateStep('familie', { anything: 1 }, NOW), {});
  assert.throws(() => v.validateStep('bloed', {}, NOW), e => e.code === 'invalid-argument' && e.details.reason === 'invalid_step');
});
test('the passport number shows only its edges', () => {
  assert.equal(v.maskPassportNumber('NX4123458'), 'NX4•••••8');
  assert.equal(v.maskPassportNumber('AB1234'), '•••••4');
  assert.equal(v.maskPassportNumber(''), '');
});
test('status: done needs the copy only when the trip asks for one', () => {
  const stored = { gegevens: {}, visum: { has_visa: true }, paspoort: { passport_number: 'X' }, medisch: { consent: true }, noodcontact: { contacts: [{}] } };
  let s = v.statusMap(stored, { needsCopy: false, docs: {} });
  assert.equal(s.complete, true);
  assert.equal(s.familie, 'todo');
  s = v.statusMap(stored, { needsCopy: true, docs: {} });
  assert.deepEqual([s.visum, s.paspoort, s.complete], ['todo', 'todo', false]);
  s = v.statusMap(stored, { needsCopy: true, docs: { visa: {}, passport: {} } });
  assert.equal(s.complete, true);
  s = v.statusMap({ ...stored, visum: { has_visa: false } }, { needsCopy: true, docs: { passport: {} } });
  assert.equal(s.visum, 'done'); // no visa to copy
  s = v.statusMap({ ...stored, noodcontact: { contacts: [] } }, {});
  assert.deepEqual([s.noodcontact, s.complete], ['todo', false]);
  assert.equal(v.statusMap({}, {}).complete, false);
});

const url = (type, bytes) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
const jpeg = [0xff, 0xd8, 0xff, 0xe0, ...Array(32).fill(1)];
const png = [0x89, 0x50, 0x4e, 0x47, ...Array(32).fill(1)];
const pdf = [...Buffer.from('%PDF-1.7\n'), ...Array(32).fill(65)];
test('documents: type comes from the bytes, must match the declaration, pdf only for a visa', () => {
  assert.equal(v.decodeDocument(url('image/jpeg', jpeg), 'passport').ext, 'jpg');
  assert.equal(v.decodeDocument(url('image/png', png), 'visa').contentType, 'image/png');
  assert.equal(v.decodeDocument(url('application/pdf', pdf), 'visa').ext, 'pdf');
  const rejects = (dataUrl, kind) => assert.throws(() => v.decodeDocument(dataUrl, kind), e => e.code === 'invalid-argument' && e.details.reason === 'invalid_document');
  rejects(url('application/pdf', pdf), 'passport');
  rejects(url('image/png', jpeg), 'passport'); // declared png, bytes are jpeg
  rejects(url('image/jpeg', Array(40).fill(0)), 'passport');
  rejects(url('image/gif', [0x47, 0x49, 0x46, ...Array(30).fill(1)]), 'passport');
  rejects(url('image/jpeg', jpeg.slice(0, 8)), 'passport'); // too short
  rejects(url('image/jpeg', jpeg), 'selfie');
  rejects('not a data url', 'passport');
  rejects(`data:image/jpeg;base64,${'A'.repeat(100)}!`, 'passport');
  rejects(null, 'passport');
  rejects(url('image/jpeg', [0xff, 0xd8, 0xff, ...Array(v.MAX_DOCUMENT_BYTES)]), 'passport'); // 5 MB or more
});
