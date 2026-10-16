const test = require('node:test');
const assert = require('node:assert/strict');
const { splitDestinations } = require('../services/destinationList');
const { resolveTripTimeZone } = require('../services/tripTimeZoneService');

test('destinations split on the joiner of each parser language', () => {
  for (const text of ['Mekka en Medina', 'Mecca and Medina', 'Mekka und Medina', 'La Mecque et Medina', 'La Meca y Medina', 'Meca e Medina',
    'Mekka ve Medine', 'Mekkah dan Madinah', 'Мекка и Медина', 'Mecca & Medina', 'Mecca + Medina', 'مكة و المدينة', 'مكة والمدينة', 'مکہ اور مدینہ', 'मक्का और मदीना']) {
    assert.equal(splitDestinations(text).length, 2, text);
  }
  assert.deepEqual(splitDestinations('Makkah, Saudi Arabia'), ['Makkah, Saudi Arabia']);
  assert.deepEqual(splitDestinations(''), []);
});

test('a list of destinations resolves when all places share a time zone', () => {
  assert.equal(resolveTripTimeZone('Mekka en Medina'), 'Asia/Riyadh');
  assert.equal(resolveTripTimeZone('Mekka ve Medine'), 'Asia/Riyadh');
  assert.throws(() => resolveTripTimeZone('Mecca and Istanbul'), /different time zones/);
  assert.throws(() => resolveTripTimeZone('Mecca and Nowhereville'));
});
