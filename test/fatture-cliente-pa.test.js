'use strict';
// A-A6: cliente PA → CodiceIPA 6 caratteri (D.M. 55/2013 art. 2)
// Senza, SdI rifiuta con errore EC02. Il campo SDI standard è 7 char per privati,
// 6 char alfanumerici per PA (Indice IPA).

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
    iban: 'IT60X0542811101000000123456'
  };
};
global.getSettings = global.getSettings || function () { return { regime: 'forfettario' }; };
require('../fatture-docs-feature.js');

var validate = global.window.__validateDraftForInvio || global.__validateDraftForInvio;
var build = global.window.buildFatturaElettronicaXml || global.buildFatturaElettronicaXml;
if (!validate) throw new Error('__validateDraftForInvio not exposed');
if (!build) throw new Error('buildFatturaElettronicaXml not exposed');

function baseDraft() {
  var cli = {
    nome: 'Comune di Milano',
    tipoCliente: 'PA',
    codiceSDI: 'UFY9MH',
    partitaIva: '01199250158',
    indirizzo: 'Via Marconi', cap: '20100', citta: 'Milano', provincia: 'MI', nazione: 'IT'
  };
  return {
    tipoDocumento: 'TD01',
    annoProgressivo: 2026, progressivo: 2,
    numero: '2026/002', data: '2026-04-29',
    cliente: cli, clienteSnapshot: cli,
    clienteId: 'cli-pa-1',
    righe: [{ descrizione: 'Consulenza', quantita: 1, prezzoUnitario: 1000 }],
    modalitaPagamento: 'bonifico',
    scadenzaPagamento: '2026-05-30'
  };
}

describe('A-A6 — cliente PA con CodiceIPA 6 char (D.M. 55/2013)', function () {
  test('PA con IPA 6 char alfanumerici → no errore IPA, XML emette il codice', function () {
    var d = baseDraft();
    var errs = validate(d) || [];
    var ipaError = errs.some(function (e) { return /IPA|D\.M\.\s*55/i.test(String(e)); });
    expect(ipaError).toBe(false);
    var xml = build(d, {});
    expect(/<CodiceDestinatario>UFY9MH<\/CodiceDestinatario>/.test(xml)).toBe(true);
  });

  test('PA con codice 7 char → errore bloccante', function () {
    var d = baseDraft();
    d.cliente.codiceSDI = '0000000';
    d.clienteSnapshot.codiceSDI = '0000000';
    var errs = validate(d) || [];
    var ipaError = errs.some(function (e) { return /IPA.*6|6.*IPA|D\.M\.\s*55/i.test(String(e)); });
    expect(ipaError).toBe(true);
  });

  test('PA con codice contenente caratteri non alfanumerici → errore', function () {
    var d = baseDraft();
    d.cliente.codiceSDI = 'UF-Y9M';
    d.clienteSnapshot.codiceSDI = 'UF-Y9M';
    var errs = validate(d) || [];
    var ipaError = errs.some(function (e) { return /IPA/i.test(String(e)); });
    expect(ipaError).toBe(true);
  });

  test('Cliente PG (default) con codice SDI 7 char → no errore IPA (backward compat)', function () {
    var d = baseDraft();
    d.cliente.tipoCliente = 'PG';
    d.cliente.codiceSDI = '0000000';
    d.clienteSnapshot.tipoCliente = 'PG';
    d.clienteSnapshot.codiceSDI = '0000000';
    var errs = validate(d) || [];
    var ipaError = errs.some(function (e) { return /IPA/i.test(String(e)); });
    expect(ipaError).toBe(false);
  });
});
