'use strict';
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
