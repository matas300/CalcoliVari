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

function posOf(xml, tag) { return xml.indexOf('<' + tag); }

function baseDraft(extra) {
  var d = {
    numero: '2026/010', data: '2026-04-01', tipoDocumento: 'TD01',
    righe: [{ descrizione: 'X', quantita: 1, prezzoUnitario: 200 }],
    cliente: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' },
    clienteSnapshot: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' },
    modalitaPagamento: 'bonifico'
  };
  if (extra) for (var k in extra) d[k] = extra[k];
  return d;
}

describe('DatiGeneraliDocumento — XSD element order', function () {
  test('Numero precede DatiBollo precede ImportoTotaleDocumento precede Causale', function () {
    var xml = build(baseDraft({ marcaDaBollo: true, note: 'Test causale' }));
    expect(posOf(xml, 'Numero') < posOf(xml, 'DatiBollo')).toBe(true);
    expect(posOf(xml, 'DatiBollo') < posOf(xml, 'ImportoTotaleDocumento')).toBe(true);
    expect(posOf(xml, 'ImportoTotaleDocumento') < posOf(xml, 'Causale')).toBe(true);
  });

  test('con ritenuta: DatiRitenuta precede DatiBollo precede Importo', function () {
    var xml = build(baseDraft({
      marcaDaBollo: true,
      ritenuta: 40, aliquotaRitenuta: 20, tipoRitenuta: 'RT01', causaleRitenuta: 'A'
    }));
    expect(posOf(xml, 'DatiRitenuta') > 0).toBe(true);
    expect(posOf(xml, 'DatiRitenuta') < posOf(xml, 'DatiBollo')).toBe(true);
    expect(posOf(xml, 'DatiBollo') < posOf(xml, 'ImportoTotaleDocumento')).toBe(true);
  });

  test('senza ritenuta né bollo: ImportoTotaleDocumento subito dopo Numero', function () {
    var xml = build(baseDraft());
    expect(/<Numero>[^<]+<\/Numero>\s*<ImportoTotaleDocumento>/.test(xml)).toBe(true);
  });
});
