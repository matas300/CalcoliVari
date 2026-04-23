'use strict';

// Stub globals BEFORE requiring the IIFE module
if (!global.window) global.window = global;
require('../fatture-nc-sync.js');
var NC = global.window.FattureNCSync;

// ─── applyNCToOriginal — casi base ───────────────────────────────────────────

describe('FattureNCSync.applyNCToOriginal — guardie', function () {
  test('nc null → ritorna null', function () {
    expect(NC.applyNCToOriginal(null, [])).toBe(null);
  });

  test('tipoDocumento != TD04 → ritorna null', function () {
    var nc = { id: 'x', tipoDocumento: 'TD01', fatturaOriginaleId: 'orig' };
    expect(NC.applyNCToOriginal(nc, [{ id: 'orig' }])).toBe(null);
  });

  test('fatturaOriginaleId mancante → ritorna null', function () {
    var nc = { id: 'x', tipoDocumento: 'TD04' };
    expect(NC.applyNCToOriginal(nc, [])).toBe(null);
  });

  test('originale non trovata → ritorna null', function () {
    var nc = { id: 'x', tipoDocumento: 'TD04', fatturaOriginaleId: 'ghost' };
    expect(NC.applyNCToOriginal(nc, [{ id: 'other' }])).toBe(null);
  });
});

// ─── applyNCToOriginal — storno totale (F1 + F2 + F3) ─────────────────────────

describe('FattureNCSync — storno totale', function () {
  test('NC totale → incrementa ncTotaleImporto, setta stornata, tipoStorno=totale', function () {
    var orig = {
      id: 'orig1', tipoDocumento: 'TD01', stato: 'inviata',
      righe: [{ quantita: 1, prezzoUnitario: 500 }],
      ncIds: [], ncTotaleImporto: 0
    };
    var nc = {
      id: 'nc1', tipoDocumento: 'TD04', stato: 'inviata',
      fatturaOriginaleId: 'orig1',
      righe: [{ quantita: 1, prezzoUnitario: 500 }]
    };
    var fatture = [orig, nc];

    var res = NC.applyNCToOriginal(nc, fatture);
    expect(res.applied).toBe(true);
    expect(orig.ncTotaleImporto).toBe(500);
    expect(orig.stato).toBe('stornata');
    expect(orig.ncIds.length).toBe(1);
    expect(orig.ncIds[0]).toBe('nc1');
    expect(nc.tipoStorno).toBe('totale');
  });

  test('originale già pagata → storno totale passa comunque a stornata', function () {
    var orig = {
      id: 'orig2', tipoDocumento: 'TD01', stato: 'pagata',
      righe: [{ quantita: 2, prezzoUnitario: 150 }],
      ncIds: [], ncTotaleImporto: 0
    };
    var nc = {
      id: 'nc2', tipoDocumento: 'TD04', stato: 'inviata',
      fatturaOriginaleId: 'orig2',
      righe: [{ quantita: 1, prezzoUnitario: 300 }]
    };
    NC.applyNCToOriginal(nc, [orig, nc]);
    expect(orig.stato).toBe('stornata');
    expect(orig.ncTotaleImporto).toBe(300);
  });
});

// ─── applyNCToOriginal — storno parziale ──────────────────────────────────────

describe('FattureNCSync — storno parziale', function () {
  test('NC parziale (100 su 500) → ncTotaleImporto=100, stato resta inviata, tipoStorno=parziale', function () {
    var orig = {
      id: 'orig3', tipoDocumento: 'TD01', stato: 'inviata',
      righe: [{ quantita: 1, prezzoUnitario: 500 }],
      ncIds: [], ncTotaleImporto: 0
    };
    var nc = {
      id: 'nc3', tipoDocumento: 'TD04', stato: 'inviata',
      fatturaOriginaleId: 'orig3',
      righe: [{ quantita: 1, prezzoUnitario: 100 }]
    };
    NC.applyNCToOriginal(nc, [orig, nc]);
    expect(orig.ncTotaleImporto).toBe(100);
    expect(orig.stato).toBe('inviata');
    expect(nc.tipoStorno).toBe('parziale');
  });

  test('due NC parziali che sommano al totale → seconda NC porta a stornata', function () {
    var orig = {
      id: 'orig4', tipoDocumento: 'TD01', stato: 'pagata',
      righe: [{ quantita: 1, prezzoUnitario: 1000 }],
      ncIds: [], ncTotaleImporto: 0
    };
    var ncA = {
      id: 'nc4a', tipoDocumento: 'TD04', stato: 'inviata',
      fatturaOriginaleId: 'orig4',
      righe: [{ quantita: 1, prezzoUnitario: 400 }]
    };
    var ncB = {
      id: 'nc4b', tipoDocumento: 'TD04', stato: 'inviata',
      fatturaOriginaleId: 'orig4',
      righe: [{ quantita: 1, prezzoUnitario: 600 }]
    };
    var fatture = [orig, ncA, ncB];
    NC.applyNCToOriginal(ncA, fatture);
    expect(orig.stato).toBe('pagata');
    expect(ncA.tipoStorno).toBe('parziale');
    NC.applyNCToOriginal(ncB, fatture);
    expect(orig.ncTotaleImporto).toBe(1000);
    expect(orig.stato).toBe('stornata');
    expect(ncB.tipoStorno).toBe('totale');
  });
});

