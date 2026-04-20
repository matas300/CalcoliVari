'use strict';

// Simula ambiente browser minimale per caricare clienti-autofill.js (IIFE su window).
global.window = global.window || {};

require('../clienti-autofill.js');

describe('ClientiAutofill module', function () {
  test('window.ClientiAutofill è esposto', function () {
    expect(typeof global.window.ClientiAutofill).toBe('object');
    expect(!!global.window.ClientiAutofill).toBeTruthy();
  });

  test('espone API lookupPartitaIva, hasApiKey, getApiKey', function () {
    expect(typeof global.window.ClientiAutofill.lookupPartitaIva).toBe('function');
    expect(typeof global.window.ClientiAutofill.hasApiKey).toBe('function');
    expect(typeof global.window.ClientiAutofill.getApiKey).toBe('function');
  });
});
