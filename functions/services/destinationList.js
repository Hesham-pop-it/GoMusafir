// Splits "Mekka en Medina" style destinations into their places. Pure, shared by Deen and the time zone lookup.
// Joiners: nl/en/de/fr/es/pt/tr/id/ms/ru/ar/fa/ur/hi/bn, plus & and +.
const JOINERS = ['en', 'and', 'und', 'et', 'y', 'e', 've', 'dan', 'и', 'و', 'اور', 'और', 'ও', 'এবং', '&', '+'];
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A joiner is a word of its own; the Arabic and Persian "wa" may also be glued to "al-".
const SPLIT = new RegExp(`\\s+(?:${JOINERS.map(escape).join('|')})\\s+|\\s+و(?=ال)`, 'iu');

function splitDestinations(text) {
  return String(text ?? '').split(SPLIT).map(part => part.trim()).filter(Boolean);
}

module.exports = { splitDestinations };
