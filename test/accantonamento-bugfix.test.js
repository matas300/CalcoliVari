'use strict';
// Test isolato per verificare il fix di getFattureForAccantonamentoForYear
// (bug: duplicazione cross-year, stornate visibili, importo non scontato).
// Carica app-accantonamento.js in un sandbox minimale che mocka i globali.

var fs = require('fs');
var vm = require('vm');
var path = require('path');

// Stub FattureSelectors che usa il fixture sotto
function makeSelectors(fatture) {
  return {
    all: function () { return fatture; },
    getNettoEffettivo: function (f) {
      var imp = (f.righe || []).reduce(function (s, r) {
        return s + (Number(r.quantita) || 0) * (Number(r.prezzoUnitario) || 0);
      }, 0);
      var nc = Number(f.ncTotaleImporto) || 0;
      return imp - nc;
    }
  };
}

function runWithFixture(fatture, year) {
  var sandbox = {
    window: { FattureSelectors: makeSelectors(fatture) },
    currentProfile: 'Mattia',
    currentYear: year,
    data: {},
    MONTHS: ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
            'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
    MONTHS_SHORT: ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],
    getEffectiveTaxRateForYear: function () { return 0.2373; },
    loadYearData: function () { return null; },
    saveYearData: function () {},
    saveData: function () {},
    getYearDataFor: function () { return null; },
    ensureDataShape: function (x) { return x; },
    recalcAll: function () {},
    parseIsoDate: function (iso) {
      var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? { year: +m[1], month: +m[2], day: +m[3] } : null;
    },
    pad2: function (n) { return String(n).padStart(2, '0'); },
    daysInMonth: function (y, m) { return new Date(y, m, 0).getDate(); },
    getCrossYearInvoicesForYear: function () { return []; },
    getFattureFromYearData: function () { return []; },
    getStoredYears: function () { return []; },
    getAllStoredYears: function () { return []; },
    ceil2: function (n) { return Math.round(n * 100) / 100; },
    fmt: function (n) { return String(n); },
    fmtPct: function (n) { return (n * 100).toFixed(2) + '%'; },
    getEffectiveTaxRate: function () { return 0.2373; },
    document: { getElementById: function () { return null; }, addEventListener: function () {} },
    setTimeout: setTimeout,
    requestAnimationFrame: function (cb) { setTimeout(cb, 0); },
    console: console
  };
  sandbox.window.matchMedia = function () { return { matches: false }; };
  sandbox.window.scrollTo = function () {};

  vm.createContext(sandbox);
  var src = fs.readFileSync(path.join(__dirname, '..', 'app-accantonamento.js'), 'utf-8');
  vm.runInContext(src, sandbox);
  return sandbox.window.getFattureForAccantonamentoForYear(year);
}

// Fixture: scenario realistico con aggregazione per (mese, cliente).
// Cross-year da 2025 (Goldbridge), same-year 2026 con NC (Acme), bozze, stornate.
var GOLDBRIDGE = { id: 'cli-goldbridge', denominazione: 'Goldbridge Group LTD' };
var ACME = { id: 'cli-acme', denominazione: 'Acme S.r.l.' };
var BETA = { id: 'cli-beta', denominazione: 'Beta SpA' };

var fatture = [
  // CROSS-YEAR Goldbridge: 2 fatture Febbraio 2025 stesso cliente → AGGREGATE in UNA riga
  { id: 'f1', stato: 'pagata', tipoDocumento: 'TD01',
    data: '2025-02-01', issuedYear: 2025, issuedMonth: 2,
    pagAnno: 2026, pagMese: 3, numero: '2025/002',
    clienteId: 'cli-goldbridge', clienteSnapshot: GOLDBRIDGE,
    righe: [{ quantita: 1, prezzoUnitario: 6874.82, descrizione: 'PLM Consultant 2/2025' }]
  },
  { id: 'f2', stato: 'pagata', tipoDocumento: 'TD01',
    data: '2025-02-15', issuedYear: 2025, issuedMonth: 2,
    pagAnno: 2026, pagMese: 3, numero: '2025/003',
    clienteId: 'cli-goldbridge', clienteSnapshot: GOLDBRIDGE,
    righe: [{ quantita: 1, prezzoUnitario: 3833.62, descrizione: 'PLM Consultant 3/2025' }]
  },
  // CROSS-YEAR Goldbridge — NC TD04 di −3066.90 (parziale su f1)
  { id: 'nc1', stato: 'inviata', tipoDocumento: 'TD04',
    data: '2025-02-28', issuedYear: 2025, issuedMonth: 2,
    pagAnno: 2026, pagMese: 3, numero: '2025/NC1',
    clienteId: 'cli-goldbridge', clienteSnapshot: GOLDBRIDGE,
    fatturaOriginaleId: 'f1',
    righe: [{ quantita: 1, prezzoUnitario: 3066.90, descrizione: 'NC parziale' }]
  },
  // CROSS-YEAR Goldbridge gennaio 2025 — diverso mese → riga separata
  { id: 'f3', stato: 'pagata', tipoDocumento: 'TD01',
    data: '2025-01-10', issuedYear: 2025, issuedMonth: 1,
    pagAnno: 2026, pagMese: 1, numero: '2025/001',
    clienteId: 'cli-goldbridge', clienteSnapshot: GOLDBRIDGE,
    righe: [{ quantita: 1, prezzoUnitario: 5827.50, descrizione: 'PLM Consultant 1/2025' }]
  },
  // SAME-YEAR Acme aprile 2026 — fattura singola
  { id: 'f4', stato: 'pagata', tipoDocumento: 'TD01',
    data: '2026-04-10', issuedYear: 2026, issuedMonth: 4,
    pagAnno: 2026, pagMese: 4, numero: '2026/001',
    clienteId: 'cli-acme', clienteSnapshot: ACME,
    righe: [{ quantita: 1, prezzoUnitario: 1000, descrizione: 'Consulenza aprile' }]
  },
  // SAME-YEAR Beta maggio 2026 — fattura + NC superiore alla fattura → riga ESCLUSA (netto < 0)
  { id: 'f5', stato: 'pagata', tipoDocumento: 'TD01',
    data: '2026-05-01', issuedYear: 2026, issuedMonth: 5,
    pagAnno: 2026, pagMese: 5, numero: '2026/002',
    clienteId: 'cli-beta', clienteSnapshot: BETA,
    righe: [{ quantita: 1, prezzoUnitario: 500, descrizione: 'Beta servizio' }]
  },
  { id: 'nc2', stato: 'inviata', tipoDocumento: 'TD04',
    data: '2026-05-15', issuedYear: 2026, issuedMonth: 5,
    pagAnno: 2026, pagMese: 5, numero: '2026/NC2',
    clienteId: 'cli-beta', clienteSnapshot: BETA,
    fatturaOriginaleId: 'f5',
    righe: [{ quantita: 1, prezzoUnitario: 800, descrizione: 'NC eccesso Beta' }]
  },
  // STORNATA: NON deve apparire (filtrata da stato)
  { id: 'f6', stato: 'stornata', tipoDocumento: 'TD01',
    data: '2026-06-01', issuedYear: 2026, issuedMonth: 6,
    pagAnno: 2026, pagMese: 6, numero: '2026/003',
    clienteId: 'cli-acme', clienteSnapshot: ACME,
    ncTotaleImporto: 500,
    righe: [{ quantita: 1, prezzoUnitario: 500, descrizione: 'Storno totale Acme' }]
  },
  // BOZZA: NON deve apparire
  { id: 'f7', stato: 'bozza', tipoDocumento: 'TD01',
    data: '2026-07-01', issuedYear: 2026, issuedMonth: 7,
    pagAnno: 2026, pagMese: 7, numero: '2026/004',
    clienteId: 'cli-acme', clienteSnapshot: ACME,
    righe: [{ quantita: 1, prezzoUnitario: 999, descrizione: 'Bozza' }]
  }
];

