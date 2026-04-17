'use strict';
var fixtures = require('./dichiarazione-fixtures.js');
var DE = require('../dichiarazione-engine.js');

describe('DichiarazioneEngine stubs', function() {
  test('VERSION is 0.1.0', function() {
    expect(DE.VERSION).toBe('0.1.0');
  });
  test('buildDichiarazione returns object', function() {
    var result = DE.buildDichiarazione();
    expect(typeof result).toBe('object');
  });
  test('validateDichiarazione returns errors and warnings arrays', function() {
    var result = DE.validateDichiarazione({});
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

describe('validateCodiceFiscale', function() {
  test('accepts valid CF RSSMRA80A01H501U', function() {
    expect(DE.validateCodiceFiscale('RSSMRA80A01H501U')).toBe(true);
  });
  test('rejects empty string', function() {
    expect(DE.validateCodiceFiscale('')).toBe(false);
  });
  test('rejects short string', function() {
    expect(DE.validateCodiceFiscale('RSSMRA80')).toBe(false);
  });
  test('rejects wrong check digit', function() {
    // RSSMRA80A01H501X has wrong last char (should be U)
    expect(DE.validateCodiceFiscale('RSSMRA80A01H501X')).toBe(false);
  });
  test('accepts CF in lowercase (auto-uppercase)', function() {
    expect(DE.validateCodiceFiscale('rssmra80a01h501u')).toBe(true);
  });
});
