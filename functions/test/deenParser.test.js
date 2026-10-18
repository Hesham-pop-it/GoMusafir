const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDates, parseCount, parseYesNo, parseSkip, destinationCandidates, normalizeText, LANGS } = require('../services/deen/deenParser');

const now = Date.UTC(2026, 9, 16); // 16 October 2026
const dates = text => parseDates(text, { now });

const DATE_CASES = [
  ['nl', 'we vertrekken 18 februari en zijn 3 maart terug', ['2027-02-18', '2027-03-03']],
  ['nl', '7 tot 20 februari 2027', ['2027-02-07', '2027-02-20']],
  ['nl', 'van 1 maart tot en met 14 maart', ['2027-03-01', '2027-03-14']],
  ['en', 'We leave on February 18 and return March 3', ['2027-02-18', '2027-03-03']],
  ['en', 'from the 7th to the 20th of February 2027', ['2027-02-07', '2027-02-20']],
  ['en', '28 to 3 March', ['2027-02-28', '2027-03-03']],
  ['ar', 'نسافر من ١٨ فبراير إلى ٣ مارس', ['2027-02-18', '2027-03-03']],
  ['ar', 'من 7 إلى 20 فبراير 2027', ['2027-02-07', '2027-02-20']],
  ['ur', '۱۸ فروری سے ۳ مارچ تک', ['2027-02-18', '2027-03-03']],
  ['ur', 'ہم 7 سے 20 فروری 2027 تک سفر کریں گے', ['2027-02-07', '2027-02-20']],
  ['tr', '18 Şubat - 3 Mart arası', ['2027-02-18', '2027-03-03']],
  ['tr', '7 ile 20 Şubat 2027 tarihleri arasında', ['2027-02-07', '2027-02-20']],
  ['id', 'kami berangkat 18 Februari dan kembali 3 Maret', ['2027-02-18', '2027-03-03']],
  ['id', '28 Desember sampai 3 Januari', ['2026-12-28', '2027-01-03']],
  ['ru', 'с 18 февраля по 3 марта', ['2027-02-18', '2027-03-03']],
  ['de', 'vom 18. Februar bis zum 3. März', ['2027-02-18', '2027-03-03']],
  ['fr', 'du 18 février au 3 mars', ['2027-02-18', '2027-03-03']],
  ['es', 'del 18 de febrero al 3 de marzo', ['2027-02-18', '2027-03-03']],
  ['pt', '18 de março a 25 de março', ['2027-03-18', '2027-03-25']],
  ['fa', '۱۸ فوریه تا ۳ مارس', ['2027-02-18', '2027-03-03']],
  ['hi', '18 फरवरी से 3 मार्च तक', ['2027-02-18', '2027-03-03']],
  ['bn', '১৮ ফেব্রুয়ারি থেকে ৩ মার্চ', ['2027-02-18', '2027-03-03']],
  ['ms', '18 Februari hingga 3 Mac', ['2027-02-18', '2027-03-03']],
  ['any', '18/2/2027 - 3/3/2027', ['2027-02-18', '2027-03-03']],
  ['any', '2027-02-07 2027-02-20', ['2027-02-07', '2027-02-20']],
];
for (const [lang, text, expected] of DATE_CASES) {
  test(`dates (${lang}): ${text}`, () => assert.deepEqual(dates(text), expected));
}

test('a date that is still ahead this year stays in this year, one that passed moves to next year', () => {
  assert.deepEqual(dates('20 december'), ['2026-12-20']);
  assert.deepEqual(dates('16 oktober'), ['2026-10-16']);
  assert.deepEqual(dates('15 oktober'), ['2027-10-15']);
});

test('an end date before the start rolls into the next year', () => {
  assert.deepEqual(dates('20 november tot 5 januari'), ['2026-11-20', '2027-01-05']);
});

test('impossible or missing dates give nothing', () => {
  assert.deepEqual(dates('31 februari'), []);
  assert.deepEqual(dates('geen idee'), []);
  assert.deepEqual(dates(''), []);
  assert.deepEqual(dates(undefined), []);
});