// ─── applyNCToOriginal — idempotenza ──────────────────────────────────────────

describe('FattureNCSync — idempotenza', function () {
  test('chiamate ripetute con stessa NC non duplicano l\'incremento', function () {
    var orig = {
      id: 'orig5', tipoDocumento: 'TD01', stato: 'inviata',
      righe: [{ quantita: 1, prezzoUnitario: 200 }],
      ncIds: [], ncTotaleImporto: 0
    };
    var nc = {
      id: 'nc5', tipoDocumento: 'TD04', stato: 'inviata',
      fatturaOriginaleId: 'orig5',
      righe: [{ quantita: 1, prezzoUnitario: 200 }]
    };
    var fatture = [orig, nc];

    var r1 = NC.applyNCToOriginal(nc, fatture);
    expect(r1.applied).toBe(true);
    expect(orig.ncTotaleImporto).toBe(200);

    var r2 = NC.applyNCToOriginal(nc, fatture);
    expect(r2.applied).toBe(false);
    expect(orig.ncTotaleImporto).toBe(200);
    expect(orig.ncIds.length).toBe(1);
    expect(orig.stato).toBe('stornata');
  });
});

// ─── applyNCToOriginal — arrotondamento ──────────────────────────────────────

describe('FattureNCSync — arrotondamenti', function () {
  test('importi decimali vengono arrotondati a 2 cifre', function () {
    var orig = {
      id: 'orig6', tipoDocumento: 'TD01', stato: 'inviata',
      righe: [{ quantita: 3, prezzoUnitario: 33.333 }],
      ncIds: [], ncTotaleImporto: 0
    };
    var nc = {
      id: 'nc6', tipoDocumento: 'TD04', stato: 'inviata',
      fatturaOriginaleId: 'orig6',
      righe: [{ quantita: 3, prezzoUnitario: 33.333 }]
    };
    NC.applyNCToOriginal(nc, [orig, nc]);
    // 3 * 33.333 = 99.999 → round2 → 100.00
    expect(orig.ncTotaleImporto).toBe(100);
    expect(nc.tipoStorno).toBe('totale');
  });

  test('soglia con margine: 999.99 NC su 1000.00 originale = totale (tolleranza 0.01)', function () {
    var orig = {
      id: 'orig7', tipoDocumento: 'TD01', stato: 'inviata',
      righe: [{ quantita: 1, prezzoUnitario: 1000 }],
      ncIds: [], ncTotaleImporto: 0
    };
    var nc = {
      id: 'nc7', tipoDocumento: 'TD04', stato: 'inviata',
      fatturaOriginaleId: 'orig7',
      righe: [{ quantita: 1, prezzoUnitario: 999.99 }]
    };
    NC.applyNCToOriginal(nc, [orig, nc]);
    // Delta = 0.01 ≤ tolleranza → totale
    expect(nc.tipoStorno).toBe('totale');
    expect(orig.stato).toBe('stornata');
  });

  test('delta oltre tolleranza: 999.98 NC su 1000.00 = parziale', function () {
    var orig = {
      id: 'orig8', tipoDocumento: 'TD01', stato: 'inviata',
      righe: [{ quantita: 1, prezzoUnitario: 1000 }],
      ncIds: [], ncTotaleImporto: 0
    };
    var nc = {
      id: 'nc8', tipoDocumento: 'TD04', stato: 'inviata',
      fatturaOriginaleId: 'orig8',
      righe: [{ quantita: 1, prezzoUnitario: 999.98 }]
    };
    NC.applyNCToOriginal(nc, [orig, nc]);
    expect(nc.tipoStorno).toBe('parziale');
    expect(orig.stato).toBe('inviata');
  });
});

// ─── isNCDateValid ────────────────────────────────────────────────────────────

describe('FattureNCSync.isNCDateValid — F4', function () {
  test('data NC >= data originale → true', function () {
    expect(NC.isNCDateValid('2026-03-15', '2026-03-15')).toBe(true);
    expect(NC.isNCDateValid('2026-04-01', '2026-03-15')).toBe(true);
  });

  test('data NC < data originale → false', function () {
    expect(NC.isNCDateValid('2026-03-14', '2026-03-15')).toBe(false);
  });

  test('data mancante → true (niente da validare)', function () {
    expect(NC.isNCDateValid(null, '2026-03-15')).toBe(true);
    expect(NC.isNCDateValid('2026-03-15', null)).toBe(true);
    expect(NC.isNCDateValid('', '')).toBe(true);
  });
});
