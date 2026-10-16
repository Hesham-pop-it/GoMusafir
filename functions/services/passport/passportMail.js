// The two passport mails: the personal link and the 6-digit code. English, Dutch and Arabic are written;
// every other language is sent in English and flagged for translation (same rule as the invitation mail).
const LINK_BASE = process.env.PASSPORT_LINK_BASE || 'https://join.gomusafir.app/paspoort';

const COPY = {
  en: {
    dir: 'ltr', hello: 'Assalamu alaikum,',
    linkSubject: ({ org }) => `${org}: fill in your passport details`,
    linkLead: ({ org, title }) => `${org} asks you to complete your travel details for "${title}" (name, visa, passport, health and emergency contact).`,
    linkNote: ({ days }) => `Only your travel organisation can see this. The link works for ${days} days and asks for a code that we mail to this address.`,
    cta: 'Open my passport page', fallback: 'If the button does not work, open this link:', ignore: 'Did not expect this mail? You can ignore it.',
    codeSubject: ({ code }) => `Your GoMusafir code: ${code}`,
    codeLead: 'Use this code to open your passport page:', codeNote: ({ minutes }) => `The code works for ${minutes} minutes. Never share it with anyone.`,
    remindSubject: ({ org }) => `${org}: your passport details are still missing`,
    remindLead: ({ org, title }) => `${org} is still missing some of your travel details for "${title}". It only takes a few minutes.`,
    pushTitle: 'Complete your passport details', pushBody: ({ org }) => `${org} is still missing some of your travel details.`,
  },
  nl: {
    dir: 'ltr', hello: 'Assalamu alaikum,',
    linkSubject: ({ org }) => `${org}: vul je paspoortgegevens in`,
    linkLead: ({ org, title }) => `${org} vraagt je om je reisgegevens voor "${title}" aan te vullen (gegevens, visum, paspoort, gezondheid en noodcontact).`,
    linkNote: ({ days }) => `Alleen jouw reisorganisatie kan dit zien. De link werkt ${days} dagen en vraagt om een code die we naar dit adres mailen.`,
    cta: 'Open mijn paspoortpagina', fallback: 'Werkt de knop niet? Open dan deze link:', ignore: 'Verwachtte je deze mail niet? Dan kun je hem negeren.',
    codeSubject: ({ code }) => `Je GoMusafir-code: ${code}`,
    codeLead: 'Gebruik deze code om je paspoortpagina te openen:', codeNote: ({ minutes }) => `De code werkt ${minutes} minuten. Deel hem met niemand.`,
    remindSubject: ({ org }) => `${org}: je paspoortgegevens ontbreken nog`,
    remindLead: ({ org, title }) => `${org} mist nog een deel van je reisgegevens voor "${title}". Het kost maar een paar minuten.`,
    pushTitle: 'Vul je paspoortgegevens aan', pushBody: ({ org }) => `${org} mist nog een deel van je reisgegevens.`,
  },
  ar: {
    dir: 'rtl', hello: 'السلام عليكم،',
    linkSubject: ({ org }) => `${org}: أكمل بيانات جواز سفرك`,
    linkLead: ({ org, title }) => `تطلب ${org} منك إكمال بيانات سفرك لرحلة "${title}" (البيانات والتأشيرة وجواز السفر والصحة وجهة الطوارئ).`,
    linkNote: ({ days }) => `لا يراها إلا منظم رحلتك. يعمل الرابط ${days} يومًا ويطلب رمزًا نرسله إلى هذا العنوان.`,
    cta: 'فتح صفحة جواز سفري', fallback: 'إذا لم يعمل الزر، افتح هذا الرابط:', ignore: 'لم تتوقع هذه الرسالة؟ يمكنك تجاهلها.',
    codeSubject: ({ code }) => `رمز GoMusafir الخاص بك: ${code}`,
    codeLead: 'استخدم هذا الرمز لفتح صفحة جواز سفرك:', codeNote: ({ minutes }) => `يعمل الرمز ${minutes} دقائق. لا تشاركه مع أحد.`,
    remindSubject: ({ org }) => `${org}: بيانات جواز سفرك لا تزال ناقصة`,
    remindLead: ({ org, title }) => `لا تزال ${org} تحتاج بعض بيانات سفرك لرحلة "${title}". يستغرق الأمر دقائق قليلة.`,
    pushTitle: 'أكمل بيانات جواز سفرك', pushBody: ({ org }) => `لا تزال ${org} تحتاج بعض بيانات سفرك.`,
  },
};
// Names go into the mail subject: a line break there could add headers, so any is turned into a space.
const oneLine = value => String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
const TRANSLATED = Object.keys(COPY);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const passportLink = token => `${LINK_BASE}${LINK_BASE.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`;
const wrap = (copy, body) => `<div dir="${copy.dir}" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1c1c1e">${body}</div>`;
const pick = lang => { const used = TRANSLATED.includes(lang) ? lang : 'en'; return { used, copy: COPY[used] }; };

