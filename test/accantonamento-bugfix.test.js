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

// Fixture: replica lo scenario degli screenshot di Mattia (anno 2026 con cross-year da 2025)
var fatture = [
  // F1 — Gennaio 2025, incassata in 2026 (CROSS-YEAR da 2025 verso 2026)
  {
    id: 'f1', stato: 'pagata', tipoDocumento: 'TD01',
    data: '2025-01-15', issuedYear: 2025, issuedMonth: 1,
    pagAnno: 2026, pagMese: 1,
    numero: '2025/001',
    righe: [{ quantita: 1, prezzoUnitario: 5827.50, descrizione: 'PLM Consultant - Daily Rate - Order n. 6801000087' }]
  },
  // F2 — Febbraio 2025, incassata in 2026 (CROSS-YEAR)
  {
    id: 'f2', stato: 'pagata', tipoDocumento: 'TD01',
    data: '2025-02-15', issuedYear: 2025, issuedMonth: 2,
    pagAnno: 2026, pagMese: 2,
    numero: '2025/002',
    righe: [{ quantita: 1, prezzoUnitario: 4882.50, descrizione: 'PLM Consultant - Daily Rate - Order n. 6801000087' }]
  },
  // F3 — Marzo 2026, incassata in 2026 (SAME-YEAR, deve apparire 1 volta)
  {
    id: 'f3', stato: 'pagata', tipoDocumento: 'TD01',
    data: '2026-03-10', issuedYear: 2026, issuedMonth: 3,
    pagAnno: 2026, pagMese: 3,
    numero: '2026/003',
    righe: [{ quantita: 1, prezzoUnitario: 1000, descrizione: 'Consulenza marzo' }]
  },
  // F4 — Aprile 2026 STORNATA da NC totale (NON deve apparire)
  {
    id: 'f4', stato: 'stornata', tipoDocumento: 'TD01',
    data: '2026-04-01', issuedYear: 2026, issuedMonth: 4,
    pagAnno: 2026, pagMese: 4,
    numero: '2026/004',
    ncTotaleImporto: 500,
    righe: [{ quantita: 1, prezzoUnitario: 500, descrizione: 'Storno totale' }]
  },
  // F5 — NC TD04 (NON deve apparire come riga separata)
  {
    id: 'f5', stato: 'inviata', tipoDocumento: 'TD04',
    data: '2026-04-02', issuedYear: 2026, issuedMonth: 4,
    pagAnno: 2026, pagMese: 4,
    numero: '2026/NC1', fatturaOriginaleId: 'f4',
    righe: [{ quantita: 1, prezzoUnitario: 500, descrizione: 'NC su 2026/004' }]
  },
  // F6 — Maggio 2026 con NC parziale (deve apparire con netto = importo - ncTotaleImporto)
  {
    id: 'f6', stato: 'pagata', tipoDocumento: 'TD01',
    data: '2026-05-01', issuedYear: 2026, issuedMonth: 5,
    pagAnno: 2026, pagMese: 5,
    numero: '2026/005',
    ncTotaleImporto: 200,  // NC parziale 200 su 1000 → netto 800
    righe: [{ quantita: 1, prezzoUnitario: 1000, descrizione: 'Consulenza maggio' }]
  },
  // F7 — Bozza (NON deve apparire)
  {
    id: 'f7', stato: 'bozza', tipoDocumento: 'TD01',
    data: '2026-06-01', issuedYear: 2026, issuedMonth: 6,
    pagAnno: 2026, pagMese: 6,
    numero: '2026/006',
    righe: [{ quantita: 1, prezzoUnitario: 999, descrizione: 'Bozza' }]
  }
];

describe('getFattureForAccantonamentoForYear — bugfix accantonamento', function () {
  var items = runWithFixture(fatture, 2026);

  test('Conta righe corretto: 2 cross-year + 2 same-year valide = 4 (no F4/F5/F7)', function () {
    expect(items.length).toBe(4);
  });

  test('Cross-year: F1 e F2 appaiono UNA SOLA volta (no duplicati)', function () {
    var f1Rows = items.filter(function (it) { return it.label.indexOf('Gennaio 2025') === 0 && it.isCrossYear; });
    var f2Rows = items.filter(function (it) { return it.label.indexOf('Febbraio 2025') === 0 && it.isCrossYear; });
    expect(f1Rows.length).toBe(1);
    expect(f2Rows.length).toBe(1);
  });

  test('Cross-year: NESSUNA versione "Gennaio - PLM" senza anno (la duplicazione è eliminata)', function () {
    var dupRows = items.filter(function (it) {
      return !it.isCrossYear && it.label.indexOf('PLM') !== -1;
    });
    expect(dupRows.length).toBe(0);
  });

  test('Stornata F4: assente dalla tabella', function () {
    var stornate = items.filter(function (it) { return it.label.indexOf('Storno totale') !== -1; });
    expect(stornate.length).toBe(0);
  });

  test('NC TD04 F5: assente come riga propria', function () {
    var ncRows = items.filter(function (it) { return it.label.indexOf('NC su') !== -1; });
    expect(ncRows.length).toBe(0);
  });

  test('Bozza F7: assente', function () {
    var bozze = items.filter(function (it) { return it.label.indexOf('Bozza') !== -1; });
    expect(bozze.length).toBe(0);
  });

  test('NC parziale F6: importo è il NETTO EFFETTIVO (1000 - 200 = 800), non 1000', function () {
    var f6 = items.find(function (it) { return it.label.indexOf('Consulenza maggio') !== -1; });
    expect(f6.importo).toBe(800);
  });

  test('Same-year F3: importo pieno (no NC)', function () {
    var f3 = items.find(function (it) { return it.label.indexOf('Consulenza marzo') !== -1; });
    expect(f3.importo).toBe(1000);
  });

  test('Cross-year label formato: "Mese Anno - desc" usa issuedMonth+issuedYear', function () {
    var f1 = items.find(function (it) { return it.isCrossYear && it.label.indexOf('PLM') !== -1 && it.mese === 1; });
    expect(f1.label.indexOf('Gennaio 2025')).toBe(0);
    expect(f1.anno).toBe(2025);
  });

  test('Cross-year key: usa issuedMonth (non pagMese) per il numero mese', function () {
    var f2 = items.find(function (it) { return it.isCrossYear && it.mese === 2; });
    expect(f2.key.indexOf('cross_2025_2_')).toBe(0);
  });

  test('Same-year key: usa pagMese (compat saved keys)', function () {
    var f3 = items.find(function (it) { return !it.isCrossYear && it.label.indexOf('Consulenza marzo') !== -1; });
    expect(f3.key.indexOf('cur_3_')).toBe(0);
  });
});
