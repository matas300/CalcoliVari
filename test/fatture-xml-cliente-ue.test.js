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
    iban: 'IT60X0542811101000000123456'
  };
};
global.getSettings = global.getSettings || function () { return { regime: 'forfettario', cf: 'RSSMRA80A01H501U' }; };
require('../fatture-docs-feature.js');
var build = global.buildFatturaElettronicaXml || (global.window && global.window.buildFatturaElettronicaXml);
if (!build) throw new Error('buildFatturaElettronicaXml not exposed');

describe('NR-3 — cliente UE: strip prefisso paese da IdCodice (FatturaPA v1.2 §2.1.2.6)', function () {
  function baseDraft() {
    return {
      tipoDocumento: 'TD01',
      numero: '2026/003', annoProgressivo: 2026, progressivo: 3,
      data: '2026-04-29',
      cliente: {
        nome: 'Acme GmbH',
        partitaIva: 'DE123456789',
        indirizzo: 'Berliner Str. 1', cap: '10115', citta: 'Berlin', provincia: 'BE', nazione: 'DE'
      },
      clienteSnapshot: {
        nome: 'Acme GmbH',
        partitaIva: 'DE123456789',
        indirizzo: 'Berliner Str. 1', cap: '10115', citta: 'Berlin', provincia: 'BE', nazione: 'DE'
      },
      righe: [{ descrizione: 'Consulenza', quantita: 1, prezzoUnitario: 1000 }]
    };
  }

  test('VAT con prefisso paese DE → IdCodice senza prefisso', function () {
    var xml = build(baseDraft(), {});
    expect(/<IdPaese>DE<\/IdPaese>/.test(xml)).toBe(true);
    expect(/<IdCodice>123456789<\/IdCodice>/.test(xml)).toBe(true);
    expect(/<IdCodice>DE123456789<\/IdCodice>/.test(xml)).toBe(false);
  });

  test('VAT con prefisso lowercase (de123456789) → strip case-insensitive', function () {
    var d = baseDraft();
    d.cliente.partitaIva = 'de123456789';
    d.clienteSnapshot.partitaIva = 'de123456789';
    var xml = build(d, {});
    expect(/<IdCodice>123456789<\/IdCodice>/.test(xml)).toBe(true);
  });

  test('VAT senza prefisso (utente già pulito) → IdCodice invariato', function () {
    var d = baseDraft();
    d.cliente.partitaIva = '123456789';
    d.clienteSnapshot.partitaIva = '123456789';
    var xml = build(d, {});
    expect(/<IdCodice>123456789<\/IdCodice>/.test(xml)).toBe(true);
  });

  test('Cliente IT (P.IVA senza prefisso) → IdCodice invariato (no strip su IT)', function () {
    var d = baseDraft();
    d.cliente.nazione = 'IT';
    d.cliente.partitaIva = '12345678903';
    d.clienteSnapshot.nazione = 'IT';
    d.clienteSnapshot.partitaIva = '12345678903';
    var xml = build(d, {});
    expect(/<IdCodice>12345678903<\/IdCodice>/.test(xml)).toBe(true);
  });
});