// -> { subject, html, lang, fallback }
function buildLinkMail({ lang = 'en', org, trip, token, days = 14 }) {
  const { used, copy } = pick(lang);
  const info = { org: oneLine(org) || 'GoMusafir', title: oneLine(trip?.title) || 'GoMusafir', days };
  const link = passportLink(token);
  const html = wrap(copy, `<p>${escapeHtml(copy.hello)}</p><p>${escapeHtml(copy.linkLead(info))}</p>`
    + `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(copy.cta)}</a></p>`
    + `<p style="font-size:14px;color:#555">${escapeHtml(copy.linkNote(info))}</p>`
    + `<p style="font-size:14px;color:#555">${escapeHtml(copy.fallback)}<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
    + `<p style="font-size:14px;color:#555">${escapeHtml(copy.ignore)}</p>`);
  return { subject: copy.linkSubject(info), html, lang: used, fallback: used !== lang };
}

// A reminder carries a fresh link: an earlier one cannot be read back from its hash.
function buildReminderMail({ lang = 'en', org, trip, token, days = 14 }) {
  const { used, copy } = pick(lang);
  const info = { org: oneLine(org) || 'GoMusafir', title: oneLine(trip?.title) || 'GoMusafir', days };
  const link = passportLink(token);
  const html = wrap(copy, `<p>${escapeHtml(copy.hello)}</p><p>${escapeHtml(copy.remindLead(info))}</p>`
    + `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(copy.cta)}</a></p>`
    + `<p style="font-size:14px;color:#555">${escapeHtml(copy.linkNote(info))}</p>`
    + `<p style="font-size:14px;color:#555">${escapeHtml(copy.fallback)}<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
    + `<p style="font-size:14px;color:#555">${escapeHtml(copy.ignore)}</p>`);
  return { subject: copy.remindSubject(info), html, lang: used, fallback: used !== lang, push: { title: copy.pushTitle, body: copy.pushBody(info) } };
}

function buildCodeMail({ lang = 'en', code, minutes = 10 }) {
  const { used, copy } = pick(lang);
  const html = wrap(copy, `<p>${escapeHtml(copy.hello)}</p><p>${escapeHtml(copy.codeLead)}</p>`
    + `<p style="font-size:32px;letter-spacing:8px;font-weight:bold;direction:ltr">${escapeHtml(code)}</p>`
    + `<p style="font-size:14px;color:#555">${escapeHtml(copy.codeNote({ minutes }))}</p><p style="font-size:14px;color:#555">${escapeHtml(copy.ignore)}</p>`);
  return { subject: copy.codeSubject({ code }), html, lang: used, fallback: used !== lang };
}

module.exports = { buildLinkMail, buildReminderMail, buildCodeMail, passportLink, TRANSLATED, LINK_BASE };
