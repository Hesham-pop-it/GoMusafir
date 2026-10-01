const { cityMapping } = require('city-timezones');
const { HttpsError } = require('firebase-functions/v2/https');

const normalize = value => value.normalize('NFKD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const aliases = { mecca: 'makkah', madinah: 'medina', 'al madinah': 'medina', 'new york city': 'new york' };
const cities = cityMapping.map(city => ({
  names: [...new Set([city.city, city.city_ascii].filter(value => typeof value === 'string' && value).map(normalize))],
  qualifiers: new Set([city.country, city.province, city.state_ansi, city.iso2, city.iso3,
    city.iso2 === 'GB' ? 'UK Britain' : '', city.iso2 === 'AE' ? 'UAE' : '']
    .filter(value => typeof value === 'string' && value).map(normalize).join(' ').split(' ')),
  timeZone: city.timezone,
}));

// Accept a whole country only when all mapped locations agree on its zone.
// Multi-zone countries still need a city; never choose their capital as a guess.
const countryZones = new Map();
for (const city of cityMapping) {
  const names = [city.country, city.iso2, city.iso3,
    ...(city.iso2 === 'US' ? ['United States'] : []),
    ...(city.iso2 === 'GB' ? ['UK', 'Britain'] : []),
    ...(city.iso2 === 'AE' ? ['UAE'] : [])];
  for (const name of names) {
    if (typeof name !== 'string' || !name) continue;
    const key = normalize(name);
    if (!countryZones.has(key)) countryZones.set(key, new Set());
    countryZones.get(key).add(city.timezone);
  }
}

function resolveTripTimeZone(destination) {
  if (typeof destination !== 'string' || !destination.trim() || destination.length > 200) {
    throw new HttpsError('invalid-argument', 'Enter a destination city and country.');
  }
  let query = normalize(destination);
  // Common destination spellings must resolve identically.
  for (const [alias, city] of Object.entries(aliases).sort((a, b) => b[0].length - a[0].length)) {
    if (query === alias || query.startsWith(alias + ' ')) {
      query = city + query.slice(alias.length);
      break;
    }
  }
  const countryMatches = countryZones.get(query);
  let longest = 0;
  let matches = countryMatches ? [...countryMatches] : [];
  for (const city of countryMatches ? [] : cities) {
    for (const name of city.names) {
      if (query !== name && !query.startsWith(name + ' ')) continue;
      const qualifier = query.slice(name.length).trim();
      if (qualifier && !qualifier.split(' ').every(word => city.qualifiers.has(word))) continue;
      if (name.length > longest) { longest = name.length; matches = []; }
      if (name.length === longest) matches.push(city.timeZone);
    }
  }
  const zones = [...new Set(matches)];
  if (zones.length !== 1 || !zones[0]) {
    throw new HttpsError('invalid-argument', zones.length > 1
      ? (countryMatches
        ? 'This country has multiple time zones. Enter the destination city and country.'
        : 'This destination matches different locations. Add its country and state or region.')
      : 'We could not locate this destination. Enter the city and country (for example, Makkah, Saudi Arabia).');
  }
  try {
    // IANA identifiers keep DST rules; a fixed GMT offset cannot do this.
    return new Intl.DateTimeFormat('en', { timeZone: zones[0] }).resolvedOptions().timeZone;
  } catch (_) {
    throw new HttpsError('invalid-argument', 'This destination’s time zone is unavailable. Please choose a nearby city.');
  }
}

function tripTimeZoneFields(destination) {
  return { time_zone: resolveTripTimeZone(destination), time_zone_source: 'destination' };
}

module.exports = { resolveTripTimeZone, tripTimeZoneFields };
