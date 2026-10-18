// Deterministic parser for Deen's free text: dates, numbers and yes/no in the 15 app languages.
// It is the only interpreter in the emulator and the fallback when the model is off or fails.
// Pure: no clock (the caller passes today), no network.
const DAY_MS = 86400000;

const LANGS = ['ar', 'bn', 'de', 'en', 'es', 'fa', 'fr', 'hi', 'id', 'ms', 'nl', 'pt', 'ru', 'tr', 'ur'];

// Digits of other scripts become ASCII digits.
const DIGIT_BLOCKS = [0x0660, 0x06f0, 0x0966, 0x09e6];
function normalizeText(text) {
  let out = String(text ?? '').normalize('NFC').toLowerCase();
  out = out.replace(/[٠-٩۰-۹०-९০-৯]/g, ch => {
    const code = ch.charCodeAt(0);
    const base = DIGIT_BLOCKS.find(b => code >= b && code < b + 10);
    return String(code - base);
  });
  // Arabic punctuation, tatweel, diacritics and the zero width joiners add nothing.
  return out.replace(/[ً-ٟـ‌‍‎‏]/g, '').replace(/[،؛؟]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Months ───────────────────────────────────────────────────────────────────
const MONTHS = {
  1: ['januari', 'january', 'januar', 'enero', 'janvier', 'janeiro', 'ocak', 'января', 'январь', 'يناير', 'كانون الثاني', 'جنوری', 'ژانویه', 'जनवरी', 'জানুয়ারি', 'jan'],
  2: ['februari', 'february', 'februar', 'febrero', 'février', 'fevrier', 'fevereiro', 'şubat', 'subat', 'февраля', 'февраль', 'فبراير', 'شباط', 'فروری', 'فوریه', 'फरवरी', 'फ़रवरी', 'ফেব্রুয়ারি', 'feb'],
  3: ['maart', 'march', 'märz', 'marz', 'marzo', 'mars', 'março', 'marco', 'mart', 'maret', 'mac', 'марта', 'март', 'مارس', 'آذار', 'مارچ', 'मार्च', 'মার্চ', 'mrt', 'mär', 'mrz', 'mar'],
  4: ['april', 'abril', 'avril', 'nisan', 'апреля', 'апрель', 'أبريل', 'ابريل', 'نيسان', 'اپریل', 'آوریل', 'अप्रैल', 'এপ্রিল', 'apr'],
  5: ['mei', 'may', 'mai', 'mayo', 'maio', 'mayıs', 'mayis', 'мая', 'май', 'مايو', 'أيار', 'ایار', 'مئی', 'مه', 'मई', 'মে'],
  6: ['juni', 'june', 'junio', 'juin', 'junho', 'haziran', 'июня', 'июнь', 'يونيو', 'حزيران', 'جون', 'ژوئن', 'जून', 'জুন', 'jun'],
  7: ['juli', 'july', 'julio', 'juillet', 'julho', 'temmuz', 'июля', 'июль', 'يوليو', 'تموز', 'جولائی', 'ژوئیه', 'जुलाई', 'জুলাই', 'jul'],
  8: ['augustus', 'august', 'agosto', 'août', 'aout', 'ağustos', 'agustos', 'agustus', 'ogos', 'августа', 'август', 'أغسطس', 'اغسطس', 'آب', 'اگست', 'اوت', 'अगस्त', 'আগস্ট', 'aug', 'ago'],
  9: ['september', 'septiembre', 'setiembre', 'septembre', 'setembro', 'eylül', 'eylul', 'сентября', 'сентябрь', 'سبتمبر', 'أيلول', 'ستمبر', 'سپتامبر', 'सितंबर', 'सितम्बर', 'সেপ্টেম্বর', 'sep', 'sept'],
  10: ['oktober', 'october', 'octubre', 'octobre', 'outubro', 'ekim', 'октября', 'октябрь', 'أكتوبر', 'اكتوبر', 'تشرين الأول', 'اکتوبر', 'اکتبر', 'अक्तूबर', 'अक्टूबर', 'অক্টোবর', 'okt', 'oct'],
  11: ['november', 'noviembre', 'novembre', 'novembro', 'kasım', 'kasim', 'ноября', 'ноябрь', 'نوفمبر', 'تشرين الثاني', 'نومبر', 'نوامبر', 'नवंबर', 'नवम्बर', 'নভেম্বর', 'nov'],
  12: ['december', 'dezember', 'diciembre', 'décembre', 'decembre', 'dezembro', 'aralık', 'aralik', 'desember', 'disember', 'декабря', 'декабрь', 'ديسمبر', 'كانون الأول', 'دسمبر', 'دسامبر', 'दिसंबर', 'दिसम्बर', 'ডিসেম্বর', 'dec', 'dic', 'des'],
};
const MONTH_LOOKUP = new Map();
for (const [n, names] of Object.entries(MONTHS)) for (const name of names) MONTH_LOOKUP.set(normalizeText(name), Number(n));
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONTH_RE = new RegExp(
  `(?<![\\p{L}\\p{M}])(${[...MONTH_LOOKUP.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})\\.?(?![\\p{L}\\p{M}])`, 'gu');

const pad = n => String(n).padStart(2, '0');
const toDay = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function validDay(y, m, d) {
  if (!(y >= 2000 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = Date.UTC(y, m - 1, d);
  const date = new Date(t);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
const dayToMs = day => Date.parse(`${day}T00:00:00.000Z`);
const todayIso = now => new Date(now).toISOString().slice(0, 10);

// Candidate mentions: { month, day, year, start, end } in text order.
function findMentions(text) {
  const mentions = [];
  const taken = [];
  const occupy = (s, e) => taken.push([s, e]);
  const free = (s, e) => !taken.some(([a, b]) => s < b && e > a);

  // ISO yyyy-mm-dd and numeric d/m/y, d-m-y, d.m.y
  for (const m of text.matchAll(/(?<![\d])(\d{4})-(\d{1,2})-(\d{1,2})(?![\d])/g)) {
    mentions.push({ year: +m[1], month: +m[2], day: +m[3], start: m.index, end: m.index + m[0].length, explicit: true });
    occupy(m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(/(?<![\d])(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}|\d{2}))?(?![\d])/g)) {
    if (!free(m.index, m.index + m[0].length)) continue;
    let day = +m[1], month = +m[2];
    if (month > 12 && day <= 12) [day, month] = [month, day]; // 3/18 can only be month first
    let year = m[3] ? +m[3] : null;
    if (year !== null && year < 100) year += 2000;
    mentions.push({ year, month, day, start: m.index, end: m.index + m[0].length, explicit: true });
    occupy(m.index, m.index + m[0].length);
  }
  // Month names with a day before or after.
  const months = [...text.matchAll(MONTH_RE)].map(m => ({ month: MONTH_LOOKUP.get(m[1]), start: m.index, end: m.index + m[0].length }));
  const numbers = [...text.matchAll(/(?<![\d])(\d{1,4})(?:st|nd|rd|th|e|de|ste|er|º|\.|º)?(?![\d])/g)]
    .filter(m => free(m.index, m.index + m[0].length))
    .map(m => ({ value: +m[1], start: m.index, end: m.index + m[0].length, used: false }));
  const dayNumbers = numbers.filter(n => n.value >= 1 && n.value <= 31);
  const years = numbers.filter(n => n.value >= 2000 && n.value <= 2200);
  const isFiller = s => s.trim().split(/\s+/).filter(Boolean).length <= 2 && !/\d/.test(s);
  for (const mo of months) {
    // "18 februari", "18th of February", "18 de febrero" ...
    let day = [...dayNumbers].reverse().find(n => !n.used && n.end <= mo.start && isFiller(text.slice(n.end, mo.start)));
    if (!day) day = dayNumbers.find(n => !n.used && n.start >= mo.end && isFiller(text.slice(mo.end, n.start)));
    if (!day) continue;
    day.used = true;
    mentions.push({ month: mo.month, day: day.value, year: null, start: Math.min(day.start, mo.start), end: Math.max(day.end, mo.end) });
  }
  mentions.sort((a, b) => a.start - b.start);
  // A year next to a mention (within two words) belongs to it.
  for (const y of years) {
    const target = mentions.filter(m => m.year === null)
      .find(m => (y.start >= m.end && isFiller(text.slice(m.end, y.start))) || (y.end <= m.start && isFiller(text.slice(y.end, m.start))));
    if (target) target.year = y.value;
  }
  // "7 tot 20 februari 2027": a day without a month before a dated mention takes that mention's month.
  const orphans = dayNumbers.filter(n => !n.used && !mentions.some(m => n.start >= m.start && n.end <= m.end));
  for (const n of orphans) {
    const next = mentions.find(m => m.start >= n.end && !m.explicit && text.slice(n.end, m.start).trim().split(/\s+/).filter(Boolean).length <= 3 && !/\d/.test(text.slice(n.end, m.start)));
    const hasPrev = mentions.some(m => m.end <= n.start);
    if (next && !hasPrev) {
      mentions.push({ month: next.month, day: n.value, year: null, start: n.start, end: n.end, borrowed: true });
    }
  }
  mentions.sort((a, b) => a.start - b.start);
  return mentions;
}

// Returns up to two ISO days: [start] or [start, end] (both inclusive days of the trip).
function parseDates(text, opts) {
  return parseDatesAt(text, opts).days;
}

// Same, plus the word index where the first date mention starts in the text.
function parseDatesAt(text, { now = Date.now() } = {}) {
  const t = normalizeText(text);
  const mentions = findMentions(t);
  const days = resolveDays(mentions, now);
  return { days, at: days.length ? wordIndex(t, mentions[0].start) : -1 };
}

const wordIndex = (text, pos) => text.slice(0, pos).trim().split(/\s+/).filter(Boolean).length;

function resolveDays(mentions, now) {
  if (!mentions.length) return [];
  const today = todayIso(now);
  const year0 = +today.slice(0, 4);
  const first = { ...mentions[0] };
  const second = mentions[1] ? { ...mentions[1] } : null;
  // "28 to 3 March": the first day sits in the month before the end when it is later in the month.
  if (second && first.borrowed) {
    first.year = second.year;
    if (first.day > second.day) {
      if (first.month === 1) { first.month = 12; if (first.year !== null) first.year -= 1; } else first.month -= 1;
    }
  }
  const before = (a, b) => toDay(a.year, a.month, a.day) < toDay(b.year, b.month, b.day);
  // The first date takes its own year, else the year implied by the end date, else the next occurrence.
  if (first.year === null) {
    if (second && second.year !== null) {
      first.year = second.year;
      if (before({ ...second, year: second.year }, { ...first, year: second.year })) first.year -= 1;
    } else {
      first.year = year0;
      if (validDay(first.year, first.month, first.day) && toDay(first.year, first.month, first.day) < today) first.year += 1;
    }
  }
  if (!validDay(first.year, first.month, first.day)) return [];
  const out = [toDay(first.year, first.month, first.day)];
  if (second) {
    if (second.year === null) {
      second.year = first.year;
      if (validDay(second.year, second.month, second.day) && before(second, first)) second.year += 1;
    }
    if (validDay(second.year, second.month, second.day)) out.push(toDay(second.year, second.month, second.day));
  }
  return out;
}

// ── Numbers ──────────────────────────────────────────────────────────────────
const NUMBER_WORDS = {
  nl: { een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, twintig: 20, dertig: 30, veertig: 40, vijftig: 50, honderd: 100 },
  en: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 },
  de: { eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, hundert: 100 },
  fr: { un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, vingt: 20, trente: 30, quarante: 40, cinquante: 50, cent: 100 },
  es: { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100 },
  tr: { bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yirmi: 20, otuz: 30, kırk: 40, elli: 50, yüz: 100 },
  id: { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, 'dua puluh': 20, 'tiga puluh': 30, 'empat puluh': 40, 'lima puluh': 50, seratus: 100 },
  ar: { واحد: 1, اثنان: 2, اثنين: 2, ثلاثة: 3, ثلاث: 3, اربعة: 4, أربعة: 4, خمسة: 5, ستة: 6, سبعة: 7, ثمانية: 8, تسعة: 9, عشرة: 10, عشرون: 20, عشرين: 20, ثلاثون: 30, ثلاثين: 30, اربعون: 40, أربعون: 40, اربعين: 40, أربعين: 40, خمسون: 50, خمسين: 50, مئة: 100, مائة: 100 },
  ur: { ایک: 1, دو: 2, تین: 3, چار: 4, پانچ: 5, چھ: 6, سات: 7, آٹھ: 8, نو: 9, دس: 10, بیس: 20, تیس: 30, چالیس: 40, پچاس: 50, سو: 100 },
};
const WORD_ENTRIES = Object.values(NUMBER_WORDS).flatMap(map => Object.entries(map).map(([w, v]) => [normalizeText(w), v]))
  .sort((a, b) => b[0].length - a[0].length);

// First whole number in the text (digits first, then simple number words), 1 to 100000.
function parseCount(text) {
  const t = normalizeText(text).replace(/(\d)[ ,.](?=\d{3}(?!\d))/g, '$1');
  const m = t.match(/(?<![\d])(\d{1,6})(?![\d])/);
  if (m) {
    const n = +m[1];
    return n >= 1 && n <= 100000 ? n : null;
  }
  for (const [word, value] of WORD_ENTRIES) {
    if (new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(word)}(?![\\p{L}\\p{M}])`, 'u').test(t)) return value;
  }
  return null;
}

// ── Yes and no ───────────────────────────────────────────────────────────────
const YES = [
  'ja', 'jazeker', 'klopt', 'prima', 'oke', 'ok', 'okay', 'akkoord', 'yes', 'yeah', 'yep', 'sure', 'correct', 'right', 'confirm',
  'genau', 'stimmt', 'richtig', 'oui', "d'accord", 'exact', 'sí', 'si', 'vale', 'claro', 'sim', 'certo', 'да', 'верно', 'хорошо',
  'نعم', 'أجل', 'اجل', 'ايوه', 'أيوه', 'ايوا', 'صح', 'صحيح', 'تمام', 'موافق', 'حسنا', 'حسناً', 'طيب',
  'جی', 'ہاں', 'جی ہاں', 'ٹھیک', 'صحیح', 'درست', 'اوکے',
  'evet', 'tamam', 'doğru', 'dogru', 'olur', 'onay', 'onaylıyorum',
  'ya', 'iya', 'betul', 'benar', 'setuju', 'baik', 'boleh',
  'بله', 'آره', 'اره', 'درسته', 'باشه', 'تایید', 'موافقم',
  'हाँ', 'हां', 'ठीक', 'सही', 'জি', 'হ্যাঁ', 'ঠিক',
].map(normalizeText);
const NO = [
  'nee', 'neen', 'nope', 'niet', 'no', 'nein', 'non', 'não', 'nao', 'нет', 'не',
  'لا', 'كلا', 'نہیں', 'نہی', 'نا', 'hayır', 'hayir', 'yok',
  'tidak', 'nggak', 'enggak', 'gak', 'bukan', 'tak', 'tidak',
  'نه', 'نخیر', 'नहीं', 'नही', 'না', 'নয়',
].map(normalizeText);
const SKIP = ['overslaan', 'sla over', 'skip', 'geen', 'later', 'zonder', 'überspringen', 'ohne', 'passer', 'omitir', 'pular', 'пропустить', 'تخطي', 'بدون', 'چھوڑ', 'atla', 'lewati', 'tanpa', 'رد', 'छोड़'].map(normalizeText);

function tokens(text) {
  return normalizeText(text).replace(/[!?.,;:"()\[\]{}]/g, ' ').split(/\s+/).filter(Boolean);
}
function hasWord(list, toks, joined) {
  return list.some(w => (w.includes(' ') ? ` ${joined} `.includes(` ${w} `) : toks.includes(w)));
}
// 'yes', 'no' or null. An explicit no beats a yes ("ja maar nee").
function parseYesNo(text) {
  const toks = tokens(text);
  const joined = toks.join(' ');
  if (hasWord(NO, toks, joined)) return 'no';
  if (hasWord(YES, toks, joined)) return 'yes';
  return null;
}
function parseSkip(text) {
  const toks = tokens(text);
  const joined = toks.join(' ');
  return hasWord(SKIP, toks, joined) || hasWord(NO, toks, joined);
}

// ── First message ────────────────────────────────────────────────────────────
// The organiser may answer the name question with a whole plan ("Umrah in maart 2027 met 40 mensen, vertrek
// 10 maart, terug 20 maart, naar Mekka en Medina"). Only clear signals are picked up: two dates, a number
// followed by a word for people, and a destination after a word like "naar" or "to".
const PEOPLE = ['mensen', 'personen', 'persoon', 'deelnemer', 'pelgrim', 'reiziger', 'gasten', 'people', 'person', 'participant', 'pilgrim', 'traveler', 'traveller',
  'guest', 'pax', 'leute', 'teilnehmer', 'pilger', 'gäste', 'reisende', 'personne', 'pèlerin', 'voyageur', 'invité', 'persona', 'participante', 'peregrino',
  'viajero', 'pessoa', 'человек', 'участник', 'паломник', 'شخص', 'أشخاص', 'اشخاص', 'معتمر', 'حاج', 'مشارك', 'زائر', 'مسافر', 'kişi', 'katılımcı', 'hacı', 'yolcu',
  'orang', 'peserta', 'jemaah', 'jamaah', 'نفر', 'حاجی', 'لوگ', 'افراد', 'लोग', 'यात्री', 'তীর্থযাত্রী', 'জন', 'যাত্রী', 'হাজি'].map(normalizeText);
const PEOPLE_RE = new RegExp(`(?<![\\d])(\\d{1,6})(?![\\d])\\s+(?:[\\p{L}\\p{M}]+\\s+)?(?:${PEOPLE.map(escapeRe).join('|')})[\\p{L}\\p{M}]*`, 'u');
const DEST_KEYS = ['naar', 'bestemming', 'to', 'destination', 'nach', 'ziel', 'vers', 'destino', 'hacia', 'para', 'a', 'в', 'إلى', 'الى', 'وجهة', 'به', 'مقصد',
  'ke', 'tujuan', 'hedef', 'मंजिल'];
const DEST_RE = new RegExp(`(?<![\\p{L}\\p{M}])(?:${DEST_KEYS.map(escapeRe).join('|')})(?![\\p{L}\\p{M}])[\\s:]+`, 'giu');
// Words that only introduce a value; they are not part of a trip name.
const FILLER = new Set(['we', 'wij', 'ik', 'i', 'our', 'gaan', 'go', 'going', 'leave', 'leaving', 'leaves', 'depart', 'departure', 'vertrek', 'vertrekken', 'vertrekt',
  'from', 'van', 'vanaf', 'tot', 'until', 'till', 'met', 'with', 'for', 'voor', 'naar', 'to', 'bestemming', 'destination', 'en', 'and', 'of', 'op', 'on', 'at',
  'de', 'het', 'the', 'een', 'zijn', 'are', 'is', 'terug', 'back', 'return', 'returning', 'return,', 'mit', 'avec', 'con', 'com', 'nach', 'ab', 'wir', 'nous', 'nosotros',
  'с', 'и', 'für', 'pour', 'para', 'por', 'und', 'et', 'y', 'e', 'dan', 've', 'ile', 'dengan', 'untuk', 'ke', 'bij', 'ongeveer', 'about', 'around', 'ca']);

// { days, daysAt, count, countAt, destinations: [{ at, tails }], words } on the cleaned text; `at` are word indexes.
function parseFirstMessage(text, { now = Date.now() } = {}) {
  const clean = String(text ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
  const norm = normalizeText(clean);
  const people = norm.match(PEOPLE_RE);
  // The head count must not be read as a day ("with 25 people, leaving 10 March").
  const dates = parseDatesAt(people ? norm.slice(0, people.index) + ' '.repeat(people[0].length) + norm.slice(people.index + people[0].length) : clean, { now });
  const destinations = [];
  for (const m of clean.matchAll(DEST_RE)) {
    const tail = clean.slice(m.index + m[0].length).replace(/[.!?؟]+$/u, '').trim();
    if (!tail) continue;
    const tails = [tail];
    for (let i = tail.lastIndexOf(','); i > 0; i = tail.lastIndexOf(',', i - 1)) tails.push(tail.slice(0, i).trim());
    destinations.push({ at: wordIndex(clean, m.index), tails: tails.filter(Boolean) });
  }
  destinations.reverse(); // the last keyword is the most likely destination
  return {
    days: dates.days, daysAt: dates.at, count: people ? +people[1] : null, countAt: people ? wordIndex(norm, people.index) : -1,
    destinations, words: clean.split(' ').filter(Boolean),
  };
}

// The trip name: the words before the first picked-up value, without trailing introducing words.
function nameBefore(words, at) {
  let end = at < 0 ? words.length : Math.min(at, words.length);
  while (end > 0 && FILLER.has(normalizeText(words[end - 1]).replace(/[^\p{L}\p{M}\p{N}']/gu, ''))) end--;
  const name = words.slice(0, end).join(' ').replace(/[\s,;:\-–]+$/u, '').trim();
  return name.length >= 2 && !words.slice(0, end).every(w => FILLER.has(normalizeText(w))) ? name : null;
}

// Destination candidates: the whole text, then the text without its first one to four words.
function destinationCandidates(text) {
  const clean = String(text ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').replace(/[.!?؟]+$/u, '').trim().slice(0, 200);
  const words = clean.split(' ').filter(Boolean);
  const out = [];
  for (let drop = 0; drop <= Math.min(4, words.length - 1); drop++) out.push(words.slice(drop).join(' '));
  return [...new Set(out.filter(Boolean))];
}

module.exports = {
  LANGS, DAY_MS, normalizeText, parseDates, parseFirstMessage, nameBefore, parseCount, parseYesNo, parseSkip, destinationCandidates, dayToMs, validDay, toDay,
};