describe('getFattureForAccantonamentoForYear — aggregazione per (mese, cliente)', function () {
  var items = runWithFixture(fatture, 2026);

  test('Numero righe: 3 (Gennaio 2025 Goldbridge, Febbraio 2025 Goldbridge, Aprile Acme — Beta esclusa per netto <= 0)', function () {
    expect(items.length).toBe(3);
  });

  test('Cross-year Febbraio 2025 Goldbridge: aggrega 2 fatture (6874.82 + 3833.62) − NC parziale (3066.90) = 7641.54', function () {
    var row = items.find(function (it) { return it.isCrossYear && it.mese === 2 && it.label.indexOf('Goldbridge') !== -1; });
    expect(row).toBeTruthy();
    expect(row.importo).toBe(7641.54);
  });

  test('Cross-year Gennaio 2025 Goldbridge: 1 sola fattura, netto = 5827.50', function () {
    var row = items.find(function (it) { return it.isCrossYear && it.mese === 1 && it.label.indexOf('Goldbridge') !== -1; });
    expect(row).toBeTruthy();
    expect(row.importo).toBe(5827.50);
  });

  test('Cross-year label formato: "Mese ANNO - ClientName"', function () {
    var row = items.find(function (it) { return it.isCrossYear && it.mese === 2; });
    expect(row.label).toBe('Febbraio 2025 - Goldbridge Group LTD');
  });

  test('Cross-year key formato: cross_YYYY_M_clientSlug', function () {
    var row = items.find(function (it) { return it.isCrossYear && it.mese === 2; });
    expect(row.key).toBe('cross_2025_2_cli-goldbridge');
  });

  test('Same-year Aprile Acme: 1 fattura, netto = 1000', function () {
    var row = items.find(function (it) { return !it.isCrossYear && it.mese === 4 && it.label.indexOf('Acme') !== -1; });
    expect(row).toBeTruthy();
    expect(row.importo).toBe(1000);
  });

  test('Same-year label formato: "Mese - ClientName" (no anno)', function () {
    var row = items.find(function (it) { return !it.isCrossYear && it.mese === 4; });
    expect(row.label).toBe('Aprile - Acme S.r.l.');
  });

  test('Same-year key formato: cur_M_clientSlug', function () {
    var row = items.find(function (it) { return !it.isCrossYear && it.mese === 4; });
    expect(row.key).toBe('cur_4_cli-acme');
  });

  test('Beta maggio: ESCLUSO perché NC (-800) > fattura (+500) → netto -300', function () {
    var row = items.find(function (it) { return it.label.indexOf('Beta') !== -1; });
    expect(row).toBeFalsy();
  });

  test('Stornata: assente', function () {
    var row = items.find(function (it) { return it.label.indexOf('Storno') !== -1; });
    expect(row).toBeFalsy();
  });

  test('Bozza: assente', function () {
    var row = items.find(function (it) { return it.label.indexOf('Bozza') !== -1; });
    expect(row).toBeFalsy();
  });

  test('Ordering: cross-year prima, poi same-year, ognuno per issuedMonth', function () {
    expect(items[0].isCrossYear).toBe(true);
    expect(items[0].mese).toBe(1);  // Gen 2025
    expect(items[1].isCrossYear).toBe(true);
    expect(items[1].mese).toBe(2);  // Feb 2025
    expect(items[2].isCrossYear).toBe(false);
    expect(items[2].mese).toBe(4);  // Apr 2026
  });
});
