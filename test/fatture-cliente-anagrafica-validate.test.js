'use strict';
// NR-2: cliente IT deve avere P.IVA o CF (FatturaPA v1.2 §1.4.1.2)
// validateDraftForInvio deve bloccare un draft prima che diventi "inviata",
// evitando che la build XML fallisca tardivamente.

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
if (!validate) throw new Error('__validateDraftForInvio not exposed');

function baseDraft(overrides) {
  var cli = Object.assign({
    nome: 'Cliente Test',
    nazione: 'IT',
    indirizzo: 'Via X', cap: '20100', citta: 'Milano', provincia: 'MI'
  }, overrides || {});
  return {
    tipoDocumento: 'TD01',
    numero: '2026/099', data: '2026-04-29',
    cliente: cli, clienteSnapshot: cli,
    clienteId: 'cli-test',
    righe: [{ descrizione: 'Servizio', quantita: 1, prezzoUnitario: 100 }],
    modalitaPagamento: 'bonifico',
    scadenzaPagamento: '2026-05-30'
  };
}

function hasNR2Error(errs) {
  return errs.some(function (e) {
    return /P\.?IVA/i.test(String(e)) && /CF|Codice Fiscale/i.test(String(e));
  });
}

describe('NR-2 — cliente IT deve avere P.IVA o CF (FatturaPA v1.2 §1.4.1.2)', function () {
  test('cliente IT senza P.IVA né CF → errore bloccante', function () {
    var d = baseDraft(); // niente partitaIva né codiceFiscale
    var errs = validate(d) || [];
    expect(hasNR2Error(errs)).toBe(true);
  });

  test('cliente IT con P.IVA valida → no errore NR-2', function () {
    var d = baseDraft({ partitaIva: '12345678903' });
    var errs = validate(d) || [];
    expect(hasNR2Error(errs)).toBe(false);
  });

  test('cliente IT con solo CF valido → no errore NR-2', function () {
    var d = baseDraft({ codiceFiscale: 'RSSMRA80A01H501U' });
    var errs = validate(d) || [];
    expect(hasNR2Error(errs)).toBe(false);
  });

  test('cliente Estero (DE) senza P.IVA → no errore NR-2 (estero validato altrove)', function () {
    var d = baseDraft({ nazione: 'DE' });
    var errs = validate(d) || [];
    expect(hasNR2Error(errs)).toBe(false);
  });
});
