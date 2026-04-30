'use strict';
// DUP-6: todayIso deve essere TZ-safe (no slice(0,10) di toISOString UTC)
var storage = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function (k, v) { storage[k] = String(v); },
  removeItem: function (k) { delete storage[k]; }
};
global.sessionStorage = global.localStorage;
global.window = global;
global.document = { getElementById: function () { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
global.getProfileFiscalData = function () {
  return {
    nome: 'Mario', cognome: 'Rossi', codiceFiscale: 'RSSMRA80A01H501U',
    partitaIva: '12345678903', indirizzo: 'Via Roma 1', cap: '00100',
    citta: 'Roma', provincia: 'RM', nazione: 'IT'
  };
};
global.getSettings = function () { return { regime: 'forfettario' }; };
require('../fatture-docs-feature.js');

var todayIso = global.window.__todayIso;
if (!todayIso) throw new Error('__todayIso non esposta');

describe('DUP-6 — todayIso TZ-safe', function () {
  test('ritorna formato YYYY-MM-DD', function () {
    var iso = todayIso();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(iso)).toBe(true);
  });

  test('matcha la data LOCALE, non UTC', function () {
    var iso = todayIso();
    var local = new Date();
    var parts = iso.split('-').map(function (s) { return parseInt(s, 10); });
    expect(parts[0]).toBe(local.getFullYear());
    expect(parts[1]).toBe(local.getMonth() + 1);
    expect(parts[2]).toBe(local.getDate());
  });
});
