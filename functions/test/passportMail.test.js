const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLinkMail, buildCodeMail, passportLink } = require('../services/passport/passportMail');

const token = 'a'.repeat(43);
test('the link mail carries the personal link, the organisation and the trip', () => {
  const m = buildLinkMail({ lang: 'nl', org: 'Noor <Travel>', trip: { title: 'Umrah "Mei"' }, token });
  assert.ok(m.html.includes(passportLink(token)));
  assert.ok(m.subject.includes('Noor <Travel>') && m.subject.includes('paspoortgegevens'));
  assert.ok(m.html.includes('Noor &lt;Travel&gt;') && m.html.includes('Umrah &quot;Mei&quot;'), 'html is escaped');
  assert.ok(!m.html.includes('<Travel>'));
  assert.equal(m.fallback, false);
  assert.ok(m.html.includes('14 dagen'));
});
test('Arabic is right to left, other languages fall back to English and say so', () => {
  assert.ok(buildLinkMail({ lang: 'ar', org: 'X', token }).html.startsWith('<div dir="rtl"'));
  const tr = buildLinkMail({ lang: 'tr', org: 'X', token });
  assert.deepEqual([tr.fallback, tr.lang], [true, 'en']);
  assert.ok(tr.subject.includes('passport details'));
});
test('the code mail shows the code in the subject and body, left to right even in Arabic', () => {
  const m = buildCodeMail({ lang: 'ar', code: '048213' });
  assert.ok(m.subject.includes('048213') && m.html.includes('048213') && m.html.includes('direction:ltr'));
  assert.ok(buildCodeMail({ code: '123456' }).html.includes('10 minutes'));
});
test('the link base can point the emulator at a local website', () => {
  assert.match(passportLink(token), /^https:\/\/join\.gomusafir\.app\/paspoort\?t=a{43}$/);
});

test('line breaks in the organisation or trip name never reach the subject', () => {
  for (const lang of ['en', 'nl', 'ar']) {
    const m = buildLinkMail({ lang, org: 'Noor\r\nBcc: x@y.test', trip: { title: 'Umrah\nMei\u2028' }, token });
    assert.doesNotMatch(m.subject, /[\r\n\u2028\u2029]/);
  }
  assert.equal(buildLinkMail({ org: 'A\r\nB', trip: { title: 'T' }, token }).subject, 'A B: fill in your passport details');
});
