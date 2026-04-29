'use strict';
// C-A2 cleanup: _clearRitenutaForForfettario azzera i campi ritenuta quando si passa a forfettario
var storage = {};
global.localStorage = global.localStorage || {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || { getElementById: function() { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
global.getProfileFiscalData = function () {
  return {
    nome: 'Mario', cognome: 'Rossi',
    codiceFiscale: 'RSSMRA80A01H501U',
    partitaIva: '12345678903',
    indirizzo: 'Via Roma 1', cap: '00100', citta: 'Roma', provincia: 'RM', nazione: 'IT',
    ateco: '620100', atecoDescrizione: 'Programmazione',
    iban: 'IT60X0542811101000000123456'
  };
};
var _regime = 'forfettario';
global.getSettings = function () { return { regime: _regime, giorniIncasso: 30 }; };
require('../fatture-docs-feature.js');

var clearFn = global._clearRitenutaForForfettario || (global.window && global.window._clearRitenutaForForfettario);
if (!clearFn) throw new Error('_clearRitenutaForForfettario not exposed');

describe('C-A2 cleanup — _clearRitenutaForForfettario', function () {
  test('azzera ritenuta e aliquota su draft con valori > 0', function () {
    var draft = { ritenuta: 200, aliquotaRitenuta: 20, tipoRitenuta: 'RT02', causaleRitenuta: 'A' };
    clearFn(draft);
    expect(draft.ritenuta).toBe(0);
    expect(draft.aliquotaRitenuta).toBe(0);
    expect(draft.tipoRitenuta).toBe('');
    expect(draft.causaleRitenuta).toBe('');
  });

  test('non tocca altri campi del draft', function () {
    var draft = { ritenuta: 100, aliquotaRitenuta: 10, iban: 'IT60X123', importo: 500 };
    clearFn(draft);
    expect(draft.iban).toBe('IT60X123');
    expect(draft.importo).toBe(500);
  });

  test('draft già a zero rimane a zero (idempotente)', function () {
    var draft = { ritenuta: 0, aliquotaRitenuta: 0 };
    clearFn(draft);
    expect(draft.ritenuta).toBe(0);
    expect(draft.aliquotaRitenuta).toBe(0);
  });

  test('tipoRitenuta e causaleRitenuta non toccati se già assenti', function () {
    var draft = { ritenuta: 50, aliquotaRitenuta: 5 };
    clearFn(draft);
    // should not crash, and falsy fields stay falsy/undefined
    expect(draft.tipoRitenuta == null || draft.tipoRitenuta === '').toBe(true);
    expect(draft.causaleRitenuta == null || draft.causaleRitenuta === '').toBe(true);
  });
});
