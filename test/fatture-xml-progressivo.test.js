'use strict';
var storage = {};
global.localStorage = global.localStorage || {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem: function (k, v) { storage[k] = String(v); },
  removeItem: function (k) { delete storage[k]; }
};
global.window = global.window || global;
global.document = global.document || { getElementById: function () { return null; } };
global.currentProfile = 'TestProfile';
global.currentYear = 2026;
global.getProfileFiscalData = global.getProfileFiscalData || function () {
  return {
    nome: 'Mario', cognome: 'Rossi',
    codiceFiscale: 'RSSMRA80A01H501U',
    partitaIva: '12345678903',
    indirizzo: 'Via Roma 1', cap: '00100', citta: 'Roma', provincia: 'RM', nazione: 'IT',
    ateco: '620100', atecoDescrizione: 'Programmazione',
    iban: 'IT60X0542811101000000123456'
  };
};
global.getSettings = global.getSettings || function () { return { regime: 'forfettario' }; };
require('../fatture-docs-feature.js');

var validate = global.window.__validateDraftForInvio;
if (!validate) throw new Error('__validateDraftForInvio not exposed');

function base(numero) {
  return {
    numero: numero,
    data: '2026-04-01',
    tipoDocumento: 'TD01',
    righe: [{ descrizione: 'X', quantita: 1, prezzoUnitario: 100 }],
    clienteId: 'c1',
    clienteSnapshot: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' },
    modalitaPagamento: 'bonifico',
    scadenzaPagamento: '2026-05-01'
  };
}

describe('R5 — ProgressivoInvio max 10 alfanumerici (FatturaPA §1.1.2)', function () {
  test('numero che sanitized sta nel limite → no errore progressivo', function () {
    var errs = validate(base('2026/0001')) || [];
    var hasErr = errs.some(function (e) { return /progressivo|10\s*(char|alfanum)/i.test(String(e)); });
    expect(hasErr).toBe(false);
  });

  test('numero troppo lungo dopo sanitize → errore bloccante', function () {
    var errs = validate(base('FATT/2026/1234')) || [];
    var hasErr = errs.some(function (e) { return /progressivo|10\s*(char|alfanum)/i.test(String(e)); });
    expect(hasErr).toBe(true);
  });
});