const COUNT_CASES = [
  ['nl', 'met 110 mensen', 110], ['nl', 'ongeveer vijftig personen', 50], ['nl', 'wij zijn met twintig', 20],
  ['en', 'about 45 people', 45], ['en', 'thirty pilgrims', 30], ['en', '1,200 guests', 1200],
  ['ar', '٢٥ شخصاً', 25], ['ar', 'عشرون حاجا', 20], ['ar', 'مئة شخص', 100],
  ['ur', '۴۰ لوگ', 40], ['ur', 'پچاس افراد', 50],
  ['tr', '35 kişi', 35], ['tr', 'yirmi kişi', 20],
  ['id', '60 orang', 60], ['id', 'dua puluh orang', 20], ['id', 'seratus jamaah', 100],
  ['de', 'wir sind 12 Leute', 12], ['fr', 'nous serons trente', 30], ['es', 'somos cuarenta', 40],
  ['hi', '२० लोग', 20], ['bn', '৩০ জন', 30],
];
for (const [lang, text, expected] of COUNT_CASES) {
  test(`number (${lang}): ${text}`, () => assert.equal(parseCount(text), expected));
}

test('numbers: nothing, zero and absurd values are refused', () => {
  assert.equal(parseCount('geen idee'), null);
  assert.equal(parseCount('0'), null);
  assert.equal(parseCount('9999999'), null);
  assert.equal(parseCount(''), null);
});

const YES_NO_CASES = [
  ['nl', 'Ja, klopt', 'yes'], ['nl', 'nee', 'no'], ['nl', 'ja maar nee', 'no'], ['nl', 'prima zo', 'yes'],
  ['en', 'Yes please', 'yes'], ['en', 'No, change it', 'no'], ['en', 'sounds good', null],
  ['ar', 'نعم', 'yes'], ['ar', 'لا', 'no'], ['ar', 'تمام', 'yes'],
  ['ur', 'جی ہاں', 'yes'], ['ur', 'نہیں', 'no'], ['ur', 'ٹھیک ہے', 'yes'],
  ['tr', 'Evet', 'yes'], ['tr', 'hayır', 'no'], ['tr', 'tamam', 'yes'],
  ['id', 'Ya, benar', 'yes'], ['id', 'tidak', 'no'], ['id', 'nggak jadi', 'no'],
  ['de', 'Ja genau', 'yes'], ['de', 'nein', 'no'], ['fr', 'oui', 'yes'], ['fr', 'non', 'no'],
  ['es', 'sí', 'yes'], ['pt', 'sim', 'yes'], ['pt', 'não', 'no'], ['ru', 'да', 'yes'], ['ru', 'нет', 'no'],
  ['fa', 'بله', 'yes'], ['fa', 'نه', 'no'], ['hi', 'हाँ', 'yes'], ['hi', 'नहीं', 'no'], ['bn', 'হ্যাঁ', 'yes'], ['bn', 'না', 'no'],
  ['ms', 'ya', 'yes'],
];
for (const [lang, text, expected] of YES_NO_CASES) {
  test(`yes/no (${lang}): ${text}`, () => assert.equal(parseYesNo(text), expected));
}

test('skip words and no count as skipping the banner', () => {
  for (const text of ['overslaan', 'geen banner', 'skip', 'no thanks', 'nee', 'tidak usah', 'تخطي', 'atla']) assert.equal(parseSkip(text), true, text);
  assert.equal(parseSkip('hier is mijn foto'), false);
});

test('destination candidates drop leading words one by one', () => {
  assert.deepEqual(destinationCandidates('we gaan naar Makkah, Saudi Arabia.'),
    ['we gaan naar Makkah, Saudi Arabia', 'gaan naar Makkah, Saudi Arabia', 'naar Makkah, Saudi Arabia', 'Makkah, Saudi Arabia', 'Saudi Arabia']);
  assert.deepEqual(destinationCandidates('  '), []);
  assert.ok(!destinationCandidates('<b>x</b>')[0].includes('<'));
});

test('the 15 app languages are listed', () => {
  assert.equal(LANGS.length, 15);
  assert.equal(normalizeText('١٢٣ ۴۵۶ ७८९ ১২৩'), '123 456 789 123');
});
