const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInvitationMail, inviteLink, TRANSLATED } = require('../services/invitations/invitationMail');
const trip = { title: 'Umrah <Ramadan>', destination: 'Makkah', start_date: Date.UTC(2027, 2, 1), end_date: Date.UTC(2027, 2, 14) };

test('the link is the trip invitation link', () => {
  assert.equal(inviteLink('abc-123'), 'https://app.gomusafir.app/link/abc-123');
  const mail = buildInvitationMail({ lang: 'en', org: 'Noor Travel', trip, code: 'abc-123' });
  assert.ok(mail.html.includes('href="https://app.gomusafir.app/link/abc-123"'));
});
test('English, Dutch and Arabic are written in their own language', () => {
  assert.deepEqual(TRANSLATED, ['en', 'nl', 'ar']);
  const en = buildInvitationMail({ lang: 'en', org: 'Noor', trip, code: 'c' });
  const nl = buildInvitationMail({ lang: 'nl', org: 'Noor', trip, code: 'c' });
  const ar = buildInvitationMail({ lang: 'ar', org: 'Noor', trip, code: 'c' });
  assert.match(en.subject, /invites you/);
  assert.match(nl.subject, /nodigt je uit/);
  assert.match(ar.subject, /يدعوك/);
  assert.ok(ar.html.startsWith('<div dir="rtl"'));
  assert.ok(nl.html.startsWith('<div dir="ltr"'));
  for (const mail of [en, nl, ar]) assert.equal(mail.fallback, false);
});
test('other languages go out in English and are flagged for translation', () => {
  for (const lang of ['tr', 'ur', 'fr']) {
    const mail = buildInvitationMail({ lang, org: 'Noor', trip, code: 'c' });
    assert.equal(mail.lang, 'en');
    assert.equal(mail.fallback, true);
    assert.match(mail.subject, /invites you/);
  }
});
test('trip text is escaped in the body', () => {
  const mail = buildInvitationMail({ lang: 'en', org: 'A&B', trip, code: 'c' });
  assert.ok(mail.html.includes('Umrah &lt;Ramadan&gt;'));
  assert.ok(!mail.html.includes('<Ramadan>'));
  assert.ok(mail.html.includes('A&amp;B'));
});

test('line breaks in the organisation or trip name never reach the subject', () => {
  for (const lang of ['en', 'nl', 'ar']) {
    const mail = buildInvitationMail({ lang, org: 'Noor\r\nBcc: x@y.test', trip: { ...trip, title: 'Umrah\nMei' }, code: 'abc-123' });
    assert.doesNotMatch(mail.subject, /[\r\n]/);
  }
  assert.equal(buildInvitationMail({ lang: 'en', org: 'A\r\nB', trip: { ...trip, title: 'T' }, code: 'c' }).subject, 'A B invites you to T');
});
