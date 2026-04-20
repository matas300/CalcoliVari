'use strict';

// Simula ambiente browser minimale per caricare clienti-autofill.js (IIFE su window).
global.window = global.window || {};

require('../clienti-autofill.js');

var CA = global.window.ClientiAutofill;

function setApiKey(key) {
  global.window.data = { settings: { openapiKey: key } };
}
function clearApiKey() {
  global.window.data = { settings: {} };
}
function setFetch(fn) {
  global.window.fetch = fn;
}
function clearFetch() {
  delete global.window.fetch;
}

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

  test('lookupPartitaIva("123") → INVALID_PIVA (non 11 cifre)', function () {
    setApiKey('dummy-key');
    return CA.lookupPartitaIva('123').then(function (res) {
      expect(res.ok).toBe(false);
      expect(res.code).toBe('INVALID_PIVA');
    });
  });

  test('lookupPartitaIva senza API key → NO_KEY (no fetch)', function () {
    clearApiKey();
    var fetchCalled = false;
    setFetch(function () { fetchCalled = true; return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } }); });
    return CA.lookupPartitaIva('12345678901').then(function (res) {
      expect(res.ok).toBe(false);
      expect(res.code).toBe('NO_KEY');
      expect(fetchCalled).toBe(false);
      clearFetch();
    });
  });

  test('lookupPartitaIva happy path → ok:true con dati normalizzati', function () {
    setApiKey('dummy-key');
    setFetch(function () {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: function () {
          return Promise.resolve({
            data: {
              denominazione: 'Acme S.p.A.',
              codice_fiscale: 'ACMXYZ12A34B567C',
              indirizzo: 'Via Roma 1',
              cap: '20100',
              comune: 'Milano',
              provincia: 'mi',
              pec: 'acme@pec.it'
            }
          });
        }
      });
    });
    return CA.lookupPartitaIva('12345678901').then(function (res) {
      expect(res.ok).toBe(true);
      expect(res.data.nome).toBe('Acme S.p.A.');
      expect(res.data.cf).toBe('ACMXYZ12A34B567C');
      expect(res.data.indirizzo).toBe('Via Roma 1');
      expect(res.data.cap).toBe('20100');
      expect(res.data.citta).toBe('Milano');
      expect(res.data.provincia).toBe('MI');
      expect(res.data.pec).toBe('acme@pec.it');
      clearFetch();
    });
  });

  test('lookupPartitaIva con fetch 404 → NOT_FOUND', function () {
    setApiKey('dummy-key');
    setFetch(function () {
      return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });
    });
    return CA.lookupPartitaIva('12345678901').then(function (res) {
      expect(res.ok).toBe(false);
      expect(res.code).toBe('NOT_FOUND');
      clearFetch();
    });
  });

  test('lookupPartitaIva con fetch reject → NETWORK', function () {
    setApiKey('dummy-key');
    setFetch(function () { return Promise.reject(new Error('ECONNRESET')); });
    return CA.lookupPartitaIva('12345678901').then(function (res) {
      expect(res.ok).toBe(false);
      expect(res.code).toBe('NETWORK');
      clearFetch();
    });
  });
});
