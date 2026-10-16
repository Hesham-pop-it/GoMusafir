const test = require('node:test');
const assert = require('node:assert/strict');
const { maskPhone, groupFamilies, isReady, REMIND_GAP_MS, URL_TTL_MS, PURPOSE } = require('../services/passport/passportStaff');
const { buildReminderMail, passportLink } = require('../services/passport/passportMail');

test('phones are masked to the country code and the last two digits', () => {
  assert.equal(maskPhone('+31 6 1234 5678'), '+31•••••••78');
  assert.equal(maskPhone('0612345678'), '••••••••78');
  assert.equal(maskPhone('123'), '•••');
  assert.equal(maskPhone(''), '');
  assert.ok(!maskPhone('+31612345678').includes('1234'));
});

test('ready means passport, visa and an emergency contact; family and the rest never count', () => {
  const done = { gegevens: 'todo', visum: 'done', paspoort: 'done', medisch: 'todo', noodcontact: 'done', familie: 'todo' };
  assert.equal(isReady(done), true);
  assert.equal(isReady({ ...done, visum: 'todo' }), false);
  assert.equal(isReady({ ...done, noodcontact: 'todo' }), false);
});

test('confirmed links are grouped into one family, chains included, with a stable id', () => {
  const groups = groupFamilies([
    { id: 'b', from: 'u1', to: 'u2', relation: 'father' }, { id: 'b', from: 'u2', to: 'u1', relation: 'son' },
    { id: 'a', from: 'u2', to: 'u3', relation: 'wife' },
    { id: 'c', from: 'u8', to: 'u9', relation: 'brother' },
  ]);
  assert.deepEqual(groups.map(g => [g.id, g.members]), [['a', ['u1', 'u2', 'u3']], ['c', ['u8', 'u9']]]);
  assert.deepEqual(groups[0].links[0], { from: 'u1', to: 'u2', relation: 'father' });
  assert.deepEqual(groupFamilies([]), []);
});

test('the reminder mail has a fresh link, an escaped organisation, three languages and an English fallback', () => {
  const token = 'b'.repeat(43);
  const nl = buildReminderMail({ lang: 'nl', org: 'Noor <Travel>', trip: { title: 'Umrah' }, token });
  assert.ok(nl.html.includes(passportLink(token)) && nl.html.includes('Noor &lt;Travel&gt;'));
  assert.ok(nl.subject.includes('ontbreken') && nl.fallback === false && nl.push.title);
  const ar = buildReminderMail({ lang: 'ar', org: 'نور', trip: { title: 'عمرة' }, token });
  assert.ok(ar.html.includes('dir="rtl"') && ar.fallback === false);
  const tr = buildReminderMail({ lang: 'tr', org: 'Noor', trip: { title: 'Umrah' }, token });
  assert.ok(tr.subject.includes('still missing') && tr.fallback === true);
});

test('limits and purposes match the plan', () => {
  assert.equal(REMIND_GAP_MS, 24 * 3600 * 1000);
  assert.equal(URL_TTL_MS, 5 * 60 * 1000);
  assert.deepEqual(PURPOSE, { passport: 'passport_document', visa: 'passport_document', passport_number: 'passport_number', medical: 'medical' });
});
