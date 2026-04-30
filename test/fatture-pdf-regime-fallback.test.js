'use strict';
// NR-10 — fallback regime per PDF fattura (art. 6 c. 1 D.Lgs. 471/1997)
// Forza un localStorage controllato anche se altri test ne hanno installato uno prima
var storage = {};
global.localStorage = {
  getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function(k, v) { storage[k] = String(v); },
  removeItem: function(k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || { getElementById: function() { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
global.window.currentProfile = 'TestProfile';
global.window.currentYear = 2026;
global.getProfileFiscalData = function () {
  return {
    nome: 'Mario', cognome: 'Rossi',
    codiceFiscale: 'RSSMRA80A01H501U',
    partitaIva: '12345678903',
    indirizzo: 'Via Roma 1', cap: '00100', citta: 'Roma', provincia: 'RM', nazione: 'IT'
  };
};
// IMPORTANTE: getSettings LANCIA (storage corrotto) per testare il fallback
global.getSettings = function () { throw new Error('storage corrupt'); };

require('../fatture-docs-feature.js');

var resolve = global.window.__resolveRegimeForPdf;
if (!resolve) throw new Error('__resolveRegimeForPdf non esposta');

function expectThrows(fn, pattern) {
  var threw = false, err = null;
  try { fn(); } catch (e) { threw = true; err = e; }
  if (!threw) throw new Error('Expected function to throw, but it did not');
  if (pattern && !pattern.test(err.message || String(err))) {
    throw new Error('Expected error message to match ' + pattern + ' but got: ' + (err.message || err));
  }
}

describe('NR-10 — fallback regime per PDF fattura', function () {
  test('getSettings lancia, fallback localStorage trova forfettario', function () {
    storage['calcoliPIVA_TestProfile_2026'] = JSON.stringify({
      settings: { regime: 'forfettario', cf: 'RSSMRA80A01H501U' }
    });
    expect(resolve()).toBe('forfettario');
  });

  test('getSettings lancia, fallback localStorage trova ordinario', function () {
    storage['calcoliPIVA_TestProfile_2026'] = JSON.stringify({
      settings: { regime: 'ordinario' }
    });
    expect(resolve()).toBe('ordinario');
  });

  test('né getSettings né localStorage hanno il regime → throw esplicito', function () {
    storage['calcoliPIVA_TestProfile_2026'] = JSON.stringify({ settings: {} });
    expectThrows(function () { resolve(); }, /NR-10|regime/i);
  });

  test('storage assente → throw esplicito', function () {
    delete storage['calcoliPIVA_TestProfile_2026'];
    expectThrows(function () { resolve(); }, /NR-10|regime/i);
  });
});
