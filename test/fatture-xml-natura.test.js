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
global.getProfileFiscalData = function () {
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

function baseDraft(cliente) {
  return {
    numero: '2026/001', data: '2026-04-01', tipoDocumento: 'TD01',
    righe: [{ descrizione: 'X', quantita: 1, prezzoUnitario: 100 }],
    cliente: cliente, clienteSnapshot: cliente, modalitaPagamento: 'bonifico'
  };
}

describe('XML Natura — forfettario RF19', function () {
  test('cliente IT → N2.2', function () {
    var xml = build(baseDraft({ nome: 'Acme Srl', partitaIva: '12345678903', nazione: 'IT' }));
    expect(/<Natura>N2\.2<\/Natura>/.test(xml)).toBe(true);
    expect(/<Natura>N2\.1<\/Natura>/.test(xml)).toBe(false);
  });

  test('cliente estero → N2.2 (non N2.1)', function () {
    var xml = build(baseDraft({ denominazione: 'Foreign GmbH', nazione: 'DE', partitaIva: 'DE123456789' }));
    expect(/<Natura>N2\.2<\/Natura>/.test(xml)).toBe(true);
    expect(/<Natura>N2\.1<\/Natura>/.test(xml)).toBe(false);
  });
});
