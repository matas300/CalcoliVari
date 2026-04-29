'use strict';
// C-A2: ritenuta d'acconto bloccata su regime forfettario (art. 1 c. 67 L. 190/2014)
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
// Default a forfettario; singoli test riassegnano se serve
var _regime = 'forfettario';
global.getSettings = function () { return { regime: _regime, giorniIncasso: 30 }; };
require('../fatture-docs-feature.js');

var validate = global.__validateDraftForInvio || (global.window && global.window.__validateDraftForInvio);
if (!validate) throw new Error('__validateDraftForInvio not exposed');

function baseDraft(extra) {
  var d = {
    tipoDocumento: 'TD01',
    numero: '2026/001',
    data: '2026-04-29',
    clienteSnapshot: { nome: 'Acme', partitaIva: '12345678903', nazione: 'IT' },
    righe: [{ descrizione: 'Consulenza', quantita: 1, prezzoUnitario: 1000 }],
    modalitaPagamento: 'bonifico',
    scadenzaPagamento: '2026-05-29',
    iban: 'IT60X0542811101000000123456'
  };
  if (extra) Object.keys(extra).forEach(function (k) { d[k] = extra[k]; });
  return d;
}

describe('C-A2 — ritenuta forfettario bloccata in validateDraftForInvio', function () {
  test('regime=forfettario + ritenuta>0 → errore bloccante', function () {
    _regime = 'forfettario';
    var errs = validate(baseDraft({
      ritenuta: 200, aliquotaRitenuta: 20, tipoRitenuta: 'RT02', causaleRitenuta: 'A'
    }));
    var hit = errs.some(function (e) { return /forfettario/i.test(e) && /ritenuta/i.test(e); });
    expect(hit).toBe(true);
  });

  test('regime=forfettario + ritenuta=0 → nessun errore di ritenuta', function () {
    _regime = 'forfettario';
    var errs = validate(baseDraft({ ritenuta: 0 }));
    var hit = errs.some(function (e) { return /ritenuta/i.test(e); });
    expect(hit).toBe(false);
  });

  test('regime=ordinario + ritenuta>0 → nessun errore di ritenuta', function () {
    _regime = 'ordinario';
    var errs = validate(baseDraft({
      ritenuta: 200, aliquotaRitenuta: 20, tipoRitenuta: 'RT02', causaleRitenuta: 'A'
    }));
    var hit = errs.some(function (e) { return /ritenuta/i.test(e); });
    expect(hit).toBe(false);
  });
});

describe('C-A2 bypass — validateFatturaForXml deve bloccare ritenuta su forfettario', function () {
  test('regime=forfettario + ritenuta>0 → errore C-A2 in validateFatturaForXml', function () {
    var validateXml = global.window.__validateFatturaForXml;
    if (!validateXml) throw new Error('__validateFatturaForXml non esposta');
    _regime = 'forfettario';
    var draft = {
      tipoDocumento: 'TD01',
      numero: '2026/001', data: '2026-04-29',
      clienteSnapshot: {
        nome: 'X', partitaIva: '12345678903',
        indirizzo: 'Via X 1', cap: '20100', citta: 'Milano', provincia: 'MI', nazione: 'IT'
      },
      righe: [{ descrizione: 'X', quantita: 1, prezzoUnitario: 100 }],
      ritenuta: 20, aliquotaRitenuta: 20
    };
    var res = validateXml(draft);
    var hit = (res.errors || []).some(function (e) {
      return /forfettario/i.test(String(e)) && /ritenuta/i.test(String(e));
    });
    if (!hit) throw new Error('C-A2 bypass FAIL: validateFatturaForXml non blocca ritenuta forfettario. Errors: ' + JSON.stringify(res.errors));
    expect(hit).toBe(true);
  });

  test('regime=ordinario + ritenuta>0 → no errore C-A2 in validateFatturaForXml', function () {
    var validateXml = global.window.__validateFatturaForXml;
    _regime = 'ordinario';
    var draft = {
      tipoDocumento: 'TD01',
      numero: '2026/002', data: '2026-04-29',
      clienteSnapshot: {
        nome: 'Y', partitaIva: '98765432109',
        indirizzo: 'Via Y 2', cap: '20121', citta: 'Milano', provincia: 'MI', nazione: 'IT'
      },
      righe: [{ descrizione: 'Y', quantita: 1, prezzoUnitario: 1000 }],
      ritenuta: 200, aliquotaRitenuta: 20
    };
    var res = validateXml(draft);
    var hit = (res.errors || []).some(function (e) { return /forfettario.*ritenuta/i.test(String(e)); });
    if (hit) throw new Error('C-A2 bypass FAIL: errore C-A2 indotto su ordinario. Errors: ' + JSON.stringify(res.errors));
    expect(hit).toBe(false);
  });
});
