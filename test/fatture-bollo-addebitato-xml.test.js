'use strict';
// A-A7: bollo addebitato → riga separata "Rimborso imposta di bollo" in XML
// Risoluzione AdE 444/E del 18/11/2008: il bollo addebitato al cliente è un
// rimborso (fuori campo IVA art. 15 DPR 633/72) e deve apparire come voce in
// fattura, non solo aggiunto al totale documento.

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

var build = global.buildFatturaElettronicaXml || (global.window && global.window.buildFatturaElettronicaXml);
if (!build) throw new Error('buildFatturaElettronicaXml not exposed');

function baseCliente() {
  return {
    nome: 'Cliente Test', partitaIva: '98765432103',
    indirizzo: 'Via X 1', cap: '20100', citta: 'Milano', provincia: 'MI', nazione: 'IT'
  };
}

function baseDraft(extra) {
  var cli = baseCliente();
  var d = {
    tipoDocumento: 'TD01',
    annoProgressivo: 2026, progressivo: 1,
    numero: '2026/001', data: '2026-04-29',
    cliente: cli, clienteSnapshot: cli,
    righe: [{ descrizione: 'Consulenza', quantita: 1, prezzoUnitario: 100 }],
    modalitaPagamento: 'bonifico',
    marcaDaBollo: true,
    bolloAddebitato: true
  };
  if (extra) for (var k in extra) d[k] = extra[k];
  return d;
}

describe('A-A7 — riga rimborso bollo in XML (Ris. AdE 444/E 2008)', function () {
  test('emette DettaglioLinee Rimborso imposta di bollo Natura N1 quando bollo addebitato', function () {
    var xml = build(baseDraft(), {});
    expect(/<Descrizione>Rimborso imposta di bollo<\/Descrizione>/.test(xml)).toBe(true);
    expect(/<PrezzoUnitario>2\.00<\/PrezzoUnitario>/.test(xml)).toBe(true);
    expect(/<Natura>N1<\/Natura>/.test(xml)).toBe(true);
  });

  test('NumeroLinea della riga bollo è ultima+1', function () {
    var d = baseDraft({
      righe: [
        { descrizione: 'A', quantita: 1, prezzoUnitario: 50 },
        { descrizione: 'B', quantita: 1, prezzoUnitario: 60 }
      ]
    });
    var xml = build(d, {});
    // l'ultima riga prima del bollo è 2; la riga bollo deve avere NumeroLinea 3
    expect(/<NumeroLinea>3<\/NumeroLinea>[\s\S]*<Descrizione>Rimborso imposta di bollo<\/Descrizione>/.test(xml)).toBe(true);
  });

  test('emette un secondo DatiRiepilogo per Natura N1 con imponibile 2.00', function () {
    var xml = build(baseDraft(), {});
    // deve esserci un DatiRiepilogo che contenga Natura N1 e ImponibileImporto 2.00
    var hasN1Riepilogo = /<DatiRiepilogo>[\s\S]*?<Natura>N1<\/Natura>[\s\S]*?<ImponibileImporto>2\.00<\/ImponibileImporto>[\s\S]*?<\/DatiRiepilogo>/.test(xml);
    expect(hasN1Riepilogo).toBe(true);
  });

  test('NON emette riga rimborso se bolloAddebitato=false', function () {
    var xml = build(baseDraft({ bolloAddebitato: false }), {});
    expect(/Rimborso imposta di bollo/.test(xml)).toBe(false);
  });

  test('NON emette riga rimborso se marcaDaBollo=false', function () {
    var xml = build(baseDraft({ marcaDaBollo: false, bolloAddebitato: false }), {});
    expect(/Rimborso imposta di bollo/.test(xml)).toBe(false);
  });

  test('NON emette riga rimborso su TD04 (NC)', function () {
    var d = baseDraft({ tipoDocumento: 'TD04' });
    var xml = build(d, { isNC: true });
    expect(/Rimborso imposta di bollo/.test(xml)).toBe(false);
  });

  test('ImportoTotaleDocumento include il bollo (102.00 con riga 100 + bollo addebitato)', function () {
    var xml = build(baseDraft(), {});
    expect(/<ImportoTotaleDocumento>102\.00<\/ImportoTotaleDocumento>/.test(xml)).toBe(true);
  });
});
