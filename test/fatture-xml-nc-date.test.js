'use strict';
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
global.getProfileFiscalData = global.getProfileFiscalData || function () {
  return {
    nome: 'Mario', cognome: 'Rossi',
    codiceFiscale: 'RSSMRA80A01H501U',
    partitaIva: '12345678903',
    indirizzo: 'Via Roma 1', cap: '00100', citta: 'Roma', provincia: 'RM', nazione: 'IT',
    ateco: '620100', atecoDescrizione: 'Programmazione'
  };
};
global.getSettings = global.getSettings || function () { return { regime: 'forfettario' }; };
require('../fatture-docs-feature.js');
var build = global.buildFatturaElettronicaXml || (global.window && global.window.buildFatturaElettronicaXml);
if (!build) throw new Error('buildFatturaElettronicaXml not exposed');

function baseNCDraft(dataNC, orig) {
  return {
    numero: '2026/NC01', data: dataNC, tipoDocumento: 'TD04',
    fatturaOriginaleId: 'orig_1',
    _originalForValidation: orig,
    righe: [{ descrizione: 'Storno', quantita: 1, prezzoUnitario: -100 }],
    clienteSnapshot: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' },
    modalitaPagamento: 'bonifico'
  };
}

describe('R6 — TD04 data NC >= data originale', function () {
  test('NC con data anteriore originale → throw', function () {
    var threw = false;
    try {
      build(baseNCDraft('2026-03-01', { data: '2026-04-15', numero: '2026/005' }));
    } catch (e) {
      threw = /anteriore|precedente|nc|originale/i.test(String(e && e.message));
    }
    expect(threw).toBe(true);
  });

  test('NC con data successiva → OK', function () {
    var xml = build(baseNCDraft('2026-05-01', { data: '2026-04-15', numero: '2026/006' }));
    expect(typeof xml).toBe('string');
    expect(/TD04/.test(xml)).toBe(true);
  });

  test('TD01 (fattura, non NC) → nessuna validazione, sempre OK', function () {
    var xml = build({
      numero: '2026/007', data: '2026-01-01', tipoDocumento: 'TD01',
      righe: [{ descrizione: 'X', quantita: 1, prezzoUnitario: 100 }],
      clienteSnapshot: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' },
      modalitaPagamento: 'bonifico'
    });
    expect(typeof xml).toBe('string');
  });
});
