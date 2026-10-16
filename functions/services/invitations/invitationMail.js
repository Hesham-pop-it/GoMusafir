// The invitation mail: one subject and body per language, with the trip's own invitation link.
// English, Dutch and Arabic are written; every other language is sent in English and flagged for translation.
const LINK_BASE = 'https://app.gomusafir.app/link/';

const COPY = {
  en: {
    dir: 'ltr',
    subject: ({ org, title }) => `${org} invites you to ${title}`,
    hello: 'Assalamu alaikum,',
    lead: ({ org, title }) => `${org} has invited you to join the trip "${title}" in the GoMusafir app.`,
    when: ({ destination, dates }) => [destination && `Destination: ${destination}`, dates && `Dates: ${dates}`].filter(Boolean),
    cta: 'Join the trip',
    fallback: 'If the button does not work, open this link on your phone:',
    ignore: 'Did not expect this mail? You can ignore it.',
  },
  nl: {
    dir: 'ltr',
    subject: ({ org, title }) => `${org} nodigt je uit voor ${title}`,
    hello: 'Assalamu alaikum,',
    lead: ({ org, title }) => `${org} nodigt je uit voor de reis "${title}" in de GoMusafir-app.`,
    when: ({ destination, dates }) => [destination && `Bestemming: ${destination}`, dates && `Data: ${dates}`].filter(Boolean),
    cta: 'Meld je aan voor de reis',
    fallback: 'Werkt de knop niet? Open dan deze link op je telefoon:',
    ignore: 'Verwachtte je deze mail niet? Dan kun je hem negeren.',
  },
  ar: {
    dir: 'rtl',
    subject: ({ org, title }) => `${org} يدعوك إلى رحلة ${title}`,
    hello: 'السلام عليكم،',
    lead: ({ org, title }) => `دعتك ${org} للانضمام إلى رحلة "${title}" في تطبيق GoMusafir.`,
    when: ({ destination, dates }) => [destination && `الوجهة: ${destination}`, dates && `التواريخ: ${dates}`].filter(Boolean),
    cta: 'الانضمام إلى الرحلة',
    fallback: 'إذا لم يعمل الزر، افتح هذا الرابط على هاتفك:',
    ignore: 'لم تتوقع هذه الرسالة؟ يمكنك تجاهلها.',
  },
};
const TRANSLATED = Object.keys(COPY);

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inviteLink = code => `${LINK_BASE}${encodeURIComponent(code)}`;

function formatDates(start, end, lang) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  try {
    const format = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return `${format.format(start)} - ${format.format(end)}`;
  } catch (_) {
    return `${new Date(start).toISOString().slice(0, 10)} - ${new Date(end).toISOString().slice(0, 10)}`;
  }
}

// -> { subject, html, lang (language used), fallback (true when the requested language still needs a translation) }
function buildInvitationMail({ lang = 'en', org, trip, code }) {
  const used = TRANSLATED.includes(lang) ? lang : 'en';
  const copy = COPY[used];
  const info = {
    org: org || 'GoMusafir', title: trip?.title || 'GoMusafir',
    destination: typeof trip?.destination === 'string' ? trip.destination : trip?.destination?.name,
    dates: formatDates(trip?.start_date, trip?.end_date, used),
  };
  const link = inviteLink(code);
  const lines = copy.when(info).map(line => `<p style="margin:0 0 4px">${escapeHtml(line)}</p>`).join('');
  const html = `<div dir="${copy.dir}" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1c1c1e">`
    + `<p>${escapeHtml(copy.hello)}</p><p>${escapeHtml(copy.lead(info))}</p>${lines}`
    + `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(copy.cta)}</a></p>`
    + `<p style="font-size:14px;color:#555">${escapeHtml(copy.fallback)}<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
    + `<p style="font-size:14px;color:#555">${escapeHtml(copy.ignore)}</p></div>`;
  return { subject: copy.subject(info), html, lang: used, fallback: used !== lang };
}

module.exports = { buildInvitationMail, inviteLink, TRANSLATED, LINK_BASE };
